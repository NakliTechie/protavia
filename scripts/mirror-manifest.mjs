#!/usr/bin/env node
// Writes docs/naklios-manifest-entry.json: the list of files the NakliOS mirror must carry.
//
// This exists because the hand-written list went stale once and the app stopped booting inside the
// host with no error anyone saw: two modules had been added after the list was generated, so the
// import chain broke at the first missing file. The list is now derived from the imports
// themselves, so adding a module cannot silently leave it out.
//
// Run after adding or removing any file the page loads:
//   node scripts/mirror-manifest.mjs
// It prints what changed and exits 1 when the committed file is out of date, so a check can use it.

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/naklios-manifest-entry.json';

// naklios.dev is Cloudflare Pages and caps a single file at 25 MiB. This one binary is 25.93 MiB,
// so the mirror cannot carry it and app/design.js fetches it from protavia.naklitechie.com.
const TOO_BIG_FOR_PAGES = 'vendor/onnxruntime-web/1.24.3/ort-wasm-simd-threaded.asyncify.wasm';

/** Files the page needs that no import or href names. */
const EXTRA = [
  'LICENSE',
  'vendor/README.md',
  'vendor/molstar/5.13.1/LICENSE',
  'vendor/proteinmpnn-web/0.1.0-10849c13/LICENSE',
  'vendor/proteinmpnn-web/0.1.0-10849c13/THIRD_PARTY_NOTICES.md',
  'vendor/onnxruntime-web/1.24.3/LICENSE',
  // The runtime loads its own WebAssembly glue by name at run time, so no import names it.
  'vendor/onnxruntime-web/1.24.3/ort-wasm-simd-threaded.asyncify.mjs',
  // app/ipsae.js is listed before anything imports it, so the mirror does not break on the commit
  // that wires it in.
  'app/ipsae.js',
];

const seen = new Set();
const order = [];

function add(path) {
  const p = normalize(path).replace(/^\.\//, '');
  if (seen.has(p) || p === TOO_BIG_FOR_PAGES) return;
  if (!existsSync(join(ROOT, p))) throw new Error(`Needed but missing: ${p}`);
  seen.add(p);
  order.push(p);
  if (/\.m?js$/.test(p)) walkModule(p);
  if (/\.json$/.test(p) && /\/(proteinmpnn|solublempnn)\//.test(p)) walkManifest(p);
}

/** Relative `import`/`export from` specifiers, and dynamic `import('…')`. */
function walkModule(p) {
  const text = readFileSync(join(ROOT, p), 'utf8');
  const here = dirname(p);
  const specifiers = [
    ...text.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"](\.[^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  for (const spec of specifiers) add(join(here, spec));
}

/** A weights manifest names the four files the checkpoint is made of. */
function walkManifest(p) {
  const here = dirname(p);
  const json = JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
  const names = new Set();
  const collect = (v) => {
    if (typeof v === 'string' && /\.(onnx|bin)$/.test(v)) names.add(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  collect(json);
  for (const n of names) add(join(here, n));
  for (const extra of ['LICENSE.ProteinMPNN', 'THIRD_PARTY_NOTICES.md']) {
    if (existsSync(join(ROOT, here, extra))) add(join(here, extra));
  }
}

// Start from the page: its stylesheets, its scripts, its import map, and the model manifests the
// catalog names.
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
add('index.html');
for (const m of html.matchAll(/(?:src|href)="(?!https?:|#)([^"]+)"/g)) add(m[1]);
const importMap = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (importMap) for (const v of Object.values(JSON.parse(importMap[1]).imports)) add(v);

for (const m of readFileSync(join(ROOT, 'app/design.js'), 'utf8')
  .matchAll(/manifest:\s*'([^']+)'/g)) add(m[1]);

for (const p of EXTRA) add(p);

const files = order.map((source) => ({ source, destination: source }));
const entry = { id: 'protavia', repo: 'NakliTechie/protavia', ref: 'main', files };
const text = `${JSON.stringify(entry, null, 2)}\n`;

const before = existsSync(join(ROOT, OUT)) ? readFileSync(join(ROOT, OUT), 'utf8') : '';
const bytes = order.reduce((n, p) => n + statSync(join(ROOT, p)).size, 0);
const largest = order.reduce((a, p) => Math.max(a, statSync(join(ROOT, p)).size), 0);

if (before === text) {
  console.log(`${OUT} is up to date: ${files.length} files, ${(bytes / 2 ** 20).toFixed(1)} MiB.`);
  process.exit(0);
}

const had = before ? new Set(JSON.parse(before).files.map((f) => f.source)) : new Set();
for (const p of order) if (!had.has(p)) console.log(`+ ${p}`);
for (const p of had) if (!seen.has(p)) console.log(`- ${p}`);

writeFileSync(join(ROOT, OUT), text);
console.log(`Wrote ${OUT}: ${files.length} files, ${(bytes / 2 ** 20).toFixed(1)} MiB, `
  + `largest ${(largest / 2 ** 20).toFixed(1)} MiB.`);
process.exit(1);
