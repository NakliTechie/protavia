# Ligella

A NakliOS app for designing protein binders. The browser holds the control room: load a target, set up a run, review and score the designs. The heavy AlphaFold2 design loop runs on a Mac or a rented GPU.

**Status: early.** Open a structure from disk or fetch one by PDB ID, see it rendered, read a summary
of its chains and sequences, and redesign a chain's sequence with ProteinMPNN running in the browser.
Scoring, ranking and the compute bridge are not built. See `plan/workplan.md`.

## Install

Nothing to install. Serve the folder and open it:

```
cd ~/Code/ligella && python3 -m http.server 8000
```

Then open `http://localhost:8000/` and drop in a `.pdb`, `.cif` or `.bcif` file, or type a PDB ID.
Gzipped files work too. TODO: replace this section with the hosted link once published, and with the
NakliOS window steps once it is listed in `NakliTechie/nakliOS` `apps/manifest.json`.

To check the viewer against known values, load `1ubq` and `1brs` by ID. Ubiquitin reads as 1 chain,
76 residues, 660 atoms; barnase-barstar as 6 chains (3 × 110 and 3 × 89 residues) and 5,153 atoms.
Those match `grep -c '^ATOM\|^HETATM'` on the files from rcsb.org.

To check the redesign, load `1ubq`, pick chain A, keep temperature 0.1 and seed 42, and press
**Redesign backbone**. Three sequences come back at 52.6%, 53.9% and 59.2% identity to native,
which is the published range for ProteinMPNN given only a backbone. The same seed gives the same
sequences on WebGPU and on WebAssembly.

## What it will do

- **In the browser:** show a target structure and redesign sequences with ProteinMPNN (ONNX, on WebGPU) — both working today — then score interfaces (ipSAE from the predicted error matrix), filter and rank designs.
- **On a compute host:** run the [FreeBindCraft](https://github.com/cytokineking/FreeBindCraft) design loop, which backpropagates through AlphaFold2. The app writes the run settings, starts the job and reads the results back.

Why the split: see `docs/DESIGN.md`. In short, the design loop needs gradients through AlphaFold2, which no browser API provides today.

## Context

Chirag asked on 2026-10-20 whether FreeBindCraft could run as a browser app in NakliOS, then asked for a scaffold, with the design to be discussed. The vault note is `knowledge/sources/2026-10-20-cytokineking-freebindcraft-repo.md`.

## Layout

| Path | What |
|---|---|
| `index.html` | the app shell (one page, no framework) |
| `app/` | native ES modules: viewer wrapper, structure summary, status strip, wiring |
| `vendor/` | pinned libraries with their licences and file hashes (`vendor/README.md`) |
| `docs/DESIGN.md` | the compute split, WebGPU and WebNN, and what is unverified |
| `AGENTS.md` | rules for agents working in this repo |
| `plan/` | history, pending and workplan (kept outside git) |

## Licence

Code: MIT (`LICENSE`). Mol*, the vendored structure viewer, is MIT. FreeBindCraft and BindCraft are
MIT; model weights (AlphaFold2 parameters, ProteinMPNN) carry their own licences, to be recorded in
`vendor/README.md` when they are added.
