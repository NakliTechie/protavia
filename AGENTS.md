# Agent notes for Protavia

Tier: **Tool** (one app, one page). It gains a compute host; if that host becomes a service others use, re-tier in writing.

## Rules
- Single page, native ES modules, no build step, no CDN at runtime. Vendored libraries are pinned in `vendor/` with licences and model weights recorded with their licences.
- Data stays on the user's disk. Target structures and designs go to a compute host only when the user starts a run, and the app says which host.
- The compute bridge serves the app as well as its own routes, because an https page cannot fetch
  `http://127.0.0.1`. It never installs, ships or bundles an engine: the licence Protavia relies on
  turns on the person having installed it themselves. See `docs/bridge-contract.md`.
- Plan lives in `plan/` (a symlink outside git). Read `plan/pending.md` first.
- Tests are Node's own runner, no dependencies: `node --test tests/*.test.mjs`. They cover the
  pure parts — the ipSAE arithmetic, the structure walk, sequence recovery, the ranking table's
  columns and filters, the command manifest, and whether the NakliOS mirror list is current.

## Verification budget
- No tests, evals or diagnostics between implementation steps. Build the whole batch, then check once at the batch boundary. A batch is one capability family, about a day of work, and closes early past that.
- Run only the checks that cover the changed batch. Never repeat an unchanged suite.
- All generated test data goes to one temp directory (`tmp/`), capped at 5,000 files and 500 MB, preferring one aggregate file to many, deleted on success, failure and interrupt.
- One diagnostic batch per failure. No new diagnostic script without a written hypothesis.
- No new process tooling (receipts, provenance, locks) until a feature it gates exists.
- Log anything over 50 MB or 1,000 files when it is created, so `/tidy-nt` can clear it.
