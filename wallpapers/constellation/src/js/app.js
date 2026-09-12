/* app.js — renderer for the AI Constellation Leaderboard. Reads window.COSMOS_DATA (from aa-fetch.js or the bundled
   fixture) and draws: background sky (canvas), constellation edges (SVG), stars + labels (DOM), hover annotation,
   family focus, slow ambient motion. Layout is delegated to layout.js and only rebuilt when data/size/props change. */
(() => {
  'use strict';
  const L = window.AALayout, TAU = Math.PI * 2;
  const $ = id => document.getElementById(id);
  const canvas = $('space'), ctx = canvas.getContext('2d', { alpha: false });
  const svg = $('lines'), atlas = $('atlas'), overlay = $('overlay'), annot = $('annot'), measureBox = $('measure');
  const S = {
    data: null, topN: 40, ambient: .28, fps: 15, showBg: true, showLegend: true, dimStars: true, skyW: 88, skyH: 78,
    w: 0, h: 0, ui: 1, items: [], itemByKey: new Map(), modelById: new Map(), topKeys: new Set(),
    bg: [], starField: null, nebulae: [], focus: null, hoverEl: null, last: 0, meteor: null, nextMeteor: 0,
    debug: /[?&]debug=1/.test(location.search), built: false,
  };
  if (S.debug) document.body.classList.add('debug');
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad2 = n => String(n).padStart(2, '0');
  const fmt = (v, d = 1) => (v == null || Number.isNaN(v)) ? '—' : Number(v).toFixed(d).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const money = v => v == null ? '—' : v === 0 ? '$0' : v < .1 ? '$' + v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : v < 10 ? '$' + v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') : '$' + v.toFixed(0);
  const parseHex = hex => (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) ? null : [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const lum = rgb => (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255;
  // Creator colour -> star colour: lift very dark brand colours so they read on the dark sky; null -> neutral star white-blue.
  function starRGB(hex) {
    let rgb = parseHex(hex); if (!rgb) return [184, 200, 230];
    const l = lum(rgb); if (l < .30) { const a = clamp((.52 - l) / .52, .45, .85); rgb = rgb.map(c => Math.round(lerp(c, 236, a))); }
    return rgb;
  }
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const rgbstr = rgb => `${rgb[0]},${rgb[1]},${rgb[2]}`;
  const dateShort = iso => { if (!iso) return '—'; const d = new Date(iso); return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`; };
  const ago = d => d == null ? '—' : d === 0 ? 'today' : d === 1 ? '1 day ago' : d < 60 ? `${d} days ago` : d < 730 ? `${Math.round(d / 30)} months ago` : `${(d / 365).toFixed(1)} years ago`;
  const deltaHTML = m => (m.rank_delta == null || m.rank_delta === 0) ? '' : `<span class="delta ${m.rank_delta > 0 ? 'up' : 'down'}">${m.rank_delta > 0 ? '↑' : '↓'}${Math.abs(m.rank_delta)}</span>`;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  // ---------- data prep ----------
  // constellation = creator; asterism = family; bright stars = rank <= N; dim stars = N < rank <= 2N (same creator, no lines)
  function prepare() {
    const d = S.data; S.modelById = new Map(d.models.map(m => [m.id, m]));
    const byRank = (a, b) => a.rank_intelligence - b.rank_intelligence;
    const cons = new Map();
    for (const m of d.models) {
      if (m.rank_intelligence == null || m.rank_intelligence > 2 * S.topN) continue;
      const bright = m.rank_intelligence <= S.topN;
      if (!bright && !S.dimStars) continue;
      if (!cons.has(m.creator_key)) cons.set(m.creator_key, { key: m.creator_key, creator: m.creator, color: m.creator_color, fams: new Map(), dims: [] });
      const c = cons.get(m.creator_key);
      if (bright) { if (!c.fams.has(m.family_key)) c.fams.set(m.family_key, []); c.fams.get(m.family_key).push(m); } else c.dims.push(m);
    }
    const out = [];
    for (const c of cons.values()) {
      if (!c.fams.size) continue;  // creators with only dim-tier models stay in the background field
      c.families = [...c.fams.values()].map(ms => ms.sort(byRank)).sort((a, b) => byRank(a[0], b[0]));
      c.models = c.families.flat(); c.best = c.models[0]; c.dims.sort(byRank);
      out.push(c);
    }
    out.sort((a, b) => byRank(a.best, b.best));
    S.shownFamilies = new Set(out.flatMap(c => c.models.concat(c.dims).map(m => m.family_key)));
    return out;
  }

  // ---------- DOM factories ----------
  const tierClass = m => (m.rank_intelligence <= 3 ? ' top3' : '') + (m.is_family_best ? ' best' : '');
  const glyphR = m => m.rank_intelligence <= 3 ? 9 * S.ui : m.is_family_best ? 7 * S.ui : 5.5 * S.ui;
  function labelHTML(m) {
    const line2 = m.family + (m.short_variant ? ' · ' + m.short_variant : (m.variant ? ' · ' + m.variant : ''));
    return `<div class="rankline"><b class="rank">${pad2(m.rank_intelligence)}</b><span class="score">${fmt(m.intelligence, 1)}</span>${deltaHTML(m)}</div><div class="variant">${esc(line2)}</div>`;
  }
  function makeLabel(m, extra) { const e = el('div', 'label' + tierClass(m) + (extra ? ' ' + extra : ''), labelHTML(m)); e.dataset.id = m.id; return e; }
  function makeSpark(m) {
    const e = el('i', 'spark' + tierClass(m), '<i class="halo"></i><i class="trail"></i><i class="hit"></i>'); e.dataset.id = m.id;
    e.style.setProperty('--ph', (L.rand(m.id, 'ph') * -9).toFixed(2) + 's');
    if (m.days_since_release != null && m.days_since_release <= 30) { e.classList.add('newborn'); e.style.setProperty('--birth', (1 - m.days_since_release / 30).toFixed(3)); }
    if (m.rank_delta > 0) e.classList.add('moved-up'); else if (m.rank_delta < 0) e.classList.add('moved-down');
    return e;
  }
  function measure(node) { measureBox.appendChild(node); const r = { w: node.offsetWidth, h: node.offsetHeight }; measureBox.removeChild(node); return r; }

  // ---------- build ----------
  function optsFor(ui) {
    return Object.assign({}, L.DEFAULTS, {
      labelGap: 13 * ui, labelPad: 6 * ui, edgeGap: 5 * ui, minSegment: 9 * ui, nameGap: 16 * ui, margin: 10 * ui, asterismPad: 10 * ui,
      dimMargin: 20 * ui, dimClear: 22 * ui, dimSpacing: 20 * ui, step: 34 * ui, jitter: 18 * ui,
    });
  }
  function bounds() {
    const mx = Math.round(S.w * .035), top = Math.round(S.h * .105), bottom = Math.round(S.h * .09) + 60; // 60 = taskbar
    return { x: mx, y: top, w: S.w - 2 * mx, h: S.h - top - bottom };
  }
  function ellipseFor(b) {
    return { cx: S.w / 2, cy: b.y + b.h / 2, rx: Math.min(b.w / 2, S.w * S.skyW / 200), ry: Math.min(b.h / 2, S.h * S.skyH / 200) };
  }
  function build() {
    if (!S.data) return;
    const t0 = performance.now();
    S.w = innerWidth; S.h = innerHeight;
    canvas.width = S.w; canvas.height = S.h;  // SVG layers use no viewBox: user units == CSS px
    const cons = prepare(), b = bounds(), ell = ellipseFor(b);
    let result = null;
    for (const ui of [1, .92, .85, .78, .72, .66, .6, .55]) {
      S.ui = ui; document.documentElement.style.setProperty('--ui', ui);
      const opts = optsFor(ui), items = [];
      for (const c of cons) {
        // scale the asterism geometry with the UI too (shape synthesis is in px at ui = 1)
        const families = c.families.map(ms => ({ key: ms[0].family_key, stars: ms.map(m => ({ id: m.id, r: glyphR(m), label: measure(makeLabel(m)) })) }));
        const name = c.models.length >= 2 ? measure(el('div', 'cname', esc(c.creator))) : null;
        const geo = Object.assign({}, opts, { minScale: opts.minScale * ui, growStep: opts.growStep * ui });
        const lay = L.layoutConstellation({ key: c.key, seed: c.key, name, families }, geo);
        const dims = L.placeDimStars(lay, c.dims.length, c.key, opts);
        items.push({ key: c.key, con: c, models: c.models, lay, dims, pad: (c.models.length >= 2 ? 26 : 18) * ui });
      }
      const specs = items.map(i => ({ key: i.key, bbox: i.lay.bbox, pad: i.pad }));
      let res = L.pack(specs, b, Object.assign({ ellipse: ell }, opts));
      if (res.failed.length && ui <= .72) res = L.pack(specs, b, opts);  // last resorts: drop the ellipse, then the margins
      if (res.failed.length && ui <= .6) res = L.pack(specs, { x: 12, y: 12, w: S.w - 24, h: S.h - 84 }, opts);
      result = { items, res, opts };
      if (!res.failed.length) break;
    }
    recentre(result.res, b, ell);
    const t1 = performance.now();
    commit(result, b, ell);
    buildBackground();
    S.built = true;
    if (S.debug) console.log(`[build] layout ${(t1 - t0).toFixed(0)} ms (ui=${S.ui}, tries=${[1, .92, .85, .78, .72, .66, .6, .55].indexOf(S.ui) + 1}) + dom ${(performance.now() - t1).toFixed(0)} ms`);
  }
  function recentre(res, b, ell) {  // shift the whole arrangement so its centre sits on the ellipse centre (keeps it inside bounds)
    const rects = [...res.positions.values()].map(p => p.rect); if (!rects.length) return;
    const u = L.union(rects);
    let dx = ell.cx - (u.x + u.w / 2), dy = ell.cy - (u.y + u.h / 2);
    dx = clamp(dx, b.x - u.x, b.x + b.w - (u.x + u.w)); dy = clamp(dy, b.y - u.y, b.y + b.h - (u.y + u.h));
    for (const p of res.positions.values()) { p.x += dx; p.y += dy; p.rect = { x: p.rect.x + dx, y: p.rect.y + dy, w: p.rect.w, h: p.rect.h }; }
  }
  function commit({ items, res }, b, ell) {
    atlas.innerHTML = ''; svg.innerHTML = ''; S.items = []; S.itemByKey = new Map(); clearFocus(true); hideAnnot();
    for (const it of items) {
      let pos = res.positions.get(it.key);
      if (!pos) { const r = it.lay.bbox; pos = { x: b.x + b.w - r.w - r.x, y: b.y + b.h - r.h - r.y, rect: null }; it.unplaced = true; }
      const rgb = starRGB(it.con.color), c = rgbstr(rgb), lay = it.lay;
      const sec = el('section', 'constellation' + (it.unplaced ? ' unplaced' : '')); sec.dataset.key = it.key; sec.style.setProperty('--c', c);
      sec.style.left = pos.x + 'px'; sec.style.top = pos.y + 'px';
      const g = svgEl('g', { class: 'edges', transform: `translate(${pos.x},${pos.y})` });
      lay.stars.forEach((st, i) => {
        const m = it.models[i], spark = makeSpark(m), label = makeLabel(m);
        spark.style.left = st.x + 'px'; spark.style.top = st.y + 'px';
        label.classList.add('side-' + st.side); label.style.left = st.label.x + 'px'; label.style.top = st.label.y + 'px'; label.style.width = st.label.w + 'px';
        wire(spark, m); wire(label, m); sec.appendChild(spark); sec.appendChild(label);
      });
      it.dims.forEach((p, i) => {
        const m = it.con.dims[i]; if (!m) return;
        const spark = el('i', 'spark dim', '<i class="halo"></i><i class="hit"></i>'); spark.dataset.id = m.id;
        spark.style.left = p.x + 'px'; spark.style.top = p.y + 'px'; spark.style.setProperty('--ph', (L.rand(m.id, 'ph') * -9).toFixed(2) + 's');
        wire(spark, m); sec.appendChild(spark);
      });
      if (lay.name) { const nm = el('div', 'cname', esc(it.con.creator)); nm.style.left = lay.name.x + 'px'; nm.style.top = lay.name.y + 'px'; nm.style.width = lay.name.w + 'px'; sec.appendChild(nm); }
      for (const e of lay.edges) for (const [x1, y1, x2, y2] of e.segments) g.appendChild(svgEl('line', { x1, y1, x2, y2, class: e.kind, stroke: rgba(rgb, e.kind === 'link' ? .18 : e.kind === 'tail' ? .26 : .32) }));
      if (S.debug) {
        g.appendChild(svgEl('rect', { x: lay.bbox.x, y: lay.bbox.y, width: lay.bbox.w, height: lay.bbox.h, fill: 'none', stroke: 'rgba(255,80,80,.5)', 'stroke-dasharray': '4 4' }));
        for (const a of lay.asterisms) g.appendChild(svgEl('rect', { x: a.rect.x, y: a.rect.y, width: a.rect.w, height: a.rect.h, fill: 'none', stroke: 'rgba(255,200,80,.35)', 'stroke-dasharray': '2 3' }));
        for (const st of lay.stars) g.appendChild(svgEl('rect', { x: st.label.x, y: st.label.y, width: st.label.w, height: st.label.h, fill: 'none', stroke: 'rgba(80,200,255,.45)' }));
      }
      atlas.appendChild(sec); svg.appendChild(g);
      const obstacles = lay.stars.map(st => ({ x: st.label.x + pos.x, y: st.label.y + pos.y, w: st.label.w, h: st.label.h })).concat(lay.name ? [{ x: lay.name.x + pos.x, y: lay.name.y + pos.y, w: lay.name.w, h: lay.name.h }] : []);
      const item = { key: it.key, con: it.con, models: it.models, lay, dims: it.dims, pos, sec, g, rgb, obstacles, phase: L.rand(it.key, 'drift') * TAU, T1: 200 + L.rand(it.key, 't1') * 160, T2: 260 + L.rand(it.key, 't2') * 200 };
      S.items.push(item); S.itemByKey.set(it.key, item);
    }
    if (S.debug) { svg.appendChild(svgEl('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: 'rgba(255,255,255,.25)' })); svg.appendChild(svgEl('ellipse', { cx: ell.cx, cy: ell.cy, rx: ell.rx, ry: ell.ry, fill: 'none', stroke: 'rgba(255,255,255,.2)', 'stroke-dasharray': '6 6' })); }
    $('topN').textContent = S.topN;
    $('indexVersion').textContent = S.data.intelligence_index_version || '—';
    $('updatedAt').textContent = `UPDATED ${dateShort(S.data.fetched_at)}`;
    const win = S.data.rank_window_days, prev = S.data.previous_fetched_at;
    $('baseline').textContent = prev ? `Δ VS ${dateShort(prev)}${win ? ` (${win}D WINDOW)` : ''}` : 'NO BASELINE YET';
    $('attribution').textContent = S.data.attribution || 'Data: Artificial Analysis · artificialanalysis.ai';
    $('sky-count').textContent = `${S.data.counts ? S.data.counts.models : S.data.models.length} MODELS · ${S.data.counts ? S.data.counts.families : '—'} FAMILIES OBSERVED`;
  }

  // ---------- background ----------
  function buildBackground() {
    const sf = document.createElement('canvas'); sf.width = S.w; sf.height = S.h; const c = sf.getContext('2d');
    const n = Math.round(S.w * S.h / 8500);
    for (let i = 0; i < n; i++) { const k = String(i); const x = L.rand(k, 'sx') * S.w, y = L.rand(k, 'sy') * S.h, r = .25 + L.rand(k, 'sr') * .75, a = .06 + L.rand(k, 'sa') * .2; c.fillStyle = `rgba(200,214,240,${a})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
    S.starField = sf;
    S.nebulae = [0, 1, 2].map(i => ({ x: .2 + L.rand('neb' + i, 'x') * .6, y: .25 + L.rand('neb' + i, 'y') * .5, r: (.28 + L.rand('neb' + i, 'r') * .22), hue: [[24, 40, 78], [58, 32, 84], [22, 62, 74]][i], phase: L.rand('neb' + i, 'p') * TAU }));
    const placed = S.items.filter(i => i.pos.rect).map(i => i.pos.rect);
    const list = S.data.families.filter(f => f.rank != null && !S.shownFamilies.has(f.family_key) && f.rank <= 320);
    S.bg = list.map(f => {
      let x = 0, y = 0;
      for (let k = 0; k < 12; k++) { x = (0.02 + L.rand(f.family_key, 'x' + k) * .96) * S.w; y = (0.06 + L.rand(f.family_key, 'y' + k) * .88) * S.h; if (!placed.some(r => x > r.x - 6 && x < r.x + r.w + 6 && y > r.y - 6 && y < r.y + r.h + 6)) break; }
      return { x, y, r: .5 + L.rand(f.family_key, 'r') * 1.1 + (f.rank <= 80 ? .5 : 0), rgb: starRGB(f.creator_color), phase: L.rand(f.family_key, 'p') * TAU, birth: f.days_since_release != null && f.days_since_release <= 30 ? 1 - f.days_since_release / 30 : 0 };
    });
  }
  function drawBackground(t) {
    ctx.fillStyle = '#04070f'; ctx.fillRect(0, 0, S.w, S.h);
    const amb = S.ambient;
    for (const nb of S.nebulae) {
      const x = (nb.x + Math.sin(t / 640000 + nb.phase) * .02 * amb) * S.w, y = (nb.y + Math.cos(t / 800000 + nb.phase) * .015 * amb) * S.h, r = nb.r * Math.max(S.w, S.h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${nb.hue},.12)`); g.addColorStop(.5, `rgba(${nb.hue},.045)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (S.starField) ctx.drawImage(S.starField, 0, 0);
    if (S.showBg) {
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const s of S.bg) {
        const x = s.x + Math.cos(t / 90000 + s.phase) * 1.6 * amb, y = s.y + Math.sin(t / 110000 + s.phase) * 1.2 * amb, a = .16 + .06 * Math.sin(t / 3500 + s.phase);
        ctx.fillStyle = rgba(s.rgb, a); ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
        if (s.birth > 0) { ctx.strokeStyle = rgba(s.rgb, .05 * s.birth); ctx.lineWidth = .7; ctx.beginPath(); ctx.arc(x, y, s.r * 3.5 + 2, 0, TAU); ctx.stroke(); }
      }
      ctx.restore();
    }
    drawMeteor(t);
  }
  function drawMeteor(t) {
    if (S.ambient <= 0) return;
    if (!S.meteor && t > S.nextMeteor) {
      if (S.nextMeteor === 0) { S.nextMeteor = t + 60000 + Math.random() * 120000; return; }
      const a = Math.PI * (.62 + Math.random() * .18); S.meteor = { x: S.w * (.15 + Math.random() * .7), y: S.h * (.08 + Math.random() * .3), vx: Math.cos(a) * -1, vy: Math.sin(a), t0: t, dur: 1100 + Math.random() * 600, len: 70 + Math.random() * 60 };
    }
    if (!S.meteor) return;
    const m = S.meteor, k = (t - m.t0) / m.dur;
    if (k >= 1) { S.meteor = null; S.nextMeteor = t + 150000 + Math.random() * 240000; return; }
    const dist = k * 420, x = m.x + m.vx * dist, y = m.y + m.vy * dist, a = Math.sin(k * Math.PI) * .32;
    const g = ctx.createLinearGradient(x - m.vx * m.len, y - m.vy * m.len, x, y); g.addColorStop(0, 'rgba(220,230,250,0)'); g.addColorStop(1, `rgba(225,235,255,${a})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - m.vx * m.len, y - m.vy * m.len); ctx.lineTo(x, y); ctx.stroke();
  }

  // ---------- ambient motion ----------
  function drift(t) {
    const amp = 9 * S.ambient;
    for (const it of S.items) {
      const dx = amp * Math.sin(t / (it.T1 * 1000) + it.phase), dy = amp * .7 * Math.sin(t / (it.T2 * 1000) + it.phase * 1.7);
      it.dx = dx; it.dy = dy;
      it.sec.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0)`;
      it.g.setAttribute('transform', `translate(${(it.pos.x + dx).toFixed(2)},${(it.pos.y + dy).toFixed(2)})`);
    }
  }
  let sizeCheck = 0;
  function loop(t) {
    const step = 1000 / Math.max(1, S.fps);
    if (t - S.last >= step - 2) {
      S.last = t;
      if (S.built) { drawBackground(t); if (S.ambient > 0) drift(t); if (S.hoverEl) positionAnnot(); }
      if (++sizeCheck % 30 === 0 && S.data && (innerWidth !== S.w || innerHeight !== S.h)) build();  // watchdog: viewport changed without a resize event
    }
    requestAnimationFrame(loop);
  }

  // ---------- hover annotation ----------
  function wire(node, m) {
    node.addEventListener('mouseenter', () => showAnnot(m, node));
    node.addEventListener('mouseleave', () => hideAnnot());
    node.addEventListener('click', ev => { ev.stopPropagation(); toggleFocus(m.creator_key); });
  }
  function sparkFor(node) { const sec = node.closest('.constellation'); return sec ? sec.querySelector(`.spark[data-id="${node.dataset.id}"]`) : node; }
  function showAnnot(m, node) {
    S.hoverEl = sparkFor(node) || node; S.hoverModel = m;
    const rgb = starRGB(m.creator_color), fam = S.data.families.find(f => f.family_key === m.family_key);
    const rows = [['Intelligence', fmt(m.intelligence, 1)], ['Coding', fmt(m.coding, 1)], ['Agentic', fmt(m.agentic, 1)],
      ['Output', m.tps == null ? '—' : `${fmt(m.tps, 1)} tok/s`], ['TTFT', m.ttft_s == null ? '—' : `${fmt(m.ttft_s, 2)} s`], ['End-to-end', m.e2e_s == null ? '—' : `${fmt(m.e2e_s, 1)} s`],
      ['Price in / out', (m.price_in == null && m.price_out == null) ? '—' : `${money(m.price_in)} / ${money(m.price_out)} per 1M`], ['Cost per task', m.cost_per_task == null ? '—' : money(m.cost_per_task)],
      ['Released', m.release_date ? `${m.release_date} · ${ago(m.days_since_release)}` : '—']];
    annot.style.setProperty('--c', rgbstr(rgb));
    annot.innerHTML = `<div class="a-head"><span class="a-rank">${pad2(m.rank_intelligence)}</span><span class="a-score">${fmt(m.intelligence, 1)}</span>${deltaHTML(m)}</div>
      <div class="a-family">${esc(m.family)}</div><div class="a-variant">${esc(m.variant || 'base model')}</div>
      <dl class="a-metrics">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="a-foot">${esc(m.creator)} · family rank ${fam && fam.rank != null ? pad2(fam.rank) : '—'} · ${fam ? fam.variant_count : 1} variant${fam && fam.variant_count !== 1 ? 's' : ''} in family${m.prev_rank_intelligence != null ? ` · was #${pad2(m.prev_rank_intelligence)}` : ''}</div>`;
    annot.classList.add('visible'); overlay.classList.add('visible'); positionAnnot();
  }
  function positionAnnot() {
    if (!S.hoverEl) return;
    const r = S.hoverEl.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top + r.height / 2;
    const aw = annot.offsetWidth, ah = annot.offsetHeight, m = 24, bottomSafe = S.h - 120;
    // candidate placements; pick the one overlapping the fewest laid-out constellations (other than the hovered one)
    const rects = S.items.flatMap(i => i.obstacles).concat([...atlas.querySelectorAll('.focus-tag,.cname')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
    const cands = [];
    for (const d of [150, 230, 320]) for (const a of [0, 1, 2, 3, 4, 5, 6, 7]) { const th = a * Math.PI / 4; cands.push([sx + Math.cos(th) * d - (Math.cos(th) < -.1 ? aw : Math.cos(th) > .1 ? 0 : aw / 2), sy + Math.sin(th) * d - (Math.sin(th) < -.1 ? ah : Math.sin(th) > .1 ? 0 : ah * .55)]); }
    let bestC = null;
    for (const [cx, cy] of cands) {
      const x = clamp(cx, m, S.w - aw - m), y = clamp(cy, m + 90, bottomSafe - ah), r = { x, y, w: aw, h: ah };
      let cost = (Math.abs(x - cx) + Math.abs(y - cy)) * 2 + Math.hypot(x + aw / 2 - sx, y + ah / 2 - sy) * .35;
      for (const q of rects) { const ox = Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)), oy = Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y)); cost += ox * oy / 40; }
      if (!bestC || cost < bestC.cost) bestC = { x, y, cost };
    }
    const x = bestC.x, y = bestC.y, right = x + aw / 2 >= sx;
    annot.style.left = x + 'px'; annot.style.top = y + 'px';
    const ax = right ? x : x + aw, ay = clamp(sy, y + 14, y + ah - 14);
    const line = $('obsline'), ring = $('obsring');
    line.setAttribute('x1', sx); line.setAttribute('y1', sy); line.setAttribute('x2', ax); line.setAttribute('y2', ay);
    ring.setAttribute('cx', sx); ring.setAttribute('cy', sy); ring.setAttribute('r', Math.max(11, r.width * .9));
    overlay.style.setProperty('--c', annot.style.getPropertyValue('--c'));
  }
  function hideAnnot() { S.hoverEl = null; S.hoverModel = null; annot.classList.remove('visible'); overlay.classList.remove('visible'); }

  // ---------- focus ----------
  function toggleFocus(key) { if (S.focus === key) clearFocus(); else setFocus(key); }
  function setFocus(key) {
    clearFocus(true); const it = S.itemByKey.get(key); if (!it) return;
    S.focus = key; document.body.classList.add('has-focus'); it.sec.classList.add('focus'); it.g.classList.add('focus');
    const ui = S.ui;
    it.dims.forEach((p, i) => {
      const m = it.con.dims[i]; if (!m) return;
      const tag = el('div', 'dimtag', pad2(m.rank_intelligence)); tag.dataset.id = m.id;
      tag.style.left = (p.x + 7 * ui) + 'px'; tag.style.top = (p.y - 6 * ui) + 'px';
      wire(tag, m); it.sec.appendChild(tag);
    });
    const total = S.data.models.filter(m => m.creator_key === key).length;
    const tag = el('div', 'focus-tag', `${it.models.length} in top ${S.topN}${it.dims.length ? ` · ${it.dims.length} in top ${2 * S.topN} shown dimmed` : ''} · ${total} ${it.con.creator} models tracked`);
    tag.style.left = (it.lay.bbox.x + it.lay.bbox.w / 2) + 'px'; tag.style.top = (it.lay.bbox.y + it.lay.bbox.h + 18 * ui) + 'px'; it.sec.appendChild(tag);
  }
  function clearFocus(silent) {
    if (!S.focus) return; const it = S.itemByKey.get(S.focus); S.focus = null; document.body.classList.remove('has-focus');
    if (it) { it.sec.classList.remove('focus'); it.g.classList.remove('focus'); it.sec.querySelectorAll('.sat,.dimtag,.focus-tag').forEach(e => e.remove()); }
  }
  document.addEventListener('click', ev => { if (!ev.target.closest('.spark,.label')) clearFocus(); });
  // focus-tag sits under the family name; satellites avoid the bottom band (see layout.satellites)

  // ---------- status ----------
  const STATUS_TEXT = { ok: 'LIVE', cached: 'CACHED', bundled: 'BUNDLED SNAPSHOT', loading: 'UPDATING…', nokey: 'NO API KEY — SET IT IN WALLPAPER SETTINGS', auth: 'API KEY REJECTED', error: 'OFFLINE — SHOWING LAST DATA', stale: 'STALE' };
  function setStatus(d) {
    const s = $('status'); s.dataset.state = d.state; let txt = STATUS_TEXT[d.state] || d.state.toUpperCase();
    if (d.state === 'ok' && d.remaining != null) txt += ` · ${d.remaining} REQUESTS LEFT TODAY`;
    if ((d.state === 'ok' || d.state === 'cached') && d.next_refresh_at) txt += ` · NEXT ${dateShort(d.next_refresh_at)}`;
    if (d.state === 'error' && d.message) txt += ` (${esc(d.message)})`;
    s.textContent = txt;
  }

  // ---------- events ----------
  const FAKE = /[?&]fakedelta=1/.test(location.search);  // preview-only styling check for arrows/trails/newborn halos; never true inside Wallpaper Engine
  document.addEventListener('aa:data', e => {
    S.data = e.detail;
    if (FAKE) S.data.models.forEach((m, i) => { if (m.rank_intelligence && m.rank_intelligence <= 60) { m.rank_delta = [0, 3, -2, 0, 1, -5, 0][i % 7]; if (i % 5 === 0) m.days_since_release = 3; } });
    build();
  });
  document.addEventListener('aa:status', e => setStatus(e.detail));
  const onProps = e => {
    const v = e.detail.values, c = e.detail.changed; let rebuild = false;
    if ('topn' in c) { const n = clamp(Math.round(Number(v.topn)) || 40, 10, 80); if (n !== S.topN) { S.topN = n; rebuild = true; } }
    if ('ambientmotion' in c) S.ambient = clamp(Number(v.ambientmotion) / 100, 0, 1);
    if ('showbackground' in c) S.showBg = String(v.showbackground) !== 'false' && !!v.showbackground;
    if ('showlegend' in c) { S.showLegend = String(v.showlegend) !== 'false' && !!v.showlegend; document.body.classList.toggle('no-legend', !S.showLegend); }
    if ('dimstars' in c) { const d = String(v.dimstars) !== 'false' && !!v.dimstars; if (d !== S.dimStars) { S.dimStars = d; rebuild = true; } }
    if ('skywidth' in c) { const n = clamp(Number(v.skywidth) || 88, 50, 100); if (n !== S.skyW) { S.skyW = n; rebuild = true; } }
    if ('skyheight' in c) { const n = clamp(Number(v.skyheight) || 78, 50, 100); if (n !== S.skyH) { S.skyH = n; rebuild = true; } }
    if (rebuild && S.data) build();
    if (S.ambient === 0) for (const it of S.items) { it.sec.style.transform = ''; it.g.setAttribute('transform', `translate(${it.pos.x},${it.pos.y})`); }
  };
  document.addEventListener('aa:props', onProps);
  const onGeneral = g => { const f = g.fps; S.fps = f == null ? 15 : f === 0 ? 60 : Math.max(1, f); };
  document.addEventListener('aa:general', e => onGeneral(e.detail));
  if (window.AAProps) { if (Object.keys(window.AAProps.values).length) onProps({ detail: { values: window.AAProps.values, changed: Object.assign({}, window.AAProps.values) } }); if (window.AAProps.general.fps != null) onGeneral(window.AAProps.general); }
  let rs = 0; addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { if (S.data) build(); }, 150); });

  if (window.COSMOS_DATA) { S.data = window.COSMOS_DATA; build(); }
  if (window.AAFetch && window.AAFetch.state.lastStatus) setStatus(window.AAFetch.state.lastStatus);
  requestAnimationFrame(loop);
  // Preview hooks (headless screenshots): ?hover=<rank>  ?focus=<family_key>
  const q = new URLSearchParams(location.search);
  window.addEventListener('load', () => setTimeout(() => {
    if (q.get('focus')) setFocus(q.get('focus'));
    if (q.get('hover')) { const m = S.data && S.data.models.find(x => x.rank_intelligence === Number(q.get('hover'))); const node = m && atlas.querySelector(`.spark[data-id="${m.id}"]`); if (node) showAnnot(m, node); }
  }, 300));
})();
