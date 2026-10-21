#!/usr/bin/env node
// Draws marketing/results-recovery.svg from marketing/bench-ubiquitin.json.
//
// One checkpoint per row, drawn as the range it produced with its median marked, because the
// finding is about spread and ordering rather than a single number: the three checkpoints overlap,
// and what separates them is where the middle of each sits.
//
//   node scripts/results-chart.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(ROOT, 'marketing/bench-ubiquitin.json'), 'utf8'));

// The page's own tokens, so the chart and the app are one surface.
const BG = '#fafaf8';
const FG = '#1c1c1a';
const MUTE = '#6b6b66';
const LINE = '#dcdcd6';
const ACCENT = '#2f6f5f';

const W = 760;
const H = 300;
const LEFT = 182;
const RIGHT = W - 40;
const TOP = 64;
const ROW = 54;

const LOW = 48;
const HIGH = 66;
const x = (v) => LEFT + ((v - LOW) / (HIGH - LOW)) * (RIGHT - LEFT);

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const parts = [];
const add = (s) => parts.push(s);

add(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
add(`<text x="40" y="34" fill="${FG}" font-size="16" font-weight="600">`
  + `Three checkpoints, one backbone</text>`);
add(`<text x="40" y="52" fill="${MUTE}" font-size="12">`
  + `${data.target}, ${data.settings.sequences} sequences each at temperature `
  + `${data.settings.temperature}, seed ${data.settings.seed}</text>`);

// Grid.
for (let v = 50; v <= 65; v += 5) {
  add(`<line x1="${x(v).toFixed(1)}" y1="${TOP}" x2="${x(v).toFixed(1)}" y2="${TOP + ROW * data.checkpoints.length}" stroke="${LINE}" stroke-width="1"/>`);
  add(`<text x="${x(v).toFixed(1)}" y="${TOP + ROW * data.checkpoints.length + 18}" fill="${MUTE}" font-size="11" text-anchor="middle">${v}%</text>`);
}

data.checkpoints.forEach((c, i) => {
  const y = TOP + ROW * i + ROW / 2;
  const lo = Math.min(...c.recovery);
  const hi = Math.max(...c.recovery);
  const mid = median(c.recovery);

  add(`<text x="${LEFT - 14}" y="${y - 3}" fill="${FG}" font-size="12" font-weight="600" text-anchor="end">${c.label}</text>`);
  add(`<text x="${LEFT - 14}" y="${y + 13}" fill="${MUTE}" font-size="11" text-anchor="end">${c.trained}</text>`);

  add(`<line x1="${x(lo).toFixed(1)}" y1="${y}" x2="${x(hi).toFixed(1)}" y2="${y}" stroke="${ACCENT}" stroke-width="3" stroke-linecap="round" opacity="0.35"/>`);
  for (const v of c.recovery) {
    add(`<circle cx="${x(v).toFixed(1)}" cy="${y}" r="3.5" fill="${ACCENT}" opacity="0.55"/>`);
  }
  add(`<circle cx="${x(mid).toFixed(1)}" cy="${y}" r="6" fill="${ACCENT}"/>`);
  add(`<text x="${(x(hi) + 12).toFixed(1)}" y="${y + 4}" fill="${ACCENT}" font-size="12" font-weight="600">${hi.toFixed(1)}%</text>`);
});

const base = TOP + ROW * data.checkpoints.length + 34;
add(`<text x="40" y="${base + 10}" fill="${MUTE}" font-size="11">`
  + `Each dot is one designed sequence; the filled dot is the median. Measured ${data.measured} `
  + `in the browser on WebGPU, ${data.seconds} s for all 15.</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" `
  + `font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" `
  + `aria-label="Sequence recovery on ubiquitin chain A for three ProteinMPNN checkpoints. `
  + data.checkpoints.map((c) => `${c.label}: ${Math.min(...c.recovery)} to ${Math.max(...c.recovery)} percent`).join('. ')
  + `.">\n${parts.join('\n')}\n</svg>\n`;

writeFileSync(join(ROOT, 'marketing/results-recovery.svg'), svg);
console.log(`Wrote marketing/results-recovery.svg (${svg.length} bytes).`);
for (const c of data.checkpoints) {
  console.log(`  ${c.label.padEnd(22)} ${Math.min(...c.recovery)}–${Math.max(...c.recovery)}%  median ${median(c.recovery)}%`);
}
