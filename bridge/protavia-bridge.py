#!/usr/bin/env python3
"""Protavia's compute bridge: serves the app, and talks to a design engine on this machine.

    python3 bridge/protavia-bridge.py

Then open http://127.0.0.1:8773/. That page is the same Protavia as the hosted site, with one
difference: it can see this bridge, so it can start a design run here.

Why the bridge serves the app rather than the hosted site calling a local server. A page on
https://protavia.naklitechie.com cannot fetch http://127.0.0.1 at all; the browser rejects it
before any request is made, because an https page may not fetch http. The rule that makes
localhost "potentially trustworthy" makes a loopback *page* secure, it does not let a secure page
reach out to one. Measured on 2026-10-22: rejected in under a millisecond from the hosted site,
with nothing reaching the server, against 19 milliseconds and a logged request from a page served
here. Sharing an origin removes the problem rather than working around it.

Nothing is exposed off this machine. The socket binds to the loopback address only, so another
computer on the same network cannot reach it even if it knows the port.

This file has no dependencies beyond the Python standard library, on purpose: the people who run it
have already installed an engine, and one more environment to get right is one too many.
"""

import argparse
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

VERSION = "0.1.0"
APP_ROOT = Path(__file__).resolve().parent.parent

# --- Engines -------------------------------------------------------------------------------------
#
# An engine is described here and driven by an adapter. Only the description and the "is it here"
# check live in this file; what a run actually looks like belongs to the adapter, because the three
# engines disagree about almost everything except that they take a target and return designs.
#
# Protavia never installs an engine and never ships one. BindCraft2's licence treats a
# preconfigured deployment as a way around its hosting restriction, and the exemption Protavia
# relies on is that the person running it installed the engine themselves. So this file looks for
# an engine and reports what it found; it does not fetch, build or configure one.
# See docs/compute-licences.md.

ENGINES = [
    {
        "id": "freebindcraft",
        "label": "FreeBindCraft",
        "home": "https://github.com/cytokineking/FreeBindCraft",
        "runs_here": True,
        "note": "MIT. Runs on Apple Silicon. The design loop backpropagates through AlphaFold2.",
        # The repository root, however the person laid it out.
        "marker": "functions/biopython_utils.py",
        "env": "FREEBINDCRAFT_HOME",
        "guesses": ["~/Code/FreeBindCraft", "~/FreeBindCraft", "~/src/FreeBindCraft"],
    },
    {
        "id": "bindcraft2",
        "label": "BindCraft2",
        "home": "https://github.com/PacesaLab/BindCraft2",
        # Its own installation guide says Linux and an NVIDIA card, and refuses a CPU install.
        "runs_here": platform.system() == "Linux",
        "note": "Source-available. Needs Linux and an NVIDIA card; there is no CPU installation.",
        "marker": "install.sh",
        "env": "BINDCRAFT2_HOME",
        "guesses": ["~/Code/BindCraft2", "~/BindCraft2"],
    },
    {
        "id": "bioemu2",
        "label": "BioEmu2",
        "home": "https://github.com/microsoft/bioemu2",
        "runs_here": platform.system() == "Linux",
        "note": "MIT. Ensembles and dynamics rather than a design loop. Linux and NVIDIA only.",
        "marker": "pyproject.toml",
        "env": "BIOEMU2_HOME",
        "guesses": ["~/Code/bioemu2", "~/bioemu2"],
    },
]


def os_name():
    """What a person calls this operating system. `platform.system()` says Darwin for macOS."""
    return {"Darwin": "macOS", "Windows": "Windows", "Linux": "Linux"}.get(
        platform.system(), platform.system()
    )


def find_engine(spec):
    """Where this engine is, or None. The environment variable wins over any guess."""
    named = os.environ.get(spec["env"])
    candidates = [named] if named else []
    candidates += spec["guesses"]
    for raw in candidates:
        if not raw:
            continue
        path = Path(raw).expanduser()
        if (path / spec["marker"]).exists():
            return path
    return None


def describe_engines():
    """What this machine has, said plainly enough to act on."""
    out = []
    for spec in ENGINES:
        found = find_engine(spec)
        row = {
            "id": spec["id"],
            "label": spec["label"],
            "home": spec["home"],
            "note": spec["note"],
            "installed": found is not None,
            "path": str(found) if found else None,
            "runsHere": spec["runs_here"],
        }
        if not spec["runs_here"]:
            row["why"] = f"Will not run on {os_name()}. {spec['note'].split('. ', 1)[-1]}"
        elif found is None:
            row["why"] = (
                f"Not found here. Install it yourself, then point {spec['env']} at it or put it "
                f"in one of: {', '.join(spec['guesses'])}."
            )
        out.append(row)
    return out


def describe_host():
    """The machine the run would happen on, named so the person never has to guess."""
    return {
        "name": socket.gethostname(),
        "platform": f"{os_name()} {platform.release()}",
        "machine": platform.machine(),
        "python": platform.python_version(),
        "cpus": os.cpu_count(),
    }


# --- The server ----------------------------------------------------------------------------------


class Bridge(SimpleHTTPRequestHandler):
    """Serves the app from the repository root, and the bridge's own routes under /bridge/."""

    # Keeps the app's module imports fast; the default 0.9 closes a connection per file.
    protocol_version = "HTTP/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_ROOT), **kwargs)

    def _json(self, payload, status=200):
        body = json.dumps(payload, indent=1).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        # Same origin as the page it serves, so no cross-origin header is needed or wanted.
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/bridge/health":
            self._json(
                {
                    "bridge": "protavia",
                    "version": VERSION,
                    "host": describe_host(),
                    "engines": describe_engines(),
                    "runs": [],
                }
            )
            return
        if self.path.startswith("/bridge/"):
            self._json({"error": f"No bridge route {self.path}."}, status=404)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        # One line per bridge call; serving the app's own files would drown it.
        if self.path.startswith("/bridge/"):
            sys.stderr.write(f"  {self.command} {self.path}\n")


def main():
    parser = argparse.ArgumentParser(description="Serve Protavia and bridge to a design engine.")
    # 8773 rather than a rounder number because a busy port is a confusing first
    # experience, and the usual suspects are usually busy.
    parser.add_argument("--port", type=int, default=8773)
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Loopback by default. Changing this exposes the bridge to your network.",
    )
    args = parser.parse_args()

    engines = describe_engines()
    ready = [e for e in engines if e["installed"]]

    print(f"Protavia bridge {VERSION}")
    print(f"  app:    http://{args.host}:{args.port}/")
    print(f"  health: http://{args.host}:{args.port}/bridge/health")
    print(f"  host:   {describe_host()['name']} "
          f"({os_name()} {platform.machine()}, {os.cpu_count()} cores)")
    if ready:
        for e in ready:
            print(f"  engine: {e['label']} at {e['path']}")
    else:
        print("  engine: none found. Protavia still works; a design run needs one.")
        for e in engines:
            if e["runsHere"]:
                print(f"          {e['label']}: {e['why']}")
    if args.host != "127.0.0.1":
        print(f"  WARNING: bound to {args.host}, so other machines on your network can reach this.")
    print("  Ctrl-C to stop.")

    try:
        server = ThreadingHTTPServer((args.host, args.port), Bridge)
    except OSError as e:
        # Say which port and what to do, rather than a stack trace about a socket.
        print(f"\n  Could not take port {args.port}: {e.strerror}.")
        print(f"  Something else is already listening there. Try --port {args.port + 1}.")
        raise SystemExit(1)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
