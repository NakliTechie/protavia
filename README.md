# Ligella

A NakliOS app for designing protein binders. The browser holds the control room: load a target, set up a run, review and score the designs. The heavy AlphaFold2 design loop runs on a Mac or a rented GPU.

**Status: scaffold.** Folder, plan and page shell exist. No design code exists yet. See `plan/workplan.md`.

## Install

Nothing to install. Serve the folder and open it:

```
cd ~/Code/ligella && python3 -m http.server 8000
```

Then open `http://localhost:8000/`. Today it shows an empty workspace. TODO: replace this section with the hosted link once published, and with the NakliOS window steps once it is listed in `NakliTechie/nakliOS` `apps/manifest.json`.

## What it will do

- **In the browser:** show a target structure, redesign binder sequences with ProteinMPNN (ONNX, on WebGPU), score interfaces (ipSAE from the predicted error matrix), filter and rank designs.
- **On a compute host:** run the [FreeBindCraft](https://github.com/cytokineking/FreeBindCraft) design loop, which backpropagates through AlphaFold2. The app writes the run settings, starts the job and reads the results back.

Why the split: see `docs/DESIGN.md`. In short, the design loop needs gradients through AlphaFold2, which no browser API provides today.

## Context

Chirag asked on 2026-10-20 whether FreeBindCraft could run as a browser app in NakliOS, then asked for a scaffold, with the design to be discussed. The vault note is `knowledge/sources/2026-10-20-cytokineking-freebindcraft-repo.md`.

## Layout

| Path | What |
|---|---|
| `index.html` | the app shell (one page, no framework) |
| `docs/DESIGN.md` | the compute split, WebGPU and WebNN, and what is unverified |
| `AGENTS.md` | rules for agents working in this repo |
| `plan/` | history, pending and workplan (kept outside git) |

## Licence

Code: MIT (`LICENSE`). FreeBindCraft and BindCraft are MIT; model weights (AlphaFold2 parameters, ProteinMPNN) carry their own licences, to be recorded when they are added.
