/* layout.js — constellation layout engine (pure functions, browser + Node).
   Hierarchy: constellation = creator, asterism = model family, star = ranked variant.
   Asterism shapes: 1 star = point, 2 = pair, >=3 = irregular CLOSED polygon (3-5 vertices) plus an optional tail chain,
   each with a seeded rotation / aspect / vertex jitter so no two look alike and no edge is axis-aligned.
   Constellation: asterisms are packed compactly around the strongest one (seeded directions) and consecutive asterisms
   are joined by a single faint link edge (nearest vertex pair), like the sub-figures of Orion or Ursa Major.
   Labels: every star's label picks a side (R/L/T/B) minimising edge crossings and overlaps; edges are trimmed at the
   glyphs and broken where they would cross a label. The whole figure is scaled up until labels fit.
   Global: first-fit packing of constellation bounding boxes along a golden-angle spiral from the centre, constrained to
   an ellipse so the corners of the desktop stay free. Deterministic: same data + viewport => same sky. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AALayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const SIDES = ['R', 'L', 'T', 'B'], SIDE_PENALTY = { R: 0, L: .6, T: 1.5, B: 1.5 };

  function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rand(seed, salt) { let x = hash(seed + '|' + salt) || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }

  // ---- rect helpers ----
  const expand = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
  const overlap = (a, b, pad) => !(a.x + a.w + (pad || 0) <= b.x || b.x + b.w + (pad || 0) <= a.x || a.y + a.h + (pad || 0) <= b.y || b.y + b.h + (pad || 0) <= a.y);
  const inside = (r, b) => r.x >= b.x && r.y >= b.y && r.x + r.w <= b.x + b.w && r.y + r.h <= b.y + b.h;
  const inEllipse = (x, y, e) => ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;
  // centre + edge midpoints inside (corners of the conservative boxes may poke out a little without breaking the silhouette)
  const rectInEllipse = (r, e) => inEllipse(r.x + r.w / 2, r.y + r.h / 2, e) && inEllipse(r.x, r.y + r.h / 2, e) && inEllipse(r.x + r.w, r.y + r.h / 2, e) && inEllipse(r.x + r.w / 2, r.y, e) && inEllipse(r.x + r.w / 2, r.y + r.h, e);
  function union(rects) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const glyphRect = s => ({ x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r });
  function labelRect(p, size, side, gap) {
    if (side === 'R') return { x: p.x + gap, y: p.y - size.h / 2, w: size.w, h: size.h };
    if (side === 'L') return { x: p.x - gap - size.w, y: p.y - size.h / 2, w: size.w, h: size.h };
    if (side === 'T') return { x: p.x - size.w / 2, y: p.y - gap - size.h, w: size.w, h: size.h };
    return { x: p.x - size.w / 2, y: p.y + gap, w: size.w, h: size.h };
  }
  function clipInterval(x0, y0, x1, y1, r) {  // Liang–Barsky
    const dx = x1 - x0, dy = y1 - y0; let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, x0 - r.x], [dx, r.x + r.w - x0], [-dy, y0 - r.y], [dy, r.y + r.h - y0]]) {
      if (p === 0) { if (q < 0) return null; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return t0 < t1 ? [t0, t1] : null;
  }
  const crosses = (x0, y0, x1, y1, r) => clipInterval(x0, y0, x1, y1, r) !== null;

  // ---- asterism synthesis (local px at scale 1) ----
  function asterismShape(k, seed) {
    if (k === 1) return { pts: [{ x: 0, y: 0 }], edges: [] };
    if (k === 2) {
      const a = rand(seed, 'a2') * Math.PI, L = 64 + rand(seed, 'l2') * 34;
      return { pts: [{ x: -Math.cos(a) * L / 2, y: -Math.sin(a) * L / 2 }, { x: Math.cos(a) * L / 2, y: Math.sin(a) * L / 2 }], edges: [[0, 1, 'core']] };
    }
    let m = k === 3 ? 3 : k === 4 ? (rand(seed, 'm') < .7 ? 4 : 3) : k === 5 ? (rand(seed, 'm') < .5 ? 5 : 4) : (rand(seed, 'm') < .6 ? 5 : 4);
    const R = 40 + 10 * m, rot = rand(seed, 'rot') * TAU, aspect = .8 + rand(seed, 'asp') * .45;
    const pts = [], edges = [];
    for (let i = 0; i < m; i++) {
      const th = rot + (i / m) * TAU + (rand(seed, 'th' + i) - .5) * (TAU / m) * .5;
      const r = R * (.72 + rand(seed, 'r' + i) * .45);
      pts.push({ x: Math.cos(th) * r * aspect, y: Math.sin(th) * r });
    }
    for (let i = 0; i < m; i++) edges.push([i, (i + 1) % m, 'core']);
    let prev = Math.floor(rand(seed, 'tv') * m), dir = Math.atan2(pts[prev].y, pts[prev].x);
    for (let t = 0; t < k - m; t++) {
      dir += (rand(seed, 'td' + t) - .5) * 1.0;
      const L = R * (.75 + rand(seed, 'tl' + t) * .4);
      pts.push({ x: pts[prev].x + Math.cos(dir) * L, y: pts[prev].y + Math.sin(dir) * L });
      edges.push([prev, pts.length - 1, 'tail']); prev = pts.length - 1;
    }
    return { pts, edges };
  }

  /** families: [{ key, stars: [{ id, r, label:{w,h} }] }] in rank order. Returns unscaled composition. */
  function compose(families, seed, opts) {
    const gap = opts.labelGap, placed = [], pts = [], edges = [];
    const allowance = (p, s) => ({ x: p.x - s.r - 4, y: p.y - Math.max(s.label.h / 2, s.r) - 4, w: s.r + 8 + gap + s.label.w, h: Math.max(s.label.h, 2 * s.r) + 8 });
    families.forEach((f, j) => {
      const shape = asterismShape(f.stars.length, seed + '|' + f.key);
      const lb = union(shape.pts.map((p, i) => allowance(p, f.stars[i])));
      let off = { x: 0, y: 0 };
      if (j > 0) {
        const cl = union(placed.map(a => a.rect)), cx = cl.x + cl.w / 2, cy = cl.y + cl.h / 2, a0 = rand(seed, 'ang' + j) * TAU;
        search: for (let ring = 0; ring < 80; ring++) {
          const rad = 16 + ring * 16;
          for (let s = 0; s < 14; s++) {
            const a = a0 + s * (TAU / 14) + ring * .31;
            const ox = cx + Math.cos(a) * rad - (lb.x + lb.w / 2), oy = cy + Math.sin(a) * rad * .78 - (lb.y + lb.h / 2);
            const r = { x: lb.x + ox, y: lb.y + oy, w: lb.w, h: lb.h };
            if (!placed.some(p => overlap(p.rect, r, opts.asterismPad))) { off = { x: ox, y: oy }; break search; }
          }
        }
      }
      const base = pts.length;
      shape.pts.forEach((p, i) => pts.push({ star: f.stars[i], x: p.x + off.x, y: p.y + off.y, fam: j }));
      shape.edges.forEach(([a, b, kind]) => edges.push([base + a, base + b, kind]));
      if (j > 0) {
        let best = null;
        for (let i = base; i < pts.length; i++) for (let q = 0; q < base; q++) { const d = Math.hypot(pts[i].x - pts[q].x, pts[i].y - pts[q].y); if (!best || d < best.d) best = { d, i, q }; }
        edges.push([best.i, best.q, 'link']);
      }
      placed.push({ key: f.key, rect: { x: lb.x + off.x, y: lb.y + off.y, w: lb.w, h: lb.h }, base, n: shape.pts.length });
    });
    return { pts, edges, asterisms: placed };
  }

  // ---- label side assignment ----
  function evaluate(pts, stars, edges, sides, gap, pad) {
    const labels = pts.map((p, i) => labelRect(p, stars[i].label, sides[i], gap));
    let overlaps = 0, hits = 0, crossings = 0, penalty = 0;
    for (let i = 0; i < labels.length; i++) {
      penalty += SIDE_PENALTY[sides[i]];
      for (let j = i + 1; j < labels.length; j++) if (overlap(labels[i], labels[j], pad)) overlaps++;
      for (let j = 0; j < pts.length; j++) if (j !== i && overlap(labels[i], glyphRect({ x: pts[j].x, y: pts[j].y, r: stars[j].r }), pad)) hits++;
    }
    for (const [a, b] of edges) for (let i = 0; i < labels.length; i++) if (crosses(pts[a].x, pts[a].y, pts[b].x, pts[b].y, expand(labels[i], 2))) crossings++;
    return { labels, overlaps, hits, crossings, cost: (overlaps + hits) * 100 + crossings * 12 + penalty };
  }
  function bestSides(pts, stars, edges, gap, pad) {
    const n = pts.length; let best = null;
    if (n <= 6) {
      const total = Math.pow(4, n), sides = new Array(n);
      for (let c = 0; c < total; c++) {
        let v = c; for (let i = 0; i < n; i++) { sides[i] = SIDES[v & 3]; v >>= 2; }
        const r = evaluate(pts, stars, edges, sides, gap, pad);
        if (!best || r.cost < best.cost) best = Object.assign({ sides: sides.slice() }, r);
      }
      return best;
    }
    const cx = pts.reduce((s, p) => s + p.x, 0) / n;             // outward-facing initial guess, then coordinate descent
    const sides = pts.map(p => (p.x >= cx ? 'R' : 'L'));
    let cur = evaluate(pts, stars, edges, sides, gap, pad);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 0; i < n; i++) {
        const keep = sides[i]; let bi = { side: keep, cost: cur.cost, r: cur };
        for (const s of SIDES) { if (s === keep) continue; sides[i] = s; const r = evaluate(pts, stars, edges, sides, gap, pad); if (r.cost < bi.cost) bi = { side: s, cost: r.cost, r }; }
        sides[i] = bi.side; if (bi.side !== keep) { cur = bi.r; improved = true; }
      }
      if (!improved) break;
    }
    return Object.assign({ sides: sides.slice() }, cur);
  }
  function trimmed(a, b, extra) {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, ta = a.r + extra, tb = b.r + extra;
    return ta + tb >= L ? null : [a.x + ux * ta, a.y + uy * ta, b.x - ux * tb, b.y - uy * tb];
  }
  function breakSegment(seg, rects, minLen) {
    if (!seg) return [];
    const [x0, y0, x1, y1] = seg, L = Math.hypot(x1 - x0, y1 - y0), cuts = [];
    for (const r of rects) { const iv = clipInterval(x0, y0, x1, y1, r); if (iv) cuts.push(iv); }
    cuts.sort((a, b) => a[0] - b[0]);
    const out = []; let t = 0;
    for (const [c0, c1] of cuts) { if (c0 > t) out.push([t, Math.min(c0, 1)]); t = Math.max(t, c1); }
    if (t < 1) out.push([t, 1]);
    return out.filter(([a, b]) => (b - a) * L >= minLen).map(([a, b]) => [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b]);
  }

  /** spec = { key, seed, name: {w,h} | null, families: [{ key, stars: [{ id, r, label:{w,h} }] }] } */
  function layoutConstellation(spec, opts) {
    const comp = compose(spec.families, spec.seed, opts), stars0 = comp.pts.map(p => p.star), pairs = comp.edges.map(e => [e[0], e[1]]);
    let best = null;  // search the scale from compact to loose; first violation-free scale wins
    for (let iter = 0; iter <= opts.maxGrow; iter++) {
      const s = opts.minScale + iter * opts.growStep, pts = comp.pts.map(p => ({ x: p.x * s, y: p.y * s }));
      const r = bestSides(pts, stars0, pairs, opts.labelGap, opts.labelPad);
      if (!best || r.cost < best.cost) best = Object.assign({ pts, s }, r);
      if (r.overlaps + r.hits === 0) break;
    }
    const stars = best.pts.map((p, i) => Object.assign({}, stars0[i], { x: p.x, y: p.y, side: best.sides[i], label: best.labels[i], fam: comp.pts[i].fam }));
    const blockers = stars.map(s => expand(s.label, 3));
    const edges = comp.edges.map(([a, b, kind]) => ({ a, b, kind, segments: breakSegment(trimmed(stars[a], stars[b], opts.edgeGap), blockers, opts.minSegment) }));
    const body = union(stars.map(s => s.label).concat(stars.map(glyphRect)));
    let name = null;
    if (spec.name) { const xs = stars.map(s => s.x); name = { x: (Math.min(...xs) + Math.max(...xs)) / 2 - spec.name.w / 2, y: body.y + body.h + opts.nameGap, w: spec.name.w, h: spec.name.h }; }
    const bbox = expand(union(name ? [body, name] : [body]), opts.margin);
    const asterisms = comp.asterisms.map(a => ({ key: a.key, base: a.base, n: a.n, rect: union(stars.slice(a.base, a.base + a.n).map(s => union([s.label, glyphRect(s)]))) }));
    return { stars, edges, name, bbox, asterisms, scale: best.s, crossings: best.crossings, violations: best.overlaps + best.hits };
  }

  /** Scatter `count` dim (unlabelled) stars inside the constellation's box, avoiding glyphs/labels/name. Extends bbox. */
  function placeDimStars(layout, count, seed, opts) {
    const b = expand(layout.bbox, opts.dimMargin), out = [];
    const blocked = layout.stars.map(s => expand(s.label, 6)).concat(layout.name ? [expand(layout.name, 6)] : []);
    for (let i = 0; i < count; i++) {
      let pick = null;
      for (let t = 0; t < 40 && !pick; t++) {
        const x = b.x + rand(seed, 'dx' + i + '_' + t) * b.w, y = b.y + rand(seed, 'dy' + i + '_' + t) * b.h;
        if (blocked.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) continue;
        if (layout.stars.some(s => Math.hypot(s.x - x, s.y - y) < s.r + opts.dimClear)) continue;
        if (out.some(d => Math.hypot(d.x - x, d.y - y) < opts.dimSpacing)) continue;
        pick = { x, y };
      }
      if (pick) out.push(pick);
    }
    if (out.length) layout.bbox = union([layout.bbox, expand(union(out.map(d => ({ x: d.x - 4, y: d.y - 4, w: 8, h: 8 }))), opts.margin)]);
    return out;
  }

  /** items: [{ key, bbox, pad }] in placement order; bounds: safe rect; opts.ellipse optional {cx,cy,rx,ry}. */
  function pack(items, bounds, opts) {
    // The first (largest) item at the exact centre can split the sky into two halves that are each too small for the
    // second item, so retry with the first item nudged outward along the spiral until everything fits.
    let best = null;
    for (let startK = 0; startK < 60; startK++) {
      const r = packOnce(items, bounds, opts, startK);
      if (!best || r.failed.length < best.failed.length) best = r;
      if (!r.failed.length) break;
    }
    return best;
  }
  function packOnce(items, bounds, opts, startK) {
    const placed = [], positions = new Map(), failed = [], e = opts.ellipse;
    const ay = bounds.h / bounds.w, cx0 = e ? e.cx : bounds.x + bounds.w / 2, cy0 = e ? e.cy : bounds.y + bounds.h / 2;
    for (const it of items) {
      let ok = false;
      for (let k = (it === items[0] ? startK : 0); k < opts.maxCandidates; k++) {
        const r = opts.step * Math.sqrt(k), th = k * GOLDEN;
        const cx = cx0 + r * Math.cos(th) + (rand(it.key, 'jx' + k) - .5) * opts.jitter;
        const cy = cy0 + r * Math.sin(th) * ay + (rand(it.key, 'jy' + k) - .5) * opts.jitter;
        const ox = cx - (it.bbox.x + it.bbox.w / 2), oy = cy - (it.bbox.y + it.bbox.h / 2);
        const rect = { x: it.bbox.x + ox, y: it.bbox.y + oy, w: it.bbox.w, h: it.bbox.h };
        if (!inside(rect, bounds)) continue;
        if (e && !rectInEllipse(rect, e)) continue;
        if (placed.some(p => overlap(p.rect, rect, Math.max(p.pad, it.pad)))) continue;
        placed.push({ rect, pad: it.pad }); positions.set(it.key, { x: ox, y: oy, rect }); ok = true; break;
      }
      if (!ok) failed.push(it.key);
    }
    return { positions, failed, placed };
  }

  const DEFAULTS = {
    minScale: .72, growStep: .08, maxGrow: 14, labelGap: 13, labelPad: 6, edgeGap: 5, minSegment: 9, nameGap: 16, margin: 10, asterismPad: 10,
    dimMargin: 20, dimClear: 24, dimSpacing: 26, step: 34, jitter: 18, maxCandidates: 9000,
  };
  return { asterismShape, compose, layoutConstellation, placeDimStars, pack, hash, rand, overlap, union, expand, labelRect, clipInterval, inEllipse, DEFAULTS };
});
