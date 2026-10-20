// Wiring for the target-review page: load a structure from disk or by PDB ID, show it, and
// print a plain summary of what came in.

import * as status from './status.js';
import * as viewer from './viewer.js';
import { summarise } from './structure.js';

const $ = (id) => document.getElementById(id);

status.installGlobalErrorSurface();

const ui = {
  file: $('file'),
  drop: $('drop'),
  pdbid: $('pdbid'),
  fetch: $('fetch'),
  clear: $('clear'),
  empty: $('viewer-empty'),
  summaryWrap: $('summary-wrap'),
  summary: $('summary'),
  chains: $('chains'),
  chainsNote: $('chains-note'),
  version: $('viewer-version'),
};

async function boot() {
  status.busy('Starting the viewer…');
  await viewer.create($('viewer-host'));
  ui.version.textContent = 'Mol* ' + viewer.version();
  status.clear();
  window.addEventListener('resize', () => viewer.handleResize());
}

/** Read a File, decompressing it first when it is gzipped. */
async function readFile(file) {
  const { format, binary, gzipped } = viewer.detectFormat(file.name);

  let buffer = await file.arrayBuffer();

  if (gzipped) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot decompress .gz files. Unzip it and try again.');
    }
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    buffer = await new Response(stream).arrayBuffer();
  }

  const data = binary ? new Uint8Array(buffer) : new TextDecoder().decode(buffer);
  return { data, format };
}

async function loadFile(file) {
  status.clear();
  status.busy(`Reading ${file.name}…`);
  try {
    const { data, format } = await readFile(file);
    await viewer.clear();
    await viewer.loadData(data, format, file.name);
    afterLoad(file.name);
  } catch (e) {
    status.fail(`Could not load ${file.name}.`, e.message);
  }
}

async function loadPdbId(raw) {
  const id = raw.trim().toLowerCase();
  if (!/^[0-9a-z]{4}$/.test(id)) {
    status.fail('A PDB ID is four characters, like 1ubq.', `Got "${raw.trim()}".`);
    return;
  }
  status.clear();
  status.busy(`Fetching ${id.toUpperCase()} from rcsb.org…`);
  try {
    await viewer.clear();
    await viewer.loadPdbId(id);
    afterLoad(id.toUpperCase() + ' (rcsb.org)');
  } catch (e) {
    status.fail(`Could not fetch ${id.toUpperCase()}.`, e.message);
  }
}

function afterLoad(label) {
  ui.empty.hidden = true;
  ui.clear.disabled = false;

  // The structure is on screen at this point. A summary that cannot be read is worth a warning,
  // never a failure: showing the target is the job, the table beside it is a convenience.
  let summary = null;
  try {
    const structure = viewer.loadedStructure();
    if (structure) summary = summarise(structure);
  } catch (e) {
    status.warn(`Loaded ${label}, but could not summarise it.`, e.message);
    ui.summaryWrap.hidden = true;
    return;
  }

  if (!summary) {
    status.warn(`Loaded ${label}, but found no structure to summarise.`);
    ui.summaryWrap.hidden = true;
    return;
  }

  renderSummary(summary);
  const chainWord = summary.chains.length === 1 ? 'chain' : 'chains';
  status.info(`Loaded ${label} — ${summary.chains.length} polymer ${chainWord}, ${summary.totalAtoms.toLocaleString()} atoms.`);
}

function renderSummary(s) {
  const rows = [
    ['Entry', s.entryId || '—'],
    ['Models', String(s.modelCount)],
    ['Atoms', s.totalAtoms.toLocaleString()],
    ['Waters', s.waters.toLocaleString()],
    ['Other residues', s.ligands.toLocaleString()],
  ];

  ui.summary.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    ui.summary.append(dt, dd);
  }

  ui.chains.replaceChildren();
  for (const c of s.chains) {
    const tr = document.createElement('tr');

    const id = document.createElement('td');
    id.textContent = c.id + (c.kind === 'nucleic' ? ' · na' : '');

    const n = document.createElement('td');
    n.textContent = String(c.residues);

    const range = document.createElement('td');
    range.textContent = c.first === null ? '—' : `${c.first}–${c.last}`;

    tr.append(id, n, range);

    const seqRow = document.createElement('tr');
    const seqCell = document.createElement('td');
    seqCell.colSpan = 3;
    seqCell.className = 'seq';
    seqCell.textContent = c.sequence;
    seqRow.append(seqCell);

    ui.chains.append(tr, seqRow);
  }

  ui.chainsNote.textContent = s.modelCount > 1
    ? `Chains are from model 1 of ${s.modelCount}.`
    : '';
  ui.summaryWrap.hidden = false;
}

async function clearTarget() {
  await viewer.clear();
  ui.empty.hidden = false;
  ui.clear.disabled = true;
  ui.summaryWrap.hidden = true;
  ui.file.value = '';
  status.clear();
}

// Controls.
ui.file.addEventListener('change', () => {
  const file = ui.file.files && ui.file.files[0];
  if (file) loadFile(file);
});

ui.fetch.addEventListener('click', () => loadPdbId(ui.pdbid.value));
ui.pdbid.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPdbId(ui.pdbid.value); });
ui.clear.addEventListener('click', () => clearTarget());

// Drag and drop onto the panel.
for (const type of ['dragenter', 'dragover']) {
  ui.drop.addEventListener(type, (e) => { e.preventDefault(); ui.drop.classList.add('over'); });
}
for (const type of ['dragleave', 'dragend']) {
  ui.drop.addEventListener(type, () => ui.drop.classList.remove('over'));
}
ui.drop.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.drop.classList.remove('over');
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) loadFile(file);
});

// The page is useless without the viewer, so a boot failure is a hard failure.
boot().catch((e) => status.fail('The viewer did not start.', e.message));
