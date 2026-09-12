/* aa-fetch.js — Artificial Analysis data client (feed-agnostic). Fetches every page of the configured endpoint (default
   /api/v2/language/models/free) with the key from the WE
   "apikey" property, normalises with aa-normalize.js, caches raw pages + a compact rank history in localStorage,
   throttles to one refresh per N hours (default 4), backs off on errors, and publishes window.COSMOS_DATA via
   'aa:data' / 'aa:status' events. Rank/intelligence deltas are computed against the newest history snapshot that
   is at least <rankwindow> days old (falls back to the oldest available). Nothing is fabricated. */
(() => {
  'use strict';
  // A wallpaper can point this client at another feed/normaliser before loading it:
  //   window.AA_FETCH_CONFIG = { path: '/media/text-to-image/models/free', storage: 'aa.t2i', normalizer: 'AAMediaNormalize' }
  const CFG = Object.assign({ path: '/language/models/free', storage: 'aa.language', normalizer: 'AANormalize' }, window.AA_FETCH_CONFIG || {});
  const BASE = 'https://artificialanalysis.ai/api/v2', PATH = CFG.path;
  const LS = { pages: CFG.storage + '.pages.v1', history: CFG.storage + '.history.v1', lastFetch: CFG.storage + '.lastFetch.v1' };
  const N = window[CFG.normalizer], COLORS = window.AA_CREATOR_COLORS || {};
  // one-off migration from the storage keys used before the repo restructure (2026-09-11)
  if (CFG.storage === 'aa.language') for (const [o, n] of [['aa.pages.v1', LS.pages], ['aa.history.v1', LS.history], ['aa.lastFetch.v1', LS.lastFetch]]) {
    try { if (localStorage.getItem(n) == null && localStorage.getItem(o) != null) { localStorage.setItem(n, localStorage.getItem(o)); localStorage.removeItem(o); } } catch (e) { /* storage unavailable */ }
  }
  const NOFETCH = /[?&]nofetch=1/.test(location.search);
  const S = { key: '', refreshHours: 4, windowDays: 7, backoffUntil: 0, failures: 0, fetching: false, remaining: null, lastStatus: null };

  const emit = (n, d) => document.dispatchEvent(new CustomEvent(n, { detail: d }));
  const lsGet = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const byT = (a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0);

  function loadHistory() {
    let h = lsGet(LS.history);
    if (!Array.isArray(h) || !h.length) h = (window.AA_HISTORY_SEED || []).slice();
    return h.filter(e => e && e.t && e.m).sort(byT);
  }
  // keep every snapshot < 24 h old, one per UTC day up to 30 d, one per week up to 90 d
  function pruneHistory(h, now) {
    const keep = [], days = new Set(), weeks = new Set();
    for (const e of h.slice().sort(byT).reverse()) {
      const age = (now - Date.parse(e.t)) / 864e5;
      if (age < 1) keep.push(e);
      else if (age < 30) { const d = e.t.slice(0, 10); if (!days.has(d)) { days.add(d); keep.push(e); } }
      else if (age < 90) { const w = Math.floor(age / 7); if (!weeks.has(w)) { weeks.add(w); keep.push(e); } }
    }
    return keep.sort(byT);
  }
  function pickPrevious(h, currentT, windowDays) {
    const cutoff = Date.parse(currentT) - windowDays * 864e5;
    const older = h.filter(e => e.t < currentT && Date.parse(e.t) <= cutoff);
    if (older.length) return older[older.length - 1];
    const any = h.filter(e => e.t < currentT);
    return any.length ? any[0] : null;
  }
  function status(state, message) {
    const last = lsGet(LS.lastFetch);
    S.lastStatus = { state, message: message || '', remaining: S.remaining, window_days: S.windowDays,
      fetched_at: window.COSMOS_DATA ? window.COSMOS_DATA.fetched_at : null,
      previous_fetched_at: window.COSMOS_DATA ? window.COSMOS_DATA.previous_fetched_at : null,
      next_refresh_at: last ? new Date(last + S.refreshHours * 3600e3).toISOString() : null };
    emit('aa:status', S.lastStatus);
  }
  function publish(pages, fetchedAt, origin) {
    const prev = pickPrevious(loadHistory(), fetchedAt, S.windowDays);
    const doc = N.buildDocument(pages, fetchedAt, COLORS, prev);
    doc.rank_window_days = S.windowDays; doc.origin = origin;
    window.COSMOS_DATA = doc;
    emit('aa:data', doc);
  }
  async function fetchAll(key) {
    const pages = []; let page = 1, remaining = null;
    for (;;) {
      const r = await fetch(`${BASE}${PATH}?page=${page}`, { headers: { 'x-api-key': key, 'Accept': 'application/json' }, cache: 'no-store' });
      remaining = r.headers.get('x-ratelimit-remaining');
      if (!r.ok) { const err = new Error(`HTTP ${r.status}`); err.status = r.status; throw err; }
      const j = await r.json();
      if (!j || !Array.isArray(j.data)) throw new Error('unexpected response shape');
      pages.push(j);
      if (!(j.pagination && j.pagination.has_more)) break;
      if (++page > 50) throw new Error('pagination runaway');
    }
    return { pages, remaining };
  }
  async function refresh(reason) {
    if (S.fetching || NOFETCH) return;
    if (!S.key) { status('nokey'); return; }
    S.fetching = true; status('loading', reason);
    try {
      const { pages, remaining } = await fetchAll(S.key);
      const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const norm = N.normalize(pages, fetchedAt, COLORS);
      let hist = loadHistory(); hist.push(N.toCompact(norm.models, fetchedAt)); hist = pruneHistory(hist, Date.now());
      lsSet(LS.history, hist); lsSet(LS.pages, { pages, fetchedAt }); lsSet(LS.lastFetch, Date.now());
      S.failures = 0; S.remaining = remaining == null ? null : Number(remaining);
      publish(pages, fetchedAt, 'live'); status('ok');
    } catch (e) {
      S.failures++; S.backoffUntil = Date.now() + Math.min(4 * 3600e3, 15 * 60e3 * Math.pow(2, S.failures - 1));
      status(e.status === 401 ? 'auth' : 'error', String(e.message || e));
    } finally { S.fetching = false; }
  }
  function tick() {
    if (!S.key || NOFETCH || S.fetching) return;
    const last = lsGet(LS.lastFetch) || 0;
    if (Date.now() - last >= S.refreshHours * 3600e3 && Date.now() >= S.backoffUntil) refresh('scheduled');
  }
  function init() {
    const cached = lsGet(LS.pages);
    if (cached && Array.isArray(cached.pages) && cached.fetchedAt) { try { publish(cached.pages, cached.fetchedAt, 'cache'); status('cached'); } catch (e) { console.warn('[aa-fetch] cache unusable', e); } }
    if (!window.COSMOS_DATA && window.COSMOS_DATA_BUNDLED) { window.COSMOS_DATA = window.COSMOS_DATA_BUNDLED; window.COSMOS_DATA.origin = 'bundled'; emit('aa:data', window.COSMOS_DATA); status('bundled'); }
    const onProps = e => {
      const v = e.detail.values, c = e.detail.changed;
      if ('refreshhours' in c) S.refreshHours = Math.max(1, Number(v.refreshhours) || 4);
      if ('rankwindow' in c) { S.windowDays = Math.max(1, Number(v.rankwindow) || 7); const cc = lsGet(LS.pages); if (cc && cc.pages) publish(cc.pages, cc.fetchedAt, 'cache'); }
      if ('apikey' in c) {
        const key = String(v.apikey || '').trim(), changed = key !== S.key; S.key = key;
        if (!key) status('nokey');
        else if (changed) { S.failures = 0; S.backoffUntil = 0; const last = lsGet(LS.lastFetch) || 0; if (!lsGet(LS.pages) || Date.now() - last >= S.refreshHours * 3600e3) refresh('key'); else status('cached'); }
      }
    };
    document.addEventListener('aa:props', onProps);
    // properties WE may already have delivered before this script initialised
    if (window.AAProps && Object.keys(window.AAProps.values).length) onProps({ detail: { values: window.AAProps.values, changed: Object.assign({}, window.AAProps.values) } });
    setInterval(tick, 60e3);
    window.AAFetch = { refresh, state: S, loadHistory };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
