// Reading a summary and a backbone out of a loaded structure.
//
// Both functions walk a Mol* model's atomic hierarchy directly, because the vendored viewer bundle
// exports only `Viewer` and Mol*'s own selection helpers are not reachable. These tests build that
// hierarchy from a plain description of residues and atoms, in the layout Mol* has used since v3:
// per-chain and per-residue offset arrays into one flat list of atoms, with the component name
// stored per atom rather than per residue.
//
// What this does and does not prove. It proves the walk is right: which residues are counted,
// which are skipped, where each chain starts and stops, and which atoms are picked up. It cannot
// prove Mol* still stores models this way; that is what loading a real file in the browser checks,
// and the counts for 1UBQ and 1BRS have been checked against grep on the deposited files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarise, extractBackbone } from '../app/structure.js';

/** A column, as Mol* exposes one. */
const column = (values) => ({ value: (i) => values[i] });

/**
 * Build a fake Mol* structure.
 *
 * @param {Array<{chain: string, residues: Array<{name: string, seq: number, ins?: string,
 *   atoms?: Array<{name: string, xyz?: number[]}>}>}>} spec
 */
function structureOf(spec, { entryId = 'TEST', models = 1 } = {}) {
  const chainIds = [];
  const labelIds = [];
  const chainOffsets = [0];
  const residueOffsets = [];
  const residueIndexOfAtom = [];
  const seqIds = [];
  const insCodes = [];
  const compOfAtom = [];
  const atomNames = [];
  const x = []; const y = []; const z = [];

  for (const c of spec) {
    chainIds.push(c.chain);
    labelIds.push(c.labelId || c.chain);
    for (const r of c.residues) {
      residueOffsets.push(compOfAtom.length);
      const residueIndex = seqIds.length;
      seqIds.push(r.seq);
      insCodes.push(r.ins || '');
      // A residue with no atom list gets one unnamed atom, which is enough for the summary.
      for (const a of r.atoms || [{ name: 'CA', xyz: [0, 0, 0] }]) {
        compOfAtom.push(r.name);
        atomNames.push(a.name);
        const [ax, ay, az] = a.xyz || [0, 0, 0];
        x.push(ax); y.push(ay); z.push(az);
        residueIndexOfAtom.push(residueIndex);
      }
    }
    chainOffsets.push(compOfAtom.length);
  }
  residueOffsets.push(compOfAtom.length);

  const model = {
    entryId,
    atomicHierarchy: {
      chains: { auth_asym_id: column(chainIds), label_asym_id: column(labelIds) },
      residues: { auth_seq_id: column(seqIds), pdbx_PDB_ins_code: column(insCodes) },
      atoms: { label_comp_id: column(compOfAtom), label_atom_id: column(atomNames) },
      chainAtomSegments: { offsets: chainOffsets, count: spec.length },
      residueAtomSegments: { offsets: residueOffsets, index: residueIndexOfAtom },
    },
    atomicConformation: { x, y, z },
  };
  return { models: Array.from({ length: models }, () => model) };
}

const res = (name, seq, atoms) => ({ name, seq, atoms });
const backbone = (xyz = [0, 0, 0]) =>
  ['N', 'CA', 'C', 'O'].map((name) => ({ name, xyz }));

// --- the summary --------------------------------------------------------------------------------

test('one protein chain is read with its sequence, count and numbering range', () => {
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('MET', 1), res('ALA', 2), res('GLY', 3)] },
  ]));

  assert.equal(s.entryId, 'TEST');
  assert.equal(s.modelCount, 1);
  assert.equal(s.chains.length, 1);
  assert.deepEqual(
    { ...s.chains[0] },
    { id: 'A', labelId: 'A', kind: 'protein', residues: 3, first: 1, last: 3, sequence: 'MAG' },
  );
});

test('water is counted separately and never reaches a sequence', () => {
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('MET', 1), res('ALA', 2)] },
    { chain: 'B', residues: [res('HOH', 101), res('HOH', 102), res('DOD', 103)] },
  ]));

  assert.equal(s.waters, 3);
  assert.equal(s.chains.length, 1, 'a chain of nothing but water is not a chain');
  assert.equal(s.chains[0].sequence, 'MA');
});

