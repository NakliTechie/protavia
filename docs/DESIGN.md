# Design notes (scaffold, 2026-10-20)

Few decisions are made. Each states where it comes from or that it is unverified.

## The compute split
FreeBindCraft's design loop runs hundreds of gradient steps through AlphaFold2 multimer. Source: its README and `APPLE_SILICON.md`. On an Apple M2 (24 GiB) the small ubiquitin example took 39.7 minutes with 5.23 GiB and accepted no design. So:

| Tier | What | Where |
|---|---|---|
| 0 | view a target, redesign sequences with ProteinMPNN, score with ipSAE, filter and rank | browser only |
| 1 | the AlphaFold2 design loop | a Mac (FreeBindCraft's Apple Silicon launcher) or a rented GPU; the browser sends settings and reads results |
| 2 | the design loop inside the browser | research; not planned |

## WebGPU and WebNN
- **WebGPU** is the general GPU compute API. NakliOS already runs LocalMind models on it (`aiProvider: custom-webgpu` in `docs/app-contract.md` of the nakliOS repo). A custom engine could use it for anything, including gradients, at the cost of writing the kernels and the backward pass.
- **WebNN** is a W3C neural-network graph API for inference. It is in Chrome origin trial in 2026 (reported from search results, not tested here); CPU works across platforms, GPU and NPU support is narrower; ONNX Runtime Web has an opt-in WebNN provider, and unsupported operators fall back to WebAssembly. It has no automatic differentiation, so it cannot run the design loop by itself.
- **Use:** ProteinMPNN inference through ONNX Runtime Web, with the WebGPU provider first and WebNN as an option to measure. Not verified: Safari and Firefox support for either API at the versions we target.

### Measured on 2026-10-20 (Chrome in the Claude desktop browser pane, macOS)

ProteinMPNN `v_48_020` runs in the browser on both providers, through ONNX Runtime Web 1.24.3.

| | WebGPU | WebAssembly (1 thread) |
|---|---|---|
| 3 sequences, ubiquitin chain A (76 residues) | 2.2 s | 2.9 s |
| 2 sequences, barstar chain D in the 6-chain complex (87 residues) | 6.1 s | not run |

Those two rows were taken while a Chromium build was compiling on the same machine. Repeated on an
otherwise idle machine at 14:20, against the deployed site, the same runs took **0.6 s** and
**2.8 s** on WebGPU. So the figures above are roughly twice the uncontended cost, and none of these
numbers is a benchmark. What did not change under load is the output: every run returned
character-identical sequences and identical scores.

Both providers returned **character-identical sequences and identical scores** for seed 42 at
temperature 0.1. That is agreement on one structure, not a parity suite; the upstream library's own
216 ONNX-against-PyTorch numerical checks are the real parity evidence, and its authors could not
run WebGPU at all in their environment, so this is the first WebGPU execution recorded for it.

Timings are a single observation each on one machine, not a benchmark. WebGPU's advantage here is
small because the proteins are small and the decode is autoregressive. WebNN remains unmeasured.

## Browser-side pieces
- ProteinMPNN: ONNX bundles exist on Hugging Face (`MurrellLab/webports`, ProteinMPNN, solubleMPNN, CA-only). Check licence and quality against the PyTorch original before relying on them.
- ipSAE: arithmetic on a predicted aligned error matrix (Dunbrack et al., 2025). Needs the matrix from the compute host.
- Shape complementarity (`sc-rs`) and surface area (FreeSASA): small compiled libraries that could target WebAssembly; unverified.
- OpenMM relaxation: no WebAssembly build found; leave on the compute host.

## Not in scope yet
The design loop in the browser, MD simulation, wet-lab handoff, sharing designs, AI chat.
