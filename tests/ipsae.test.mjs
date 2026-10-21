// ipSAE arithmetic.
//
// The implementation was checked once against the reference, ipsae.py from DunbrackLab/IPSAE, on
// its AURKA/TPX2 AlphaFold3 example: both directions matched to the 6 decimal places the reference
// prints. That check needed a 60 MB prediction file and is not repeated here.
//
// What these tests do instead is recompute the published arithmetic independently, from the two
// formulas the method is defined by, and compare. A refactor that changes an answer fails here
// without anyone downloading anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcD0, scoreInterfaces } from '../app/ipsae.js';

const close = (got, want, tol = 1e-12) =>
  assert.ok(Math.abs(got - want) <= tol, `expected ${want}, got ${got}`);

// --- d0, after Yang and Skolnick (2004) --------------------------------------------------------

test('d0 follows the published formula above the short-chain floor', () => {
  // d0 = 1.24 * cbrt(L - 15) - 1.8, written out here rather than imported. The formula first
  // clears the floor of 1 at L = 27, so the shortest length tested here is 27.
  for (const length of [27, 40, 100, 250, 1000]) {
    close(calcD0(length), 1.24 * Math.cbrt(length - 15) - 1.8);
  }
});

test('d0 pins any chain shorter than 26 residues to the value at 26', () => {
  const at26 = calcD0(26);
  for (const length of [0, 1, 5, 25]) close(calcD0(length), at26);
});

test('d0 never drops below 1, which is what keeps the transform positive', () => {
  // At L = 26 the formula gives 1.24 * cbrt(11) - 1.8, about 0.96, so the floor is doing work.
  assert.ok(1.24 * Math.cbrt(26 - 15) - 1.8 < 1, 'the floor should bind at L = 26');
  for (const length of [0, 26, 27, 30]) assert.ok(calcD0(length) >= 1);
});

// --- scoring one interface ---------------------------------------------------------------------

/** The pTM transform, written out: an error of d0 scores exactly 0.5. */
const ptm = (error, d0) => 1 / (1 + (error / d0) ** 2);

test('an interface the predictor is certain about scores 1', () => {
  const pae = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const [ab] = scoreInterfaces(pae, ['A', 'A', 'B', 'B']);
  close(ab.ipsae, 1);
  close(ab.iptmD0chn, 1);
});

test('an interface every error exceeds the cutoff scores 0 and anchors nothing', () => {
  const big = 50;
  const pae = Array.from({ length: 4 }, () => Array(4).fill(big));
  const [ab] = scoreInterfaces(pae, ['A', 'A', 'B', 'B'], { paeCutoff: 10 });
  close(ab.ipsae, 0);
  assert.equal(ab.nres1, 0, 'no residue of A should anchor');
  assert.equal(ab.nres2, 0, 'no residue of B should be a partner');
  // ipTM has no cutoff, so it is small but not zero.
  assert.ok(ab.iptmD0chn > 0 && ab.iptmD0chn < 0.01);
});

test('ipSAE matches the arithmetic recomputed by hand on a small matrix', () => {
  // Two chains of two residues. Row 0 of A is confident about both residues of B; row 1 is
  // confident about one of them and hopeless about the other.
  const pae = [
    [0, 0, 2, 4],
    [0, 0, 6, 30],
    [2, 6, 0, 0],
    [4, 30, 0, 0],
  ];
  const chains = ['A', 'A', 'B', 'B'];
  const cutoff = 10;

  // By hand, for chain A aligned on, chain B scored:
  //   residue 0 is under the cutoff against both of B, so n0res = 2 and d0 = calcD0(2).
  //   residue 1 is under the cutoff against one of B, so n0res = 1 and d0 = calcD0(1).
  const d0two = calcD0(2);
  const d0one = calcD0(1);
  const perResidue = [
    (ptm(2, d0two) + ptm(4, d0two)) / 2,
    ptm(6, d0one),
  ];
  const expected = Math.max(...perResidue);

  const ab = scoreInterfaces(pae, chains, { paeCutoff: cutoff })
    .find((r) => r.chain1 === 'A' && r.chain2 === 'B' && r.type === 'asym');

  close(ab.ipsae, expected);
  assert.equal(ab.nres1, 2, 'both residues of A anchor');
  assert.equal(ab.nres2, 2, 'both residues of B are partners of something');
  assert.equal(ab.n0chn, 4);
  close(ab.d0chn, calcD0(4));
});

test('the two directions of one interface are scored separately', () => {
  // Chain A is confident about B; B is much less confident about A. The matrix is deliberately
  // not symmetric, which is what a real predicted aligned error matrix is like.
  const pae = [
    [0, 1, 1, 1],
    [1, 0, 1, 1],
    [9, 9, 0, 1],
    [9, 9, 1, 0],
  ];
  const chains = ['A', 'A', 'B', 'B'];
  const rows = scoreInterfaces(pae, chains);
  const ab = rows.find((r) => r.chain1 === 'A' && r.chain2 === 'B' && r.type === 'asym');
  const ba = rows.find((r) => r.chain1 === 'B' && r.chain2 === 'A' && r.type === 'asym');

  assert.ok(ab.ipsae > ba.ipsae, 'aligning on the confident chain should score higher');
});

test('the summary row reports the better direction', () => {
  const pae = [
    [0, 1, 1, 1],
    [1, 0, 1, 1],
    [9, 9, 0, 1],
    [9, 9, 1, 0],
  ];
  const rows = scoreInterfaces(pae, ['A', 'A', 'B', 'B']);
  const asym = rows.filter((r) => r.type === 'asym');
  const max = rows.find((r) => r.type === 'max');

  close(max.ipsae, Math.max(...asym.map((r) => r.ipsae)));
  close(max.iptmD0chn, Math.max(...asym.map((r) => r.iptmD0chn)));
});

test('every ordered pair of chains is scored, and no chain against itself', () => {
  const n = 6;
  const pae = Array.from({ length: n }, () => Array(n).fill(3));
  const rows = scoreInterfaces(pae, ['A', 'A', 'B', 'B', 'C', 'C']);

  assert.equal(rows.filter((r) => r.type === 'asym').length, 6, '3 chains give 6 ordered pairs');
  assert.equal(rows.filter((r) => r.type === 'max').length, 3, 'and 3 unordered pairs');
  assert.ok(!rows.some((r) => r.chain1 === r.chain2));
});

test('a matrix and a chain list of different lengths is refused', () => {
  const pae = [[0, 1], [1, 0]];
  assert.throws(() => scoreInterfaces(pae, ['A']), /2 matrix rows but 1 chain label/);
});
