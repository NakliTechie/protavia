"""Driving FreeBindCraft from the bridge.

FreeBindCraft is a command line program: it reads a settings JSON, writes structures and three
CSV files into a run directory, and prints as it goes. This adapter is the translation between
that and the engine-agnostic contract in docs/bridge-contract.md.

What it deliberately does not do is install, fetch or configure anything. The engine is whatever
the person installed; this starts it and reads what it wrote.
"""

import csv
import json
import os
import shutil
import signal
import subprocess
import time
from pathlib import Path

ID = "freebindcraft"

# FreeBindCraft designs a miniprotein binder against a target chain. It has no nanobody, no
# single-chain antibody and no cyclic peptide mode; those belong to BindCraft2. Asking for one
# here is refused rather than quietly turned into a plain binder, because a design that is not
# what was asked for is worse than no design.
SUPPORTED_MODALITIES = {"binder"}


class Refused(Exception):
    """The request is one this engine cannot honour. The message is shown to the person."""


def translate(request, engine_path, run_dir):
    """Turn a contract request into FreeBindCraft's own settings file and argv.

    Raises Refused, with a sentence naming what this engine cannot do, rather than guessing.
    """
    modality = request.get("modality", "binder")
    if modality not in SUPPORTED_MODALITIES:
        raise Refused(
            f"FreeBindCraft designs miniprotein binders, not {modality}. "
            f"BindCraft2 does {modality}, and needs Linux and an NVIDIA card."
        )

    target = request.get("target") or {}
    pdb = target.get("path")
    if not pdb:
        raise Refused("A run needs a target structure: give target.path, a .pdb file on this machine.")
    pdb_path = Path(pdb).expanduser()
    if not pdb_path.exists():
        raise Refused(f"No such target structure: {pdb_path}")

    chain = target.get("chain")
    if not chain:
        raise Refused("A run needs target.chain, the chain to design against.")

    binder = request.get("binder") or {}
    lengths = binder.get("lengths") or [70, 70]
    if (len(lengths) != 2 or not all(isinstance(n, int) for n in lengths)
            or lengths[0] > lengths[1] or lengths[0] < 1):
        raise Refused("binder.lengths is two whole numbers, shortest first, for example [60, 100].")

    wanted = int(binder.get("count", 1))
    if wanted < 1:
        raise Refused("binder.count is how many accepted designs to stop at; it has to be at least 1.")

    hotspots = target.get("hotspots") or []
    settings = {
        "design_path": str(run_dir / "output"),
        "binder_name": request.get("name") or f"{pdb_path.stem}_{chain}",
        "starting_pdb": str(pdb_path.resolve()),
        "chains": chain,
        "target_hotspot_residues": ",".join(str(h) for h in hotspots),
        "lengths": lengths,
        "number_of_final_designs": wanted,
    }

    argv = ["./run_apple_silicon.sh", "--settings", str(run_dir / "settings.json")]

    advanced = request.get("advanced")
    if advanced:
        argv += ["--advanced", str((Path(engine_path) / advanced).resolve())]

    settings_source = request.get("settings") or {}
    if "seed" in settings_source:
        argv += ["--seed", str(int(settings_source["seed"]))]
    if "maxAttempts" in settings_source:
        argv += ["--max-attempts", str(int(settings_source["maxAttempts"]))]

    # ipSAE rather than i_pTM, because ranking on one structure's interface confidence is the
    # decision this project already took, and the engine computes it either way.
    argv += ["--rank-by", settings_source.get("rankBy", "ipSAE")]

    # Plots and animations are files nobody here reads, and animations need ffmpeg.
    argv += ["--no-plots", "--no-animations", "--verbose"]

    return settings, argv


def start(request, engine_path, run_dir, log_handle):
    """Write the settings and launch. Returns the Popen."""
    settings, argv = translate(request, engine_path, run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "settings.json").write_text(json.dumps(settings, indent=1))

    return subprocess.Popen(
        argv,
        cwd=str(engine_path),
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        # Its own process group, so stopping a run stops the whole tree and leaves nothing behind.
        start_new_session=True,
    )


def _rows(path):
    if not path.exists():
        return []
    try:
        with path.open(newline="") as handle:
            return list(csv.DictReader(handle))
    except (OSError, csv.Error):
        # A run writes these while we read them; a torn read is normal and not worth failing over.
        return []


def read(run_dir, wanted):
    """Progress and designs, read from what the engine has written so far.

    The engine appends to these as it goes, so this is live: the page can show work in progress
    rather than a spinner for forty minutes.
    """
    output = run_dir / "output"
    attempted = _rows(output / "trajectory_stats.csv")
    redesigned = _rows(output / "mpnn_design_stats.csv")
    accepted = _rows(output / "final_design_stats.csv")

    designs = []
    for row in accepted:
        designs.append({
            "rank": _number(row.get("Rank")),
            "sequence": row.get("Sequence") or "",
            "length": _number(row.get("Length")),
            # The engine computes ipSAE itself, which is the same quantity app/ipsae.js implements.
            "metrics": {
                key: _number(row.get(key))
                for key in ("ipSAE", "i_pTM", "pTM", "pLDDT", "i_pLDDT", "i_pAE", "pAE")
                if row.get(key) not in (None, "")
            },
            "structure": _accepted_structure(output, row),
        })

    return {
        "progress": {
            "attempted": len(attempted),
            "redesigned": len(redesigned),
            "accepted": len(accepted),
            "wanted": wanted,
        },
        "designs": designs,
    }


def _accepted_structure(output, row):
    """The ranked PDB for this design, as a path under the run directory, or None."""
    ranked = output / "Accepted" / "Ranked"
    if not ranked.is_dir():
        return None
    rank = row.get("Rank")
    if not rank:
        return None
    for candidate in sorted(ranked.glob(f"{int(float(rank))}_*.pdb")):
        return str(candidate)
    return None


def _number(value):
    if value in (None, ""):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    return int(number) if number.is_integer() else number
