/** Adapters for upstream helper-script data. File I/O stays in the host application. */
import { fromCoordinates } from './structure.js';
import { ALPHABET } from './types.js';
export function parseJSONL(text) {
    return text.split(/\r?\n/).filter(line => line.trim()).map((line, i) => {
        const value = JSON.parse(line);
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error(`JSONL line ${i + 1} must be an object`);
        return value;
    });
}
export function fromProteinMPNNJSON(target, options = {}) {
    const chains = options.chainOrder ?? Object.keys(target).filter(k => k.startsWith('seq_chain_')).map(k => k.slice(10)).sort();
    if (!chains.length)
        throw new Error('No seq_chain_* fields in target');
    const coordinates = [], chainIds = [], residueNumbers = [], sequence = [];
    for (const chain of chains) {
        const seq = target[`seq_chain_${chain}`];
        const coords = target[`coords_chain_${chain}`];
        if (typeof seq !== 'string' || !coords)
            throw new Error(`Missing sequence/coordinates for chain ${chain}`);
        for (let i = 0; i < seq.length; i++) {
            for (const atom of options.caOnly ? ['CA'] : ['N', 'CA', 'C', 'O']) {
                const v = coords[`${atom}_chain_${chain}`]?.[i];
                coordinates.push(...(v && v.length === 3 ? v.map(x => x === null ? NaN : x) : [NaN, NaN, NaN]));
            }
            chainIds.push(chain);
            residueNumbers.push(i + 1);
            sequence.push(seq[i] === '-' ? 'X' : seq[i]);
        }
    }
    return fromCoordinates({ coordinates, sequence: sequence.join(''), chainIds, residueNumbers, atomMode: options.caOnly ? 'ca' : 'backbone' });
}
/** Convert one target's helper JSON dictionaries; upstream positions are one-based within chain. */
export function fromLegacyOptions(s, legacy) {
    const chainIndices = new Map();
    s.chainIds.forEach((chain, i) => { if (!chainIndices.has(chain))
        chainIndices.set(chain, []); chainIndices.get(chain).push(i); });
    const pos = (chain, p) => { const rows = chainIndices.get(chain); if (!rows || !Number.isInteger(p) || p < 1 || p > rows.length)
        throw new Error(`Invalid legacy position ${chain}:${p}`); return rows[p - 1]; };
    const options = { omitAminoAcids: legacy.omitAAs, biasAminoAcids: legacy.biasAA };
    if (legacy.chainIds) {
        const [designed, fixed] = legacy.chainIds;
        if (new Set([...designed, ...fixed]).size !== designed.length + fixed.length)
            throw new Error('Legacy chain assignment overlaps');
        for (const chain of [...designed, ...fixed])
            if (!chainIndices.has(chain))
                throw new Error(`Unknown chain ${chain}`);
        if (chainIndices.size !== designed.length + fixed.length)
            throw new Error('Legacy chain assignment must cover all chains');
        options.designChains = designed;
    }
    options.fixedPositions = Object.entries(legacy.fixedPositions ?? {}).flatMap(([chain, positions]) => positions.map(p => pos(chain, p)));
    options.omitByResidue = Object.entries(legacy.omitAA ?? {}).flatMap(([chain, entries]) => entries.flatMap(([positions, aminoAcids]) => positions.map(p => ({ position: pos(chain, p), aminoAcids }))));
    options.biasByResidue = Object.entries(legacy.biasByResidue ?? {}).flatMap(([chain, rows]) => {
        if (rows.length !== chainIndices.get(chain)?.length)
            throw new Error(`Bias row count mismatch for chain ${chain}`);
        return rows.map((row, i) => { if (row.length !== 21)
            throw new Error('Bias rows must have 21 entries'); return { position: pos(chain, i + 1), bias: Object.fromEntries(Array.from(ALPHABET, (aa, j) => [aa, row[j]])) }; });
    });
    options.tiedPositions = (legacy.tiedPositions ?? []).map(raw => {
        const group = { positions: [], weights: [] }, positions = [], weights = [];
        for (const [chain, value] of Object.entries(raw)) {
            const weighted = Array.isArray(value[0]);
            const ps = (weighted ? value[0] : value), ws = (weighted ? value[1] : ps.map(() => 1));
            if (ps.length !== ws.length)
                throw new Error('Legacy tied weights mismatch');
            ps.forEach((p, i) => { positions.push(pos(chain, p)); weights.push(ws[i]); });
        }
        group.positions = positions;
        group.weights = weights;
        return group;
    });
    if (legacy.pssm) {
        const probabilities = new Float32Array(s.length * 21).fill(1 / 21), coefficients = new Float32Array(s.length), logOdds = new Float32Array(s.length * 21).fill(10000);
        for (const [chain, data] of Object.entries(legacy.pssm)) {
            const rows = chainIndices.get(chain);
            if (!rows)
                throw new Error(`Unknown PSSM chain ${chain}`);
            for (const key of ['pssm_coef', 'pssm_bias', 'pssm_log_odds'])
                if (data[key] && data[key].length !== rows.length)
                    throw new Error(`PSSM row count mismatch: ${chain}/${key}`);
            rows.forEach((index, i) => {
                coefficients[index] = data.pssm_coef?.[i] ?? 0;
                for (const [key, out] of [['pssm_bias', probabilities], ['pssm_log_odds', logOdds]])
                    if (data[key]) {
                        const row = data[key][i];
                        if (row.length !== 21)
                            throw new Error('PSSM rows must have 21 entries');
                        out.set(row, index * 21);
                    }
            });
        }
        const pssm = { probabilities, coefficients, logOdds, mix: legacy.pssmMulti ?? 0, threshold: legacy.pssmThreshold ?? 0, useBias: legacy.pssmBiasFlag ?? false, useLogOdds: legacy.pssmLogOddsFlag ?? false };
        options.pssm = pssm;
    }
    return options;
}
//# sourceMappingURL=legacy.js.map