test('anything that is neither polymer nor water is counted as another residue', () => {
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('MET', 1), res('ATP', 2), res('ZN', 3), res('ALA', 4)] },
  ]));

  assert.equal(s.ligands, 2);
  assert.equal(s.chains[0].residues, 2);
  assert.equal(s.chains[0].sequence, 'MA');
  assert.equal(s.chains[0].first, 1);
  assert.equal(s.chains[0].last, 4, 'the range spans what is numbered, not what is polymer');
});

test('selenomethionine reads as methionine rather than as a ligand', () => {
  const s = summarise(structureOf([{ chain: 'A', residues: [res('MSE', 1), res('ALA', 2)] }]));
  assert.equal(s.chains[0].sequence, 'MA');
  assert.equal(s.ligands, 0);
});

test('a nucleic chain is labelled nucleic', () => {
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('DA', 1), res('DC', 2), res('DG', 3), res('DT', 4)] },
  ]));
  assert.equal(s.chains[0].kind, 'nucleic');
  assert.equal(s.chains[0].sequence, 'ACGT');
});

test('the atom count is the whole first model, not what the viewer has selected', () => {
  // Three residues of four atoms each, plus two waters of one atom.
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('MET', 1, backbone()), res('ALA', 2, backbone()), res('GLY', 3, backbone())] },
    { chain: 'B', residues: [res('HOH', 101), res('HOH', 102)] },
  ]));
  assert.equal(s.totalAtoms, 14);
});

test('several models are reported, and only the first is read', () => {
  const s = summarise(structureOf([{ chain: 'A', residues: [res('MET', 1)] }], { models: 20 }));
  assert.equal(s.modelCount, 20);
  assert.equal(s.chains[0].residues, 1);
});

test('chains keep their own numbering, including a negative start', () => {
  const s = summarise(structureOf([
    { chain: 'A', residues: [res('MET', -2), res('ALA', -1), res('GLY', 0)] },
    { chain: 'B', residues: [res('SER', 500), res('THR', 501)] },
  ]));
  assert.deepEqual(s.chains.map((c) => [c.id, c.first, c.last]), [['A', -2, 0], ['B', 500, 501]]);
});

// --- the backbone --------------------------------------------------------------------------------

test('each amino acid comes back with its four backbone atoms', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [
      res('MET', 1, [
        { name: 'N', xyz: [1, 2, 3] },
        { name: 'CA', xyz: [4, 5, 6] },
        { name: 'C', xyz: [7, 8, 9] },
        { name: 'O', xyz: [10, 11, 12] },
        { name: 'CB', xyz: [99, 99, 99] },
      ]),
    ] },
  ]));

  assert.equal(out.length, 1);
  assert.deepEqual(out[0].atoms, {
    N: [1, 2, 3], CA: [4, 5, 6], C: [7, 8, 9], O: [10, 11, 12],
  });
  assert.equal(out[0].aminoAcid, 'M');
  assert.equal(out[0].chain, 'A');
  assert.equal(out[0].number, 1);
});

test('a residue missing a backbone atom is still returned, with that atom absent', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [res('ALA', 1, [{ name: 'N' }, { name: 'CA' }])] },
  ]));
  assert.deepEqual(Object.keys(out[0].atoms).sort(), ['CA', 'N']);
});

test('the first alternate location of an atom wins', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [res('ALA', 1, [
      { name: 'CA', xyz: [1, 1, 1] },
      { name: 'CA', xyz: [2, 2, 2] },
    ])] },
  ]));
  assert.deepEqual(out[0].atoms.CA, [1, 1, 1]);
});

test('water and ligands are left out of the backbone', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [res('MET', 1), res('HOH', 2), res('ATP', 3), res('ALA', 4)] },
  ]));
  assert.deepEqual(out.map((r) => r.aminoAcid), ['M', 'A']);
});

test('insertion codes are carried through, trimmed', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [
      { name: 'ALA', seq: 52, ins: 'A' },
      { name: 'GLY', seq: 52, ins: ' ' },
    ] },
  ]));
  assert.deepEqual(out.map((r) => [r.number, r.insertionCode]), [[52, 'A'], [52, '']]);
});

test('every chain is walked, in order', () => {
  const out = extractBackbone(structureOf([
    { chain: 'A', residues: [res('MET', 1), res('ALA', 2)] },
    { chain: 'B', residues: [res('GLY', 1)] },
    { chain: 'C', residues: [res('SER', 7)] },
  ]));
  assert.deepEqual(out.map((r) => r.chain + r.aminoAcid), ['AM', 'AA', 'BG', 'CS']);
});
