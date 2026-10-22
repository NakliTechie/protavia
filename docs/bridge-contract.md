# The compute bridge: what the app writes and what it reads

Protavia's browser half can open a target and redesign a chain. It cannot run a binder design
loop, because that needs gradients through AlphaFold2 and no browser gives you those. The bridge
is how the page starts that work on a real machine and reads the results back.

This document is the contract between the two halves. It is written before the second engine
exists so that the first one does not quietly become the specification.

## Where it runs, and why that is not a preference

**The bridge serves the app.** Start it, open `http://127.0.0.1:8773/`, and that page is Protavia
with a bridge attached.

It has to be this way. A page on `https://protavia.naklitechie.com` cannot fetch `http://127.0.0.1`
at all: the browser rejects it in under a millisecond and no request reaches the server, because an
https page may not fetch http. The rule that makes localhost "potentially trustworthy" makes a
loopback *page* secure; it does not let a secure page reach out to one. Measured on 2026-10-22,
against a control: the same fetch from a page served on 127.0.0.1 returned 200 in 19 ms with the
request logged.

Sharing an origin removes the problem instead of working around it, and it costs the person
nothing they were not already doing. Anyone using the bridge has installed a design engine; one
local command is not what stops them.

The socket binds to loopback. Another machine on the network cannot reach it.

## What the bridge will not do

- **It never installs or ships an engine.** It looks for one and says what it found. BindCraft2's
  licence treats a preconfigured deployment as a way around its hosting restriction, and the
  exemption Protavia relies on is that the person running it installed the engine themselves.
  See [`compute-licences.md`](compute-licences.md).
- **It never runs an engine on anyone else's behalf.** One machine, one person, their own install.
- **It never hides whose machine the work is on.** Every run names its host on screen.

## Routes

`GET /bridge/health` — what this machine is and what it has. **Implemented.**

```json
{
  "bridge": "protavia",
  "version": "0.1.0",
  "host": { "name": "...", "platform": "macOS 25.5.0", "machine": "arm64", "cpus": 14 },
  "engines": [
    { "id": "freebindcraft", "label": "FreeBindCraft", "present": true, "installed": false,
      "path": "/Users/you/Code/FreeBindCraft", "runsHere": true,
      "why": "Found at ..., but not ready to run: params/params_model_1_ptm.npz is missing." }
  ],
  "runs": []
}
```

Three fields, and they mean different things. `present` is whether the files are here. `installed`
is whether it could actually run, which means every file a run needs: for FreeBindCraft, the
virtual environment's interpreter **and** the AlphaFold weights. `runsHere` is whether this machine
could run it at all — false for BindCraft2 and BioEmu2 on macOS, because both need Linux and an
NVIDIA card. Anything short of ready always says `why`, naming what is missing.

`present` and `installed` are separate because conflating them promises a run that cannot start.
The installer creates the virtual environment within a minute and downloads the weights last, so
for most of an installation the checkout has every source file and no means of running them.

The three routes below are **implemented**. No design run has completed through them yet.

`POST /bridge/runs` — start one. The body is engine-agnostic; the adapter translates.

```json
{
  "engine": "freebindcraft",
  "modality": "binder",
  "target": { "path": "/Users/you/targets/1ubq.pdb", "chain": "A", "hotspots": [54, 56, 66] },
  "binder": { "lengths": [60, 100], "count": 10 },
  "settings": { "seed": 42, "maxAttempts": 1, "rankBy": "ipSAE" }
}
```

A request this engine cannot honour comes back as 400 with a sentence naming what it cannot do,
not a guess. `modality: "nanobody"` is refused and says BindCraft2 does that and needs Linux and an
NVIDIA card. The alternative — quietly designing a plain binder instead — would be worse than no
design.

Returns `{ "runId": "..." }`. The app holds the run id and nothing else; the bridge owns the run.

`GET /bridge/runs/<id>` — where it has got to.

```json
{
  "runId": "...", "engine": "freebindcraft", "state": "running",
  "startedAt": "...", "host": "...",
  "progress": { "attempted": 41, "accepted": 3, "wanted": 10 },
  "designs": [ { "sequence": "...", "pae": [[...]], "metrics": { } } ],
  "log": ["..."]
}
```

`state` is one of `queued`, `running`, `done`, `failed`, `stopped`. `designs` grows as the run
accepts them, so the page can show work in progress rather than a spinner for forty minutes.

FreeBindCraft computes ipSAE itself and can rank by it, so `metrics.ipSAE` arrives with each
design and the bridge asks for that ranking by default. The full predicted aligned error matrix,
which is what `app/ipsae.js` takes, is in the engine's pickle files; reading it is not written yet,
because no run has produced one to read.

`DELETE /bridge/runs/<id>` — stop it. A run started here is stoppable from here.

## What an adapter owes

One adapter per engine, each a module the bridge loads. It must:

1. **Say where its engine is**, or that it is absent, in a sentence that names the next step.
2. **Translate the run request** into that engine's own settings, and refuse clearly rather than
   guessing when the request asks for something the engine cannot do. BindCraft2 designs
   nanobodies and cyclic peptides; FreeBindCraft does not. An adapter that silently designed
   something else would be worse than one that said no.
3. **Report progress in the shared shape**, whatever the engine prints.
4. **Return designs with their error matrices**, so scoring is the same arithmetic whichever
   engine produced them.
5. **Stop when asked**, and leave no process behind.

The first adapter is FreeBindCraft, because it is the only one of the three that runs on an Apple
Silicon Mac. The contract has to survive BindCraft2 and BioEmu2 being added by someone who has a
Linux machine with an NVIDIA card, which is why it is written down now rather than after.

## Open, and needing a decision

A run needs AlphaFold2 weights, which are several gigabytes, and FreeBindCraft's own ubiquitin
example took 39.7 minutes on an M2 with 5.23 GiB of memory and accepted no design. Nothing in this
repository installs any of that. Whether to install it here, and where the weights go, is a
decision with disk and time attached.
