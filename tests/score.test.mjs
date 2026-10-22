// Attaching an interface score to a design.
//
// The arithmetic itself is tested in ipsae.test.mjs against the published formulas. What is
// tested here is the layer above it: where a score comes from when a design has one, when both
// the engine and this code have computed it, and when the column appears at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interfaceScore, withInterfaceScore, ensureIpsaeColumn } from '../app/score.js';
import { columnById, allColumns, DesignTable } from '../app/table.js';

/**
 * A two-chain toy complex with a 1 angstrom error across the interface.
 *
 * It scores exactly 0.5, which is not a bug and is worth writing down: with two residues per
 * chain, d0 is floored at 1.0, and the pTM transform gives 0.5 when the error equals d0. A toy
 * matrix cannot produce a high ipSAE, because the score is scaled by how many partners each
 * residue is confident about.
 */
const confident = {
  pae: [
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
  ],
  chainIds: ['A', 'A', 'B', 'B'],
};

test('a design with neither a score nor a matrix has no interface score', () => {
  assert.equal(interfaceScore({ sequence: 'MKV' }), null);
  assert.equal(interfaceScore({ pae: [], chainIds: [] }), null);
});

test('a score the engine computed is used as it stands', () => {
  const score = interfaceScore({ ipsae: 0.734 });
  assert.deepEqual(score, { value: 0.734, source: 'engine' });
});

test('a matrix with no engine score is computed here', () => {
  const score = interfaceScore(confident);
  assert.equal(score.source, 'computed');
  // An error of 1 angstrom against a d0 floored at 1.0: 1 / (1 + 1) exactly.
  assert.equal(score.value, 0.5);
});

test('a perfectly confident interface scores 1', () => {
  const score = interfaceScore({
    pae: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    chainIds: ['A', 'A', 'B', 'B'],
  });
  assert.equal(score.value, 1);
});

test('a matrix and a matching engine score agree, and the agreement is recorded', () => {
  const computed = interfaceScore(confident).value;
  const score = interfaceScore({ ...confident, ipsae: computed });
  assert.equal(score.source, 'agreed');
  assert.equal(score.value, computed);
  assert.ok(score.difference <= 1e-3);
});

test('a disagreement is kept and marked, not averaged away', () => {
  const computed = interfaceScore(confident).value;
  const score = interfaceScore({ ...confident, ipsae: computed - 0.2 });
  assert.equal(score.source, 'disagreed');
  // The engine's own number is the value, because that is what its ranking used.
  assert.equal(score.value, computed - 0.2);
  assert.equal(score.computed, computed);
  assert.ok(score.difference > 1e-3);
});

test('a matrix whose chain labels do not match its rows is ignored rather than thrown', () => {
  // A malformed design should not take the page down; it simply has no interface score.
  assert.equal(interfaceScore({ pae: confident.pae, chainIds: ['A'] }), null);
});

test('a single-chain prediction has no interface to score', () => {
  const score = interfaceScore({ pae: [[0, 1], [1, 0]], chainIds: ['A', 'A'] });
  assert.equal(score, null);
});

test('the column appears only once a design has a score', () => {
  assert.equal(columnById('ipsae'), null, 'nothing should have registered it yet');

  withInterfaceScore({ sequence: 'MKV' });
  assert.equal(columnById('ipsae'), null, 'a design with no score must not create the column');

  const scored = withInterfaceScore({ ipsae: 0.5 });
  assert.ok(columnById('ipsae'), 'a design with a score creates it');
  assert.equal(scored.interfaceScore.value, 0.5);
});

test('registering the column twice is safe', () => {
  const first = ensureIpsaeColumn();
  const second = ensureIpsaeColumn();
  assert.equal(first, second);
  assert.equal(allColumns().filter((c) => c.id === 'ipsae').length, 1);
});

test('the column is shown but refused as a ranking key, with its reason', () => {
  ensureIpsaeColumn();
  const column = columnById('ipsae');
  assert.equal(column.rankable, false);
  assert.match(column.whyNotRankable, /stays bound/);

  const table = new DesignTable({ replaceChildren() {}, append() {}, querySelectorAll: () => [] });
  table.render = () => {};
  assert.throws(() => table.sortBy('ipsae'), /never ranks the table/);
});

test('a design can still be filtered on its interface score', () => {
  // Shown but not rankable is about ordering, not about thresholds.
  ensureIpsaeColumn();
  const table = new DesignTable({ replaceChildren() {}, append() {}, querySelectorAll: () => [] });
  table.render = () => {};
  table.add(withInterfaceScore({ ipsae: 0.9, sequence: 'strong' }));
  table.add(withInterfaceScore({ ipsae: 0.2, sequence: 'weak' }));

  table.setFilter('ipsae', 0.5);
  assert.deepEqual(table.visible().map((r) => r.sequence), ['strong']);
});

test('the column formats a missing score as a dash and marks a disagreement', () => {
  ensureIpsaeColumn();
  const column = columnById('ipsae');
  assert.equal(column.format({}), '—');
  assert.equal(column.format(withInterfaceScore({ ipsae: 0.7341 })), '0.734');
  const computed = interfaceScore(confident).value;
  const row = withInterfaceScore({ ...confident, ipsae: computed - 0.2 });
  assert.match(column.format(row), /⚠/);
});
