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

Protavia is a web application, and the bridge starts a design run. If the bridge started a run on
a machine Chirag operates, on behalf of someone else, that is a hosted service under the clause
above and needs a commercial licence.

So the rule is: **the bridge drives a machine the person running it installed the engine on
themselves.** The app writes run settings and reads results back; it never operates the engine for
anyone else. The interface names the host on screen, every time, so this is visible rather than
assumed.

The same rule is what keeps Protavia a Tool rather than a Product under the project's tiering.
Running the engine for other people would be a deliberate re-tier decided in writing, plus a
commercial licence from the BindCraft2 authors. One rule settles both questions, which is why it
is not revisited per engine.

## The other two candidate engines

| Engine | Licence | Hosting restriction |
|---|---|---|
| [FreeBindCraft](https://github.com/cytokineking/FreeBindCraft) | MIT | none |
| [BindCraft](https://github.com/martinpacesa/BindCraft) (version 1) | MIT | none |
| [BindCraft2](https://github.com/PacesaLab/BindCraft2) | Source-available, hosting-restricted | as above |

BioEmu2 is also under consideration and its terms are not yet read here; the engine choice is open
and recorded in the workplan.

Licence texts for BindCraft version 1 and BindCraft2 were read from their repositories on
2026-10-21. This is a record of what they say, not legal advice.
