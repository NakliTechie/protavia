# Listing Protavia in NakliOS

Everything here is a change to `NakliTechie/nakliOS`, not to this repository. It is written out in
advance because the vocella session has a change in flight touching the same two places, and we
agreed theirs lands first and this one rebases on it rather than racing.

## 1. The catalog entry, in `index.html`

Add to the `APPS` array, following the shape the other entries use. `url` is the standalone site and
`embedUrl` is the same-origin mirror.

```js
{ id:'protavia', name:'Protavia', url:'https://protavia.naklitechie.com/', embedUrl:'./apps/protavia/', glyph:'🧬', bg:'ok',
  description:'Design protein binders in the browser. Load a target structure, redesign a chain with ProteinMPNN on your own GPU, and compare the result against the natural sequence. The structure never leaves your machine.', tags:['science','biology','research','ai'],
  svg:`<path d="M8 3c0 4 8 6 8 9s-8 5-8 9"/><path d="M16 3c0 4-8 6-8 9s8 5 8 9"/><line x1="9.2" y1="7" x2="14.8" y2="7"/><line x1="9.2" y1="17" x2="14.8" y2="17"/>` },
```

Then add `'protavia'` to the `fld-research` folder's `apps` list ("Think & Research", which already
holds mantra, babellocal, localmind, vaultmind and sansadlocal). It is research software, so that is
its home rather than "Work & Build".

## 2. The mirror entry, in `apps/manifest.json`

The entry is generated and kept at [`naklios-manifest-entry.json`](naklios-manifest-entry.json) in
this repository: 28 files, 14.4 MiB in total, the largest 5.0 MiB. Paste it into the `apps` array.

**What is deliberately absent:** `vendor/onnxruntime-web/`. naklios.dev is Cloudflare Pages, which
caps a single file at 25 MiB, and that directory holds a 25.93 MiB WebAssembly binary. The mirror
cannot carry it. Inside the host, `app/design.js` loads the runtime from
`https://protavia.naklitechie.com/vendor/onnxruntime-web/1.24.3/` instead, and Protavia's Worker
sends `access-control-allow-origin` on those paths so the cross-origin fetch is allowed. Every other
file is mirrored and loaded relatively, so the same build works at `/` and at `/apps/protavia/`.

`app/ipsae.js` is listed even though nothing imports it yet. It is the interface score, and it will
be wired in; listing it now means the mirror does not quietly break on the commit that wires it.

## 3. Seed and check

```sh
GITHUB_TOKEN=$(gh auth token) node scripts/sync-mirrors.mjs --app protavia
node scripts/validate-mirrors.mjs
node scripts/test-app-catalog.mjs
node scripts/test-app-inventory.mjs
node scripts/test-immersive-apps.mjs
node scripts/test-app-info.mjs
node scripts/audit-app-inventory.mjs
```

Then serve the nakliOS checkout with a plain `python3 -m http.server`, which matches production.
Do not use `scripts/serve-coi.mjs`: it adds cross-origin-isolation headers that block cross-origin
frames, and Protavia deliberately fetches its runtime cross-origin. Open the app with
`openApp(APPS.find(a => a.id === 'protavia'))`, run `nakliOS.launchDiagnostics()`, and check there is
no horizontal overflow in the 978x604 window.

Protavia has been checked at that size already, served from a `/apps/protavia/` subpath: the layout
holds, and it loads 1UBQ and designs chain A on WebGPU in about a second.

## 4. The token, only while the repository is private

Not needed. `NakliTechie/protavia` is public, so the six-hourly mirror sync can read it without
being added to the `naklios-mirror-sync` fine-grained token. If it is ever made private again, it
has to go on that token or the sync will skip it with a 404.
