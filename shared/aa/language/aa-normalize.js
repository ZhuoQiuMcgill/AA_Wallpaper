/* aa-normalize.js — JavaScript port of tools/cosmos_export.py normalisation (docs/03-cosmos-data-spec.md).
   Pure functions, no DOM. Works in the browser (window.AANormalize) and in Node (module.exports) so the
   port can be verified against data/cosmos-data.json. null stays null, 0 stays 0. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AANormalize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SHORT_ORDER = ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'non-reasoning', 'reasoning'];
  const SUFFIX = /^(.*?)\s*\(([^()]*)\)\s*$/;
  const DELTA_DECIMALS = 4;
  const FIELD_MAP = {
    intelligence: ['evaluations', 'artificial_analysis_intelligence_index'],
    coding: ['evaluations', 'artificial_analysis_coding_index'],
    agentic: ['evaluations', 'artificial_analysis_agentic_index'],
    tps: ['performance', 'median_output_tokens_per_second'],
    ttft_s: ['performance', 'median_time_to_first_token_seconds'],
    ttfat_s: ['performance', 'median_time_to_first_answer_token_seconds'],
    e2e_s: ['performance', 'median_end_to_end_response_time_seconds'],
    price_in: ['pricing', 'price_1m_input_tokens'],
    price_out: ['pricing', 'price_1m_output_tokens'],
    price_cache_hit: ['pricing', 'price_1m_cache_hit_tokens'],
    price_cache_write: ['pricing', 'price_1m_cache_write_tokens'],
    cost_per_task: ['artificial_analysis_intelligence_index_cost', 'cost_per_task', 'total_cost'],
    index_run_cost: ['artificial_analysis_intelligence_index_cost', 'total_cost'],
  };

  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  function splitName(name) {
    const m = SUFFIX.exec(name);
    return m ? [m[1].trim(), m[2].trim()] : [name.trim(), null];
  }
  function shortVariant(variant) {
    if (variant == null) return null;
    const v = variant.toLowerCase();
    for (const k of SHORT_ORDER) if (v.includes(k)) return k;
    return variant;
  }
  function g(obj, path) {
    for (const k of path) { if (obj == null || typeof obj !== 'object') return null; obj = obj[k]; }
    return obj === undefined ? null : obj;
  }
  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const rnd = (x, d) => (x == null ? null : Math.round(x * Math.pow(10, d)) / Math.pow(10, d));
  function utcDay(iso) { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); }

  /** pages: array of API page objects; fetchedAt: ISO string; colors: {creator_key: '#hex'|null} */
  function normalize(pages, fetchedAt, colors) {
    colors = colors || {};
    const fetchDay = utcDay(fetchedAt);
    const versions = new Set(pages.map(p => String(p.intelligence_index_version)));
    if (versions.size !== 1) throw new Error('pages disagree on intelligence_index_version: ' + [...versions].join(','));
    const models = [];
    for (const p of pages) for (const r of p.data) {
      const [family, variant] = splitName(r.name);
      const sv = shortVariant(variant);
      const creator = g(r, ['model_creator', 'name']);
      const ckey = creator ? slugify(creator) : '';
      const rel = r.release_date == null ? null : r.release_date;
      const days = rel ? Math.round((fetchDay - utcDay(rel)) / 86400000) : null;
      const m = {
        id: r.id, name: r.name, slug: r.slug == null ? null : r.slug,
        family, family_key: slugify(family), variant, short_variant: sv,
        short_label: family + (sv ? ' (' + sv + ')' : ''),
        creator, creator_key: ckey, creator_id: g(r, ['model_creator', 'id']),
        creator_color: Object.prototype.hasOwnProperty.call(colors, ckey) ? colors[ckey] : null,
        release_date: rel, days_since_release: days,
      };
      for (const k in FIELD_MAP) m[k] = num(g(r, FIELD_MAP[k]));
      Object.assign(m, { rank_intelligence: null, is_family_best: false, rank_intelligence_family: null,
        prev_rank_intelligence: null, prev_rank_intelligence_family: null, rank_delta: null, family_rank_delta: null,
        previous_intelligence: null, intelligence_delta: null });
      models.push(m);
    }
    // §11 model rank
    const ranked = models.filter(m => m.intelligence != null).sort((a, b) => (b.intelligence - a.intelligence) || cmpStr(a.name, b.name));
    ranked.forEach((m, i) => { m.rank_intelligence = i + 1; });
    // §12 family best
    const groups = new Map();
    for (const m of models) { if (!groups.has(m.family_key)) groups.set(m.family_key, []); groups.get(m.family_key).push(m); }
    const bestOrder = (a, b) => ((a.intelligence == null) - (b.intelligence == null)) || (-(a.intelligence || 0) - -(b.intelligence || 0)) || cmpStr(a.name, b.name);
    for (const ms of groups.values()) { ms.sort(bestOrder); ms[0].is_family_best = true; }
    // §13 family rank
    models.filter(m => m.is_family_best && m.intelligence != null)
      .sort((a, b) => (b.intelligence - a.intelligence) || cmpStr(a.name, b.name))
      .forEach((m, i) => { m.rank_intelligence_family = i + 1; });
    return { models, groups, version: [...versions][0] };
  }

  /** Compact, storable snapshot used as the "previous" side of rank/intelligence deltas. */
  function toCompact(models, fetchedAt) {
    const m = {}, f = {};
    for (const x of models) {
      m[x.id] = [x.rank_intelligence, x.intelligence];
      if (x.is_family_best) f[x.family_key] = x.rank_intelligence_family;
    }
    return { t: fetchedAt, m, f };
  }

  /** §14-18: link a compact previous snapshot into models (mutates). prev may be null. */
  function linkPrevious(models, prev) {
    for (const m of models) {
      m.prev_rank_intelligence = null; m.previous_intelligence = null; m.intelligence_delta = null; m.rank_delta = null;
      m.prev_rank_intelligence_family = null; m.family_rank_delta = null;
    }
    if (!prev) return;
    for (const m of models) {
      const p = prev.m[m.id];
      if (p) {
        m.prev_rank_intelligence = p[0]; m.previous_intelligence = p[1];
        if (m.intelligence != null && p[1] != null) m.intelligence_delta = rnd(m.intelligence - p[1], DELTA_DECIMALS);
        if (m.rank_intelligence != null && p[0] != null) m.rank_delta = p[0] - m.rank_intelligence;
      }
      if (m.is_family_best && Object.prototype.hasOwnProperty.call(prev.f, m.family_key)) {
        m.prev_rank_intelligence_family = prev.f[m.family_key];
        if (m.rank_intelligence_family != null && m.prev_rank_intelligence_family != null)
          m.family_rank_delta = m.prev_rank_intelligence_family - m.rank_intelligence_family;
      }
    }
  }

  /** §19 families[] (metrics from the family-best record only). */
  function buildFamilies(models, groups) {
    const fams = [];
    const order = (a, b) => ((a.intelligence == null) - (b.intelligence == null)) || (-(a.intelligence || 0) - -(b.intelligence || 0)) || cmpStr(a.name, b.name);
    for (const [key, ms] of groups) {
      const best = ms.find(m => m.is_family_best);
      const others = ms.filter(m => m !== best).sort(order);
      fams.push({
        family: best.family, family_key: key, creator: best.creator, creator_key: best.creator_key, creator_color: best.creator_color,
        best_model_id: best.id, best_model_name: best.name, best_short_label: best.short_label,
        rank: best.rank_intelligence_family, prev_rank: best.prev_rank_intelligence_family, rank_delta: best.family_rank_delta,
        intelligence: best.intelligence, previous_intelligence: best.previous_intelligence, intelligence_delta: best.intelligence_delta,
        coding: best.coding, agentic: best.agentic, tps: best.tps, ttft_s: best.ttft_s, ttfat_s: best.ttfat_s, e2e_s: best.e2e_s,
        price_in: best.price_in, price_out: best.price_out, cost_per_task: best.cost_per_task,
        release_date: best.release_date, days_since_release: best.days_since_release,
        variant_count: ms.length, variant_ids: [best.id].concat(others.map(m => m.id)),
      });
    }
    fams.sort((a, b) => ((a.rank == null) - (b.rank == null)) || ((a.rank || 0) - (b.rank || 0)) || cmpStr(a.family, b.family));
    return fams;
  }

  function buildCounts(models, families) {
    const c = (arr, fn) => arr.reduce((n, x) => n + (fn(x) ? 1 : 0), 0);
    return {
      models: models.length, families: families.length, creators: new Set(models.map(m => m.creator_key)).size,
      with_intelligence: c(models, m => m.intelligence != null), with_coding: c(models, m => m.coding != null),
      with_agentic: c(models, m => m.agentic != null), with_speed: c(models, m => m.tps != null),
      with_price: c(models, m => m.price_in != null && m.price_out != null), with_cost_per_task: c(models, m => m.cost_per_task != null),
      families_with_multiple_variants: c(families, f => f.variant_count > 1),
      new_models_30d: c(models, m => m.days_since_release != null && m.days_since_release <= 30),
      new_families_30d: c(families, f => f.days_since_release != null && f.days_since_release <= 30),
    };
  }

  /** Full document in the cosmos-data.json shape (subset: no stats/creators/selection/movers). */
  function buildDocument(pages, fetchedAt, colors, prevCompact) {
    const { models, groups, version } = normalize(pages, fetchedAt, colors);
    linkPrevious(models, prevCompact);
    const families = buildFamilies(models, groups);
    models.sort((a, b) => ((a.rank_intelligence == null) - (b.rank_intelligence == null)) || ((a.rank_intelligence || 0) - (b.rank_intelligence || 0)) || cmpStr(a.name, b.name));
    return {
      schema_version: 1, generated_by: 'aa-normalize.js',
      source: 'Artificial Analysis', source_url: 'https://artificialanalysis.ai/',
      attribution: 'Data: Artificial Analysis · artificialanalysis.ai',
      fetched_at: fetchedAt, previous_fetched_at: prevCompact ? prevCompact.t : null,
      intelligence_index_version: version,
      counts: buildCounts(models, families), families, models,
    };
  }

  return { normalize, toCompact, linkPrevious, buildFamilies, buildCounts, buildDocument, slugify, splitName, shortVariant };
});
