// The ranking table's column registry and ordering.
//
// Drawing needs a browser, so these tests replace `render` on the instance and exercise the two
// things that decide what the reader sees: which columns exist, and what order the rows come out
// in. The refusal to rank on a column declared `rankable: false` is tested here because it is a
// rule about what the table means, not a detail of how it draws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DesignTable, allColumns, columnById, rankableColumns, registerColumn } from '../app/table.js';

/** A table that never draws, so these tests need no browser. */
function table() {
  const t = new DesignTable({ replaceChildren() {}, append() {}, querySelectorAll: () => [] });
  t.render = () => {};
  return t;
}

const design = (checkpoint, short, fraction, score) => ({
  checkpointLabel: checkpoint,
  checkpointShort: short,
  recovery: fraction === null ? null : { fraction, matched: Math.round(fraction * 76), counted: 76 },
  score,
});

// --- the declared columns -----------------------------------------------------------------------

test('the table opens with the three columns the bench already produces', () => {
  assert.deepEqual(allColumns().map((c) => c.id), ['checkpoint', 'recovery', 'score']);
});

test('every column says what it means and which end is better', () => {
  for (const c of allColumns()) {
    assert.ok(c.explain && c.explain.length > 20, `${c.id} needs an explanation`);
    assert.ok(c.better === 'asc' || c.better === 'desc', `${c.id} needs a better end`);
    assert.equal(typeof c.value, 'function');
    assert.equal(typeof c.format, 'function');
  }
});

test('a column cannot be declared twice', () => {
  assert.throws(() => registerColumn({ id: 'recovery', label: 'x', explain: 'y', value: () => 0, format: () => '', better: 'asc' }),
    /already declared/);
});

test('a column that may not rank has to say why', () => {
  assert.throws(() => registerColumn({
    id: 'nameless-refusal', label: 'x', explain: 'y', value: () => 0, format: () => '',
    better: 'asc', rankable: false,
  }), /gives no reason/);
});

test('a column declared unrankable is listed but kept out of the ranking keys', () => {
  // This is the shape the interface score ipSAE will arrive in when a compute run produces one.
  const column = registerColumn({
    id: 'test-ipsae',
    label: 'ipSAE',
    explain: 'How confident one predicted structure is about the interface.',
    value: (r) => r.ipsae ?? null,
    format: (r) => (r.ipsae == null ? '—' : r.ipsae.toFixed(3)),
    better: 'desc',
    rankable: false,
    whyNotRankable: 'It reads one pose, not whether the binder stays bound.',
  });

  assert.ok(allColumns().some((c) => c.id === column.id), 'it is shown');
  assert.ok(!rankableColumns().some((c) => c.id === column.id), 'and never ranks');
  assert.throws(() => table().sortBy('test-ipsae'), /never ranks the table/);
});

test('a later column slots in without the table knowing what it is', () => {
  const t = table();
  t.add({ ...design('A', 'a', 0.5, 0.8), spread: 3 });
  t.add({ ...design('B', 'b', 0.9, 0.7), spread: 1 });

  registerColumn({
    id: 'test-spread',
    label: 'Spread',
    explain: 'How far the designed pose moves across an ensemble, in angstroms.',
    value: (r) => r.spread ?? null,
    format: (r) => String(r.spread ?? '—'),
    better: 'asc',
  });

  t.sortBy('test-spread');
  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['B', 'A']);
});

// --- ordering -------------------------------------------------------------------------------

test('the table opens ordered by recovery, best first', () => {
  const t = table();
  t.add(design('low', 'low', 0.40, 0.70));
  t.add(design('high', 'high', 0.80, 0.95));
  t.add(design('mid', 'mid', 0.60, 0.50));

  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['high', 'mid', 'low']);
});

test('a column opens at its better end: score ascending, because lower is better', () => {
  const t = table();
  t.add(design('a', 'a', 0.5, 0.90));
  t.add(design('b', 'b', 0.5, 0.70));
  t.add(design('c', 'c', 0.5, 0.80));

  t.sortBy('score');
  assert.deepEqual(t.ordered().map((r) => r.score), [0.70, 0.80, 0.90]);
  assert.equal(t.descending, false);
});

test('sorting the column already sorted flips it', () => {
  const t = table();
  t.add(design('a', 'a', 0.4, 0.1));
  t.add(design('b', 'b', 0.8, 0.2));

  t.sortBy('recovery');
  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['b', 'a']);
  t.sortBy('recovery', !t.descending);
  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['a', 'b']);
});

test('a row with no value for the sorted column goes last, whichever way it runs', () => {
  const t = table();
  t.add(design('has', 'has', 0.5, 0.8));
  t.add(design('none', 'none', null, null));

  t.sortBy('recovery');
  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['has', 'none']);
  t.sortBy('recovery', false);
  assert.deepEqual(t.ordered().map((r) => r.checkpointLabel), ['has', 'none']);
});

test('text columns sort alphabetically', () => {
  const t = table();
  t.add(design('solubleMPNN v_48_020', 'soluble 020', 0.9, 0.8));
  t.add(design('ProteinMPNN v_48_002', 'MPNN 002', 0.5, 0.8));

  t.sortBy('checkpoint');
  assert.deepEqual(t.ordered().map((r) => r.checkpointShort), ['MPNN 002', 'soluble 020']);
});

test('ordering never changes the rows themselves', () => {
  const t = table();
  const first = t.add(design('a', 'a', 0.4, 0.1));
  t.add(design('b', 'b', 0.8, 0.2));
  t.sortBy('recovery');
  assert.equal(t.rows[0], first, 'the table keeps the rows in the order they arrived');
});

test('sorting by a column that does not exist says so', () => {
  assert.throws(() => table().sortBy('no-such-column'), /No column called "no-such-column"/);
});

test('formatting shows a dash rather than a blank when a figure is missing', () => {
  const row = design('a', 'a', null, null);
  assert.equal(columnById('recovery').format(row), '—');
  assert.equal(columnById('score').format(row), '—');
  assert.equal(columnById('recovery').format(design('a', 'a', 0.539, 0.8)), '53.9%');
});
