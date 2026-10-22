// The interface score, attached to a design.
//
// `ipsae.js` is the arithmetic and knows nothing about designs; this is the thin layer that
// decides when a design has an interface score, where it comes from, and how it reaches the
// ranking table.
//
// A design can arrive with the score already computed. FreeBindCraft calculates ipSAE itself and
// can rank by it, so a design read back from a run usually carries one. A design can also arrive
// with the predicted aligned error matrix and no score, in which case it is computed here from
// the same published arithmetic. When both are present the two are compared, because an
// independent implementation agreeing with the engine's is worth knowing about, and disagreeing
// is worth knowing about more.
//
// The column is registered the first time a design actually has a score. Registering it up front
// would put a column of dashes in front of everyone who only ever redesigns a sequence in the
// browser, which is most people.

import { scoreInterfaces } from './ipsae.js';
import { registerColumn, columnById } from './table.js';

/** The two numbers are the same quantity; past this they are not the same answer. */
const AGREEMENT_TOLERANCE = 1e-3;

/**
 * The interface score for one design, and where it came from.
 *
 * @param {{ipsae?: number, pae?: number[][], chainIds?: ArrayLike<string>, paeCutoff?: number}} design
 * @returns {{value: number, source: 'engine'|'computed'|'agreed', reported?: number,
 *            computed?: number, difference?: number}|null}
 */
export function interfaceScore(design) {
  const reported = typeof design.ipsae === 'number' ? design.ipsae : null;
  const computed = computeFromMatrix(design);

  if (computed === null) {
    return reported === null ? null : { value: reported, source: 'engine' };
  }
  if (reported === null) {
    return { value: computed, source: 'computed' };
  }

  // Both. Keep the engine's number as the value — it is what its own ranking used — and carry the
  // difference so a disagreement is visible rather than averaged away.
  const difference = Math.abs(reported - computed);
  return {
    value: reported,
    source: difference <= AGREEMENT_TOLERANCE ? 'agreed' : 'disagreed',
    reported,
    computed,
    difference,
  };
}

/**
 * ipSAE from a design's own predicted aligned error matrix, or null when there isn't one.
 *
 * A binder design has two chains, and the figure wanted is the better of the two directions
 * across that interface, which is the `max` row the arithmetic already produces.
 */
function computeFromMatrix(design) {
  const { pae, chainIds } = design;
  if (!Array.isArray(pae) || !pae.length || !chainIds || chainIds.length !== pae.length) return null;

  const rows = scoreInterfaces(pae, chainIds, { paeCutoff: design.paeCutoff ?? 10 });
  const pairs = rows.filter((r) => r.type === 'max');
  if (!pairs.length) return null;

  // One interface is the ordinary case. More than one means the prediction has more than two
  // chains, and the binder's interface is the best-scoring one rather than an average of them.
  return pairs.reduce((best, r) => (r.ipsae > best ? r.ipsae : best), -Infinity);
}

/**
 * Make sure the table has somewhere to show this. Called when a design has a score, and safe to
 * call again. Returns the column.
 */
export function ensureIpsaeColumn() {
  const already = columnById('ipsae');
  if (already) return already;

  return registerColumn({
    id: 'ipsae',
    label: 'ipSAE',
    explain: 'How confident the structure prediction is about the interface between the binder '
      + 'and its target, scored only over residue pairs that cross it.',
    value: (row) => {
      const score = row.interfaceScore;
      return score ? score.value : null;
    },
    format: (row) => {
      const score = row.interfaceScore;
      if (!score) return '—';
      // A disagreement between the engine's figure and ours is marked rather than hidden.
      return score.source === 'disagreed'
        ? `${score.value.toFixed(3)} ⚠`
        : score.value.toFixed(3);
    },
    better: 'desc',
    align: 'right',
    // The decision this project already took, enforced rather than remembered. ipSAE reads one
    // predicted structure's confidence in one pose; whether a binder stays bound is a question
    // about an ensemble. Ranking on it would answer the wrong question quietly.
    rankable: false,
    whyNotRankable: 'It reads one predicted pose, not whether the binder stays bound.',
  });
}

/**
 * Attach the score to a design, registering the column the first time one has it.
 * Returns the design, so this can sit in a map.
 */
export function withInterfaceScore(design) {
  const score = interfaceScore(design);
  if (!score) return design;
  ensureIpsaeColumn();
  return { ...design, interfaceScore: score };
}
