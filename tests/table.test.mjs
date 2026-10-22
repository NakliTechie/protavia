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

// --- filtering ----------------------------------------------------------------------------------

test('with no filter every design is visible', () => {
  const t = table();
  t.add(design('a', 'a', 0.4, 0.9));
  t.add(design('b', 'b', 0.8, 0.7));
  assert.equal(t.visible().length, 2);
  assert.deepEqual(t.activeFilters(), []);
});

test('a threshold reads in the column\u2019s own better direction', () => {
  const t = table();
  t.add(design('low', 'low', 0.40, 0.90));
  t.add(design('high', 'high', 0.80, 0.70));

  // Recovery is better high, so 0.5 means "at least 0.5".
  t.setFilter('recovery', 0.5);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['high']);

  // Score is better low, so the same shape of call means "at most".
  t.clearFilters();
  t.setFilter('score', 0.8);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['high']);
});

test('the filter says what it means, in the units the column shows', () => {
  const t = table();
  t.add(design('a', 'a', 0.4, 0.9));
  t.setFilter('recovery', 0.5);
  t.setFilter('score', 0.8);
  // Recovery is stored as a fraction and read as a percentage, so the sentence says 50%, not 0.5.
  assert.deepEqual(t.activeFilters().map((f) => `${f.column} ${f.meaning}`),
    ['recovery at least 50%', 'score at most 0.8']);
  assert.equal(t.activeFilters()[0].value, 0.5, 'the stored value keeps the model\u2019s units');
});

test('a scaled threshold does not drift on the way to the sentence', () => {
  const t = table();
  t.add(design('a', 'a', 0.4, 0.9));
  t.setFilter('recovery', 0.553);
  assert.equal(t.activeFilters()[0].meaning, 'at least 55.3%');
});

test('filters combine: a design has to pass all of them', () => {
  const t = table();
  t.add(design('both', 'both', 0.80, 0.70));
  t.add(design('recovery only', 'rec', 0.80, 0.95));
  t.add(design('score only', 'sc', 0.40, 0.70));

  t.setFilter('recovery', 0.5);
  t.setFilter('score', 0.8);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['both']);
});

test('a text column filters on an exact value', () => {
  const t = table();
  t.add(design('solubleMPNN v_48_020', 'soluble 020', 0.9, 0.8));
  t.add(design('ProteinMPNN v_48_020', 'MPNN 020', 0.5, 0.8));

  t.setFilter('checkpoint', 'solubleMPNN v_48_020');
  assert.deepEqual(t.visible().map((r) => r.checkpointShort), ['soluble 020']);
});

test('a design with no value for a filtered column is hidden, not kept', () => {
  const t = table();
  t.add(design('has', 'has', 0.80, 0.70));
  t.add(design('none', 'none', null, null));

  t.setFilter('recovery', 0.1);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['has']);
});

test('filtering never loses a design, and clearing brings it back', () => {
  const t = table();
  t.add(design('a', 'a', 0.40, 0.90));
  t.add(design('b', 'b', 0.80, 0.70));

  t.setFilter('recovery', 0.5);
  assert.equal(t.visible().length, 1);
  assert.equal(t.rows.length, 2, 'the rows themselves are untouched');
  assert.equal(t.ordered().length, 2, 'ordered() still shows everything');

  t.clearFilters();
  assert.equal(t.visible().length, 2);
});

test('an empty value drops that filter', () => {
  const t = table();
  t.add(design('a', 'a', 0.40, 0.90));
  t.setFilter('recovery', 0.5);
  assert.equal(t.visible().length, 0);
  t.setFilter('recovery', null);
  assert.equal(t.visible().length, 1);
});

test('the visible designs stay in the current order', () => {
  const t = table();
  t.add(design('mid', 'mid', 0.60, 0.50));
  t.add(design('high', 'high', 0.80, 0.95));
  t.add(design('low', 'low', 0.40, 0.70));

  t.setFilter('recovery', 0.5);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['high', 'mid']);
  t.sortBy('recovery', false);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['mid', 'high']);
});

test('a column that may not rank may still be filtered', () => {
  // The rule is about what orders the table, not about what you may threshold. The column
  // registered earlier in this file is the shape ipSAE will arrive in.
  const t = table();
  t.add({ ...design('weak', 'weak', 0.5, 0.8), ipsae: 0.2 });
  t.add({ ...design('strong', 'strong', 0.5, 0.8), ipsae: 0.9 });

  assert.throws(() => t.sortBy('test-ipsae'), /never ranks the table/);
  t.setFilter('test-ipsae', 0.5);
  assert.deepEqual(t.visible().map((r) => r.checkpointLabel), ['strong']);
});

test('filtering on a column that does not exist says so', () => {
  assert.throws(() => table().setFilter('no-such-column', 1), /No column called "no-such-column"/);
});

test('clearing the table clears its filters too', () => {
  const t = table();
  t.add(design('a', 'a', 0.40, 0.90));
  t.setFilter('recovery', 0.5);
  t.clear();
  t.add(design('b', 'b', 0.40, 0.90));
  assert.equal(t.visible().length, 1, 'a new target must not inherit the last one\u2019s filters');
});
