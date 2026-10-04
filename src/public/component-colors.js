"use strict";
globalThis.UnqlockColors = (() => {
  // Each group has a foreground (ink: icons, labels, shapes, borders, accent bars) and a background (tint)
  // per theme. The defaults keep every pair distinct for foregrounds and full backgrounds in both
  // themes, favoring Logic & processing, Integrations, Grids, Layout and Input fields in that order.
  const families = [
    { id:'inputs', name:'Input fields', light:['#1E40AF', '#BFDBFE'], dark:['#93C5FD', '#1E3A8A'] },
    { id:'layout', name:'Layout', light:['#5B21B6', '#DDD6FE'], dark:['#C4B5FD', '#4C1D95'] },
    { id:'grids', name:'Grids', light:['#155E75', '#A5F3FC'], dark:['#67E8F9', '#164E63'] },
    { id:'content', name:'Content', light:['#44403C', '#E7E5E4'], dark:['#D6D3D1', '#292524'] },
    { id:'actions', name:'Actions & navigation', light:['#166534', '#BBF7D0'], dark:['#86EFAC', '#14532D'] },
    { id:'logic', name:'Logic & processing', light:['#9A3412', '#FED7AA'], dark:['#FDBA74', '#7C2D12'] },
    { id:'data', name:'Data & storage', light:['#115E59', '#99F6E4'], dark:['#5EEAD4', '#134E4A'] },
    { id:'integrations', name:'Integrations', light:['#9F1239', '#FECDD3'], dark:['#FDA4AF', '#881337'] },
    { id:'charts', name:'Charts & maps', light:['#86198F', '#F5D0FE'], dark:['#F0ABFC', '#701A75'] },
    { id:'custom', name:'Custom components', light:['#3F6212', '#D9F99D'], dark:['#BEF264', '#365314'] }
  ];
  const modes = ['light', 'dark'];
  const parts = ['ink', 'tint'];
  const hex = /^#[0-9a-f]{6}$/i;
  const rgb = value => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
  const toHex = channels => '#' + channels.map(channel => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const mix = (value, target, amount) => toHex(rgb(value).map((channel, index) => channel + (target[index] - channel) * amount));
  const luminance = value => {
    const [r, g, b] = rgb(value).map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  // Mix a color toward white or black, from `from` to `to`, stopping at the first mix that reads
  // against its partner. The cap keeps a background's hue, so two picked foregrounds that cannot
  // reach full contrast still get different backgrounds rather than the same white or black.
  function separate(value, against, toward, from, to, minimum) {
    let result = mix(value, toward, from);
    for (let amount = from; amount <= to + 1e-9 && contrast(result, against) < minimum; amount += 0.02) result = mix(value, toward, Math.min(amount, to));
    return result;
  }

  // When only one color of a theme is picked, its partner is worked out from it: a pale or deep
  // background for a picked foreground, or a dark or light foreground for a picked background.
  function partner(mode, part, value) {
    const light = mode === 'light';
    if (part === 'ink') return separate(value, value, light ? white : black, light ? 0.7 : 0.55, light ? 0.86 : 0.8, 4.5);
    return separate(value, value, light ? black : white, light ? 0.5 : 0.55, 0.95, 5);
  }

  // Stored as { group: { light: { ink, tint }, dark: { ink, tint } } } with picked colors only.
  function settings(value) {
    const result = {};
    for (const family of families) {
      const group = {};
      for (const mode of modes) {
        const picked = Object.fromEntries(parts.filter(part => typeof value?.[family.id]?.[mode]?.[part] === 'string' && hex.test(value[family.id][mode][part])).map(part => [part, value[family.id][mode][part].toUpperCase()]));
        if (Object.keys(picked).length) group[mode] = picked;
      }
      if (Object.keys(group).length) result[family.id] = group;
    }
    return result;
  }

  // Resolved [ink, tint] per theme for every group, with `picked` listing what the user chose.
  function palette(custom) {
    const chosen = settings(custom);
    return families.map(family => {
      const resolved = { ...family, picked:chosen[family.id] || {} };
      for (const mode of modes) {
        const picked = chosen[family.id]?.[mode];
        if (!picked) continue;
        const ink = picked.ink || partner(mode, 'tint', picked.tint);
        const tint = picked.tint || partner(mode, 'ink', picked.ink);
        resolved[mode] = [ink, tint];
      }
      return resolved;
    });
  }

  return { families, modes, parts, settings, palette, partner, contrast };
})();
