// Parity test: shared/aa/language/aa-normalize.js (JS port) vs data/aa/language/cosmos-data.json (Python reference). node.exe tools/tests/test_normalize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const N = require(path.join(ROOT, 'shared', 'aa', 'language', 'aa-normalize.js'));
const ref = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'aa', 'language', 'cosmos-data.json'), 'utf8'));
const colorsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'aa', 'creator-colors.json'), 'utf8'));
const colors = Object.fromEntries(Object.entries(colorsDoc.creators).map(([k, v]) => [k, v.color]));
const snaps = fs.readdirSync(path.join(ROOT, 'data', 'aa', 'language', 'snapshots')).filter(d => !d.endsWith('.tmp')).sort();
const load = d => { const dir = path.join(ROOT, 'data', 'aa', 'language', 'snapshots', d); const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const pages = fs.readdirSync(dir).filter(f => /^page-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); return { meta, pages }; };
const cur = load(snaps[snaps.length - 1]), prev = load(snaps[snaps.length - 2]);
const prevNorm = N.normalize(prev.pages, prev.meta.fetched_at, colors);
const prevCompact = N.toCompact(prevNorm.models, prev.meta.fetched_at);
const doc = N.buildDocument(cur.pages, cur.meta.fetched_at, colors, prevCompact);

let bad = 0; const report = (msg) => { if (bad++ < 25) console.log('  MISMATCH', msg); };
if (doc.fetched_at !== ref.fetched_at) report(`fetched_at ${doc.fetched_at} vs ${ref.fetched_at}`);
if (doc.previous_fetched_at !== ref.previous_fetched_at) report('previous_fetched_at');
if (doc.intelligence_index_version !== ref.intelligence_index_version) report('version');
if (doc.models.length !== ref.models.length) report('models length');
const near = (a, b) => (a == null || b == null) ? a === b : Math.abs(a - b) < 1e-9;
ref.models.forEach((rm, i) => {
  const jm = doc.models[i];
  if (!jm || jm.id !== rm.id) { report(`order at ${i}: ${jm && jm.name} vs ${rm.name}`); return; }
  for (const k of Object.keys(rm)) {
    const a = jm[k], b = rm[k];
    if (typeof b === 'number' ? !near(a, b) : a !== b) report(`${rm.name} .${k}: js=${JSON.stringify(a)} py=${JSON.stringify(b)}`);
  }
});
ref.families.forEach((rf, i) => {
  const jf = doc.families[i];
  if (!jf || jf.family_key !== rf.family_key) { report(`family order at ${i}`); return; }
  for (const k of Object.keys(rf)) {
    const a = jf[k], b = rf[k];
    const same = Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : (typeof b === 'number' ? near(a, b) : a === b);
    if (!same) report(`family ${rf.family_key} .${k}: js=${JSON.stringify(a)} py=${JSON.stringify(b)}`);
  }
});
for (const k of Object.keys(ref.counts)) if (doc.counts[k] !== ref.counts[k]) report(`counts.${k} ${doc.counts[k]} vs ${ref.counts[k]}`);
console.log(bad ? `PARITY FAILED: ${bad} mismatches` : `PARITY OK: ${doc.models.length} models, ${doc.families.length} families, counts identical, all fields equal`);
process.exit(bad ? 1 : 0);
