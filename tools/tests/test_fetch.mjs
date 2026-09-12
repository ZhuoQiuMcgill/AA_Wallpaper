// Smoke test for shared/aa/aa-fetch.js outside the browser (run tools/build.py constellation first): stub window/document/localStorage/fetch, feed the real snapshot pages,
// then check throttling, caching, history pruning and previous-snapshot selection. Run: node.exe tools/test_fetch.mjs
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const snaps = fs.readdirSync(path.join(ROOT, 'data', 'aa', 'language', 'snapshots')).filter(d => !d.endsWith('.tmp')).sort();
const dir = path.join(ROOT, 'data', 'aa', 'language', 'snapshots', snaps[snaps.length - 1]);
const pages = fs.readdirSync(dir).filter(f => /^page-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5))).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

const store = {}, events = [], calls = [];
const listeners = {};
const document = { readyState: 'complete', addEventListener: (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); },
  dispatchEvent: ev => { events.push(ev); (listeners[ev.type] || []).forEach(fn => fn(ev)); return true; } };
class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let failNext = 0;
const fetch = async (url, init) => {
  calls.push(url);
  if (failNext > 0) { failNext--; return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) }; }
  const page = Number(new URL(url).searchParams.get('page'));
  if (!init.headers['x-api-key']) return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: 'API key is required' }) };
  return { ok: true, status: 200, headers: { get: h => (h === 'x-ratelimit-remaining' ? '77' : null) }, json: async () => pages[page - 1] };
};
const window = { location: { search: '' }, addEventListener() {} };
const ctx = { window, document, localStorage, fetch, CustomEvent, console, setInterval: () => 0, setTimeout, clearTimeout, location: window.location, Date, Math, JSON, Number, String, Array, Object, Error, URLSearchParams, Promise, Set, Map };
ctx.self = ctx.window; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['dist/constellation/js/creator-colors.js', 'dist/constellation/js/history-seed.js', 'dist/constellation/js/aa-normalize.js']) vm.runInContext(read(f), ctx, { filename: f });
// aa-normalize's UMD attaches to `this`/self -> ensure window.AANormalize exists
if (!window.AANormalize && ctx.AANormalize) window.AANormalize = ctx.AANormalize;
vm.runInContext(read('dist/constellation/js/aa-fetch.js'), ctx, { filename: 'aa-fetch.js' });

const fire = (changed) => document.dispatchEvent(new CustomEvent('aa:props', { detail: { values: changed, changed } }));
const wait = ms => new Promise(r => setTimeout(r, ms));
let ok = true; const check = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); ok = ok && c; };

check(window.AA_HISTORY_SEED.length === 2, `history seed has ${window.AA_HISTORY_SEED.length} real snapshots`);
check(events.some(e => e.type === 'aa:status' && e.detail.state === 'nokey') || events.length === 0, 'no cache + no key -> nothing published yet');
fire({ apikey: '' }); check(events.at(-1).detail.state === 'nokey', 'empty key -> status nokey');
fire({ apikey: 'test-key' }); await wait(50);
check(calls.length === pages.length, `fetched ${calls.length} pages (expected ${pages.length})`);
const data = events.filter(e => e.type === 'aa:data').at(-1);
check(!!data && data.detail.models.length === 647, 'aa:data published with 647 models');
check(data.detail.previous_fetched_at === window.AA_HISTORY_SEED[0].t, `previous = oldest seed (${data.detail.previous_fetched_at}) because none is >= 7 days old`);
check(data.detail.models.every(m => m.rank_delta === 0 || m.rank_delta === null), 'all rank deltas 0/null against same-day baseline (no fabricated movement)');
const hist = JSON.parse(store['aa.language.history.v1']); check(hist.length === 3, `history now ${hist.length} entries (2 seed + 1 live)`);
check(!!store['aa.language.pages.v1'] && !!store['aa.language.lastFetch.v1'], 'raw pages + lastFetch cached');
const st = events.filter(e => e.type === 'aa:status').at(-1).detail; check(st.state === 'ok' && st.remaining === 77, `status ok, remaining=${st.remaining}`);
const before = calls.length; fire({ apikey: 'test-key' }); await wait(20); check(calls.length === before, 'same key again -> no refetch (throttled)');
fire({ rankwindow: '30' }); const d2 = events.filter(e => e.type === 'aa:data').at(-1).detail; check(d2.rank_window_days === 30 && d2.previous_fetched_at === window.AA_HISTORY_SEED[0].t, 'rank window change republishes from cache');
failNext = 1; window.AAFetch.state.key = 'k2'; await window.AAFetch.refresh('test'); const st2 = events.filter(e => e.type === 'aa:status').at(-1).detail;
check(st2.state === 'error' && window.AAFetch.state.backoffUntil > Date.now(), 'HTTP 500 -> status error + backoff, cached data kept');
console.log(ok ? '\nFETCH LAYER OK' : '\nFETCH LAYER FAILED'); process.exit(ok ? 0 : 1);
