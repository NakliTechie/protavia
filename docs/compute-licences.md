# Licences of the engines Protavia can drive

Protavia itself is MIT. The design engines it starts are separate programs with their own terms,
and one of them restricts how it may be offered to other people. That restriction shapes the
compute bridge, so it is recorded here rather than discovered later.

## BindCraft2 — source-available, hosting-restricted

Repository: https://github.com/PacesaLab/BindCraft2 · Licence: "BindCraft2 Source-Available
License (Hosting-Restricted)", copyright 2026 Martin Pacesa, University of Zurich, and the
BindCraft2 contributors. Read on 2026-10-21 from the repository's `LICENSE` on `main`.

**What it permits without asking anyone.** Use for any purpose including commercial drug
discovery, modification, derivative works, and redistributing the source or binaries for other
people to run themselves. Running it locally, on private infrastructure, or on infrastructure run
for the sole benefit of the using organisation. Giving the designs it produces to other people,
free or for a fee.

**What it forbids without a separate written commercial licence.** Providing the software, or a
service whose material functionality comes from it, to third parties as a hosted, managed, cloud,
API, web application, workflow platform or software-as-a-service offering. The licence extends
this explicitly to making it available as an invocable tool, plugin, agent action, connector or
workflow step inside a hosted platform, so that third parties can run it without installing it.

**The exemption Protavia relies on.** The licence says that restriction does not apply where a
third party has "installed the Software themselves, or on infrastructure operated for their sole
benefit", and directs it through their own tooling.

## What this means for Protavia's compute bridge

**Who the user is, decided 2026-10-22: whoever installs the engine on their own machine.** Protavia
is the control room. The person using it installs the engine themselves, on hardware they operate,
and Protavia writes the run settings and reads the results back.

That is the exemption quoted above, so BindCraft2 needs no commercial licence here and the engine
is chosen on the science rather than on the terms.

Three rules follow, and none of them is optional.

1. **Protavia never runs an engine on hardware Chirag operates, for anyone else.** That is the
   hosted service the licence forbids, whatever the interface looks like.
2. **Protavia never ships or bundles a preconfigured engine** — no container, no virtual machine
   image, no installer that arrives ready to run. The licence names that explicitly as an attempt
   to get around the restriction. The app may link to the engine's own installation guide, and
   that is as far as it goes.
3. **The interface names the host on screen, every time a run starts.** The user should never have
   to guess whose machine their work is on.

The same three rules keep Protavia a Tool rather than a Product under the project's tiering.
Running the engine for other people would be a deliberate re-tier decided in writing, plus a
commercial licence from the BindCraft2 authors.

## Everything underneath, checked on 2026-10-22

Nothing below BindCraft2 restricts hosting, so no part of the stack rules an engine out.

| Layer | Licence | Hosting restriction |
|---|---|---|
| [AlphaFold2](https://github.com/google-deepmind/alphafold) code | Apache 2.0 | none |
| AlphaFold2 model parameters | CC BY 4.0 | none |
| [ColabDesign](https://github.com/sokrypton/ColabDesign), the backpropagation machinery | Beer-ware | none |
| [BindCraft](https://github.com/martinpacesa/BindCraft) version 1 | MIT | none |
| [FreeBindCraft](https://github.com/cytokineking/FreeBindCraft) | MIT | none |
| [BindCraft2](https://github.com/PacesaLab/BindCraft2) | Source-available | as above, exemption applies |

The model parameters are the layer worth naming: they are CC BY 4.0, not a non-commercial licence,
so they place no limit of their own on what the bridge may do.

BioEmu2's terms are not read here yet. The engine choice is recorded in the workplan.

Licence texts were read from the repositories themselves: BindCraft version 1 and BindCraft2 on
2026-10-21, the rest of the table on 2026-10-22. This is a record of what they say, not legal
advice.
