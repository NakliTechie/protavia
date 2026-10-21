// Sequence recovery: the fraction of designed positions that match the native amino acid.
//
// The figure the interface leads with, so what it counts and what it skips matters. It is a
// property of two strings and a chain list, and nothing here touches a model.
//
// app/design.js reads `location.pathname` at load to decide where the WebAssembly runtime comes
// from, so the test gives it one. Nothing else in these tests needs a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { pathname: '/' };
const { sequenceRecovery, MODELS, modelById } = await import('../app/design.js');

test('every position matching gives 1', () => {
  const r = sequenceRecovery('ACDE', 'ACDE', ['A', 'A', 'A', 'A'], ['A']);
  assert.deepEqual(r, { fraction: 1, matched: 4, counted: 4 });
});

test('no position matching gives 0', () => {
  const r = sequenceRecovery('AAAA', 'CCCC', ['A', 'A', 'A', 'A'], ['A']);
  assert.deepEqual(r, { fraction: 0, matched: 0, counted: 4 });
});

test('positions outside the designed chains are not counted', () => {
  // Chain B is identical in both and would lift the figure if it were counted.
  const native = 'ACDEWWWW';
  const designed = 'AYYEWWWW';
  const chains = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];

  const r = sequenceRecovery(native, designed, chains, ['A']);
  assert.deepEqual(r, { fraction: 0.5, matched: 2, counted: 4 });
});

test('with no chain list every position counts', () => {
  const r = sequenceRecovery('ACDE', 'AYDE', ['A', 'A', 'B', 'B'], []);
  assert.equal(r.counted, 4);
  assert.equal(r.matched, 3);
});

test('a native residue recorded as unknown is skipped, not counted as a miss', () => {
  const r = sequenceRecovery('AXCD', 'AYCD', ['A', 'A', 'A', 'A'], ['A']);
  assert.deepEqual(r, { fraction: 1, matched: 3, counted: 3 });
});

test('designing a chain the structure does not have gives no figure rather than zero', () => {
  assert.equal(sequenceRecovery('ACDE', 'ACDE', ['A', 'A', 'A', 'A'], ['Z']), null);
});

test('several designed chains are all counted', () => {
  const r = sequenceRecovery('ACDE', 'ACDY', ['A', 'A', 'B', 'B'], ['A', 'B']);
  assert.deepEqual(r, { fraction: 0.75, matched: 3, counted: 4 });
});

test('a sequence shorter than the native one counts only the positions that exist', () => {
  const r = sequenceRecovery('ACDE', 'AC', ['A', 'A', 'A', 'A'], ['A']);
  assert.deepEqual(r, { fraction: 1, matched: 2, counted: 2 });
});

// --- the checkpoint catalog --------------------------------------------------------------------

test('every checkpoint has a label, a short name, a note and a manifest', () => {
  assert.ok(MODELS.length >= 3);
  for (const m of MODELS) {
    assert.ok(m.id && m.label && m.short, `${m.id} needs a label and a short name`);
    assert.ok(m.note.length > 40, `${m.id} should say what it was taught differently`);
    assert.match(m.manifest, /^vendor\/.+\/manifest\.json$/);
    assert.ok(m.short.length <= 12, `${m.short} must fit the panel`);
  }
});

test('checkpoint ids are unique and findable by id', () => {
  const ids = MODELS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(modelById(id).id, id);
  assert.equal(modelById('not-a-checkpoint'), null);
});
