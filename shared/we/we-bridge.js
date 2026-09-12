/* we-bridge.js — the single window.wallpaperPropertyListener. Forwards Wallpaper Engine user properties and general
   settings (FPS limit) to the rest of the page as DOM events. Outside WE, ?prop_<name>=<value> query params emulate
   user properties (used for headless previews). */
(() => {
  'use strict';
  const values = {}, general = {};
  const emit = (n, d) => document.dispatchEvent(new CustomEvent(n, { detail: d }));
  window.wallpaperPropertyListener = {
    applyUserProperties(p) {
      const changed = {};
      for (const k in p) if (p[k] && Object.prototype.hasOwnProperty.call(p[k], 'value')) { values[k] = p[k].value; changed[k] = p[k].value; }
      emit('aa:props', { values, changed });
    },
    applyGeneralProperties(p) { if (p && p.fps != null) general.fps = p.fps; emit('aa:general', Object.assign({}, general)); },
  };
  window.AAProps = { values, general };
  const q = new URLSearchParams(location.search), changed = {};
  for (const [k, v] of q) if (k.startsWith('prop_')) { values[k.slice(5)] = v; changed[k.slice(5)] = v; }
  if (Object.keys(changed).length) window.addEventListener('DOMContentLoaded', () => emit('aa:props', { values, changed }));
})();
