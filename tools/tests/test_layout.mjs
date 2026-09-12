// Layout engine test: creator constellations from the real snapshot, synthetic label sizes. node.exe tools/test_layout.mjs [N] [W] [H]
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const L = require(path.join(ROOT, 'wallpapers', 'constellation', 'src', 'js', 'layout.js'));
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'aa', 'language', 'cosmos-data.json'), 'utf8'));
const TOP_N = parseInt(process.argv[2] || '40'), W = parseInt(process.argv[3] || '2560'), H = parseInt(process.argv[4] || '1440');
const label = m => { const line2 = (m.family + (m.short_variant ? ' · ' + m.short_variant : '')).length * 5.4 + 12; const line1 = m.rank_intelligence <= 3 ? 132 : m.is_family_best ? 104 : 84; return { w: Math.max(line1, line2), h: m.rank_intelligence <= 3 ? 64 : m.is_family_best ? 50 : 38 }; };
const glyphR = m => (m.rank_intelligence <= 3 ? 9 : m.is_family_best ? 7 : 5.5);
const top = doc.models.filter(m => m.rank_intelligence && m.rank_intelligence <= TOP_N), dim = doc.models.filter(m => m.rank_intelligence > TOP_N && m.rank_intelligence <= 2 * TOP_N);
const byC = new Map();
for (const m of top) { if (!byC.has(m.creator_key)) byC.set(m.creator_key, { key: m.creator_key, name: m.creator, fams: new Map(), dims: 0 }); const c = byC.get(m.creator_key); if (!c.fams.has(m.family_key)) c.fams.set(m.family_key, []); c.fams.get(m.family_key).push(m); }
for (const m of dim) if (byC.has(m.creator_key)) byC.get(m.creator_key).dims++;
const opts = Object.assign({}, L.DEFAULTS), items = [];
for (const c of byC.values()) {
  const fams = [...c.fams.values()].map(ms => ms.sort((a, b) => a.rank_intelligence - b.rank_intelligence)).sort((a, b) => a[0].rank_intelligence - b[0].rank_intelligence);
  const n = fams.reduce((s, f) => s + f.length, 0);
  const lay = L.layoutConstellation({ key: c.key, seed: c.key, name: n >= 2 ? { w: c.name.length * 9.5, h: 16 } : null, families: fams.map(f => ({ key: f[0].family_key, stars: f.map(m => ({ id: m.id, r: glyphR(m), label: label(m) })) })) }, opts);
  const dims = L.placeDimStars(lay, c.dims, c.key, opts);
  items.push({ key: c.key, name: c.name, rank: fams[0][0].rank_intelligence, n, fams: fams.length, dims: dims.length, want: c.dims, lay, pad: n >= 2 ? 26 : 18 });
}
items.sort((a, b) => a.rank - b.rank);
const bounds = { x: 90, y: 151, w: W - 180, h: H - 151 - 190 };
const ellipse = { cx: W / 2, cy: bounds.y + bounds.h / 2, rx: Math.min(bounds.w / 2, W * .44), ry: Math.min(bounds.h / 2, H * .39) };
const res = L.pack(items.map(i => ({ key: i.key, bbox: i.lay.bbox, pad: i.pad })), bounds, Object.assign({ ellipse }, opts));
let overlapPairs = 0; const rects = [...res.positions.values()].map(p => p.rect);
for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (L.overlap(rects[i], rects[j], 0)) overlapPairs++;
console.log(`TOP ${TOP_N} @ ${W}x${H}: constellations=${items.length} placed=${res.positions.size} failed=${JSON.stringify(res.failed)} overlapPairs=${overlapPairs} fill=${(rects.reduce((s, r) => s + r.w * r.h, 0) / (Math.PI * ellipse.rx * ellipse.ry) * 100).toFixed(0)}% of ellipse`);
for (const it of items) { const p = res.positions.get(it.key); console.log(`  ${it.name.padEnd(12)} stars=${String(it.n).padStart(2)} fams=${it.fams} dims=${it.dims}/${it.want} scale=${it.lay.scale.toFixed(2)} bbox=${Math.round(it.lay.bbox.w)}x${Math.round(it.lay.bbox.h)} cross=${it.lay.crossings} viol=${it.lay.violations} at=(${p ? Math.round(p.rect.x) : '-'},${p ? Math.round(p.rect.y) : '-'})`); }
