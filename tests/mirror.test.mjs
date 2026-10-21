// The NakliOS mirror's file list.
//
// This list going stale once meant the app stopped booting inside the host with no visible error:
// two modules written after the list was made were missing, and the import chain broke at the
// first one. The list is now derived by walking the page's own imports, and this test fails when
// the committed file no longer matches what that walk produces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'docs/naklios-manifest-entry.json');

test('the committed mirror list matches the page’s imports', () => {
  const before = readFileSync(ENTRY, 'utf8');
  let output;
  try {
    output = execFileSync('node', ['scripts/mirror-manifest.mjs'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    // The script rewrites the file and exits 1 when it was out of date, so put it back and report
    // what changed rather than leaving the working tree edited by a test.
    const after = readFileSync(ENTRY, 'utf8');
    execFileSync('git', ['checkout', '--', 'docs/naklios-manifest-entry.json'], { cwd: ROOT });
    assert.fail(`docs/naklios-manifest-entry.json is out of date. Run `
      + `node scripts/mirror-manifest.mjs.\n${e.stdout || ''}`
      + (after === before ? '' : ''));
  }
  assert.match(output, /is up to date/);
});

test('the mirror carries every module the page imports, and not the one file it cannot', () => {
  const { files } = JSON.parse(readFileSync(ENTRY, 'utf8'));
  const sources = files.map((f) => f.source);

  for (const needed of ['index.html', 'app/main.js', 'app/table.js', 'app/commands.js']) {
    assert.ok(sources.includes(needed), `${needed} should be mirrored`);
  }

  // naklios.dev is Cloudflare Pages, which caps one file at 25 MiB. This binary is 25.93 MiB, so
  // app/design.js fetches it from protavia.naklitechie.com instead.
  assert.ok(
    !sources.includes('vendor/onnxruntime-web/1.24.3/ort-wasm-simd-threaded.asyncify.wasm'),
    'the oversized WebAssembly binary must stay out of the mirror',
  );
  // Its loader module is small, so it is mirrored like anything else.
  assert.ok(sources.includes('vendor/onnxruntime-web/1.24.3/ort-wasm-simd-threaded.asyncify.mjs'));

  assert.equal(new Set(sources).size, sources.length, 'no file is listed twice');
});
