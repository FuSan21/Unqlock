(() => {
  'use strict';
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const model = UnqlockPanels;
  const panelSelector = '[data-slot="resizable-panel"]';
  const groupSelector = '[data-slot="resizable-panel-group"]';
  const handleSelector = '[data-slot="resizable-handle"]';
  const toggleSelector = Object.values(model.panels).flatMap(meta => [meta.open, meta.close]).map(label => 'button[aria-label="' + label + '"]').join(',');
  let config = model.settings();
  let stored = {};
  let ready = false;
  let route = '';
  let scheduled = false;
  let rendering = false;
  let queued = false;
  let resizing = false;
  let userResize = null;
  let pointerResize = null;
  let resizeTimer;
  let generation = 0;
  const visits = new Map();
  const locks = new Map();
  let descriptionSequence = 0;
  const resizeErrors = {};
  const groups = new Set();
  const groupObserver = new ResizeObserver(schedule);
  let tooltip;
  const moduleRoute = () => location.pathname.match(/^\/ide\/builder\/workspaces\/[^/]+\/modules\/[^/]+/)?.[0] || '';
  function find(id) {
    const meta = model.panels[id];
    const closeMatches = document.querySelectorAll('button[aria-label="' + meta.close + '"]');
    const openMatches = document.querySelectorAll('button[aria-label="' + meta.open + '"]');
    // An ambiguous match must never close or lock an unrelated panel.
    if (closeMatches.length + openMatches.length !== 1) return null;
    const close = closeMatches[0];
    const open = openMatches[0];
    const toggle = close || open;
    if (!toggle) return null;
    const group = toggle.closest(groupSelector);
    if (!group) return null;
    const panels = [...group.children].filter(e => e.matches(panelSelector));
    const panel = close?.closest(panelSelector) || (meta.side === 'left' ? panels[0] : panels.at(-1));
    const handles = [...group.children].filter(e => e.matches(handleSelector));
    const outer = id === 'agent' || id === 'explore';
    if (panels.length !== (outer ? 3 : 2) || handles.length !== (outer ? 2 : 1)) return null;
    if (panel !== (meta.side === 'left' ? panels[0] : panels.at(-1))) return null;
    if (!outer) {
      const ancestor = group.parentElement?.closest(groupSelector);
      const siblings = ancestor && [...ancestor.children].filter(e => e.matches(panelSelector));
      if (!siblings || !siblings.some(e => e.contains(group))) return null;
    }
    const handle = meta.side === 'left' ? handles[0] : handles.at(-1);
    return panel && handle ? { id, meta, panel, group, handle, close, open } : null;
  }
  const measured = item => Math.round(item.panel.getBoundingClientRect().width);
  function hideTooltip() { tooltip?.remove(); tooltip = null; }
  function showTooltip(element) {
    const record = locks.get(element);
    if (!record) return;
    hideTooltip();
    tooltip = document.createElement('div');
    tooltip.id = 'unqlock-panel-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.textContent = record.reason;
    document.body.append(tooltip);
    const rect = element.getBoundingClientRect();
    tooltip.style.left = Math.max(8, Math.min(rect.left, innerWidth - tooltip.offsetWidth - 8)) + 'px';
    tooltip.style.top = Math.max(8, Math.min(rect.bottom + 8, innerHeight - tooltip.offsetHeight - 8)) + 'px';
  }
  function lock(element, reason) {
    if (!element || locks.has(element)) return;
    const attrs = Object.fromEntries(['aria-disabled', 'aria-describedby', 'title'].map(name => [name, element.getAttribute(name)]));
    const description = document.createElement('span');
    description.id = 'unqlock-panel-description-' + ++descriptionSequence;
    description.hidden = true;
    description.textContent = reason;
    document.body.append(description);
    locks.set(element, { reason, attrs, description });
    element.setAttribute('data-unqlock-panel-locked', '');
    element.setAttribute('aria-disabled', 'true');
    element.removeAttribute('title');
    element.setAttribute('aria-describedby', [attrs['aria-describedby'], description.id].filter(Boolean).join(' '));
  }
  function unlock(element) {
    const record = locks.get(element);
    if (!record) return;
    for (const [name, value] of Object.entries(record.attrs)) {
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
    element.removeAttribute('data-unqlock-panel-locked');
    record.description.remove();
    locks.delete(element);
    hideTooltip();
  }
  function guard(event) {
    if (!moduleRoute()) return;
    const target = event.target.closest?.('[data-unqlock-panel-locked]');
    if (!target) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showTooltip(target);
  }
  for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'dblclick', 'keydown']) {
    window.addEventListener(type, guard, { capture:true, passive:false });
  }
  document.addEventListener('pointerover', event => showTooltip(event.target.closest?.('[data-unqlock-panel-locked]')));
  document.addEventListener('focusin', event => showTooltip(event.target));
  document.addEventListener('pointerout', hideTooltip);
  document.addEventListener('focusout', hideTooltip);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  // Keep native layout state, ARIA values and future drags in agreement.
  async function resize(item, target, token) {
    if (resizing || userResize || !item.close || target === null) return;
    const before = measured(item);
    if (Math.abs(before - target) < 2) return;
    resizing = true;
    try {
      // Native constraints decide the final size; reserve the canvas at each nesting level.
      const bounded = Math.max(120, Math.min(target, item.group.getBoundingClientRect().width - 320));
      if (token !== generation || userResize || !item.panel.isConnected) return;
      const request = crypto.randomUUID();
      const ok = await new Promise(resolve => {
        const finish = ok => { clearTimeout(timer); window.removeEventListener('message', listener); resolve(ok); };
        const listener = event => {
          if (event.source === window && event.origin === location.origin && event.data?.type === 'unqlock.panel.resized' && event.data.request === request) finish(event.data.ok === true);
        };
        const timer = setTimeout(() => finish(false), 800);
        window.addEventListener('message', listener);
        window.postMessage({type:'unqlock.panel.resize', request, panelId:item.panel.id, width:bounded}, location.origin);
      });
      resizeErrors[item.id] = ok ? '' : 'Default sizing is unavailable in this builder version. Native dragging still works.';
      await frame();
      await frame();
    } finally { resizing = false; }
  }
  async function render() {
    if (!ready) return;
    const nextRoute = moduleRoute();
    if (nextRoute !== route) { route = nextRoute; visits.clear(); generation++; }
    const wantedLocks = new Set();
    if (!route) { for (const element of locks.keys()) unlock(element); return; }
    const renderGeneration = generation;
    for (const group of groups) if (!group.isConnected) { groupObserver.unobserve(group); groups.delete(group); }
    for (const id of Object.keys(model.panels)) {
      if (moduleRoute() !== route || renderGeneration !== generation) { schedule(); return; }
      const item = find(id);
      if (!item) {
        // A lazily mounted Properties panel is a user action, not module entry.
        if (id === 'properties' && find('tray') && !visits.has(id)) visits.set(id, {entered:true, sized:false});
        continue;
      }
      for (const element of [item.group, item.panel]) if (!groups.has(element)) { groups.add(element); groupObserver.observe(element); }
      const pref = config[id];
      let visit = visits.get(id);
      if (!visit) { visit = { entered:false, sized:false, panel:item.panel }; visits.set(id, visit); }
      if (visit.panel !== item.panel) { visit.panel = item.panel; visit.sized = false; }
      const groupWidth = item.group.getBoundingClientRect().width;
      if (visit.groupWidth !== undefined && Math.abs(visit.groupWidth - groupWidth) > 1 && !visit.userSized) visit.sized = false;
      visit.groupWidth = groupWidth;
      if (!item.close) visit.sized = false;
      if (pref.visibility === 'always' || (!visit.entered && pref.visibility === 'start')) {
        if (item.close) { item.close.click(); await frame(); }
      }
      const initiallyCollapsed = !visit.entered && pref.visibility === 'start';
      visit.entered = true;
      if (pref.visibility === 'always') {
        const current = find(id);
        const reason = item.meta.label + ' is always collapsed. Change this in Unqlock → General settings → Builder panels.';
        for (const element of [current?.open, current?.handle]) {
          if (element) { wantedLocks.add(element); lock(element, reason); }
        }
        continue;
      }
      if (initiallyCollapsed) continue;
      // A later manual expansion gets its configured width once, without snapping back during dragging.
      if (item.close && !visit.sized && !resizing && !userResize) {
        visit.sized = true;
        const target = pref.sizing !== 'native' && visit.userSized && visit.lastWidth ? visit.lastWidth : pref.sizing === 'custom' ? pref.width : pref.sizing === 'remember' ? model.width(stored[model.rememberedKey(id)]) : null;
        if (target !== null) { await resize(item, target, generation); schedule(); }
      }
    }
    for (const element of locks.keys()) if (!wantedLocks.has(element)) unlock(element);
  }
  function schedule() {
    queued = true;
    if (scheduled || rendering) return;
    scheduled = true;
    requestAnimationFrame(async () => {
      scheduled = false; rendering = true; queued = false;
      try { await render(); } catch { resizing = false; }
      finally { rendering = false; if (queued) schedule(); }
    });
  }
  function beginUserResize(event) {
    if (!event.isTrusted || !moduleRoute() || (event.type === 'keydown' && !['ArrowLeft','ArrowRight','Home','End'].includes(event.key))) return;
    if (event.type === 'pointerdown') {
      if (event.button !== 0) return;
      // Commit a just-finished keyboard resize before another pointer action.
      if (userResize && !pointerResize) recordUserResize(userResize);
      clearTimeout(resizeTimer);
      userResize = null;
      // The native library accepts presses outside the separator's DOM box.
      // Capture the starting widths, then let its active state identify the drag.
      pointerResize = Object.keys(model.panels).map(find).filter(Boolean).map(item => ({
        id:item.id, handle:item.handle, before:measured(item), route:moduleRoute(), sizing:config[item.id].sizing
      }));
      adoptPointerResize();
      return;
    }
    const handle = event.target.closest?.(handleSelector);
    if (!handle || handle.hasAttribute('data-unqlock-panel-locked')) return;
    const item = Object.keys(model.panels).map(find).find(item => item?.handle === handle);
    if (!item || config[item.id].visibility === 'always') return;
    clearTimeout(resizeTimer);
    if (event.type !== 'keydown' || userResize?.id !== item.id) userResize = { id:item.id, before:measured(item), route:moduleRoute(), sizing:config[item.id].sizing };
    generation++;
    if (event.type === 'keydown') { clearTimeout(resizeTimer); resizeTimer = setTimeout(finishUserResize, 250); }
  }
  function adoptPointerResize() {
    if (!pointerResize || userResize) return;
    const pending = pointerResize.find(item => item.handle.getAttribute('data-separator') === 'active');
    if (!pending || config[pending.id].visibility === 'always' || pending.handle.hasAttribute('data-unqlock-panel-locked')) return;
    clearTimeout(resizeTimer);
    userResize = pending;
    generation++;
  }
  async function finishUserResize() {
    adoptPointerResize();
    pointerResize = null;
    const pending = userResize;
    if (!pending) return;
    await frame();
    if (userResize !== pending) return;
    userResize = null;
    await recordUserResize(pending);
  }
  async function recordUserResize(pending) {
    const item = find(pending.id);
    if (!item?.close || pending.route !== moduleRoute()) return;
    const value = model.width(measured(item));
    const visit = visits.get(pending.id);
    if (visit && value !== null && value !== pending.before) { visit.userSized = true; visit.lastWidth = value; visit.sized = true; }
    if (value === null || value === pending.before || pending.sizing !== 'remember' || config[pending.id].sizing !== 'remember' || config[pending.id].visibility === 'always') return;
    try { await api.storage.local.set({ [model.rememberedKey(pending.id)]:value }); } catch { /* Keep the current native width if storage is unavailable. */ }
  }
  document.addEventListener('pointerdown', beginUserResize, true);
  document.addEventListener('keydown', beginUserResize, true);
  document.addEventListener('pointerup', finishUserResize, true);
  document.addEventListener('pointercancel', () => { pointerResize = null; userResize = null; }, true);
  new MutationObserver(adoptPointerResize).observe(document.documentElement, { subtree:true, attributes:true, attributeFilter:['data-separator'] });
  function relevantNode(node) {
    return node.nodeType === 1 && (node.matches(groupSelector + ',' + panelSelector + ',' + handleSelector + ',' + toggleSelector)
      || node.querySelector(groupSelector + ',' + toggleSelector));
  }
  new MutationObserver(records => {
    if (!records.some(record => record.type === 'attributes'
      ? record.target.matches(toggleSelector)
      : [...record.addedNodes, ...record.removedNodes].some(relevantNode))) return;
    schedule();
  }).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-label'] });
  window.addEventListener('popstate', schedule);
  // pushState has no browser event in the isolated world. A light URL check also covers persistent outer panels.
  if (window.navigation) window.navigation.addEventListener('currententrychange', schedule);
  else setInterval(() => { if (moduleRoute() !== route) schedule(); }, 1000);
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const id of Object.keys(model.panels)) {
      const key = model.rememberedKey(id);
      if (changes[key]) stored[key] = changes[key].newValue;
    }
    if (changes.builderPanels) {
      userResize = null; pointerResize = null; clearTimeout(resizeTimer);
      for (const element of locks.keys()) unlock(element);
      const next = model.settings(changes.builderPanels.newValue);
      for (const id of Object.keys(model.panels)) {
        if (next[id].sizing !== config[id].sizing || next[id].width !== config[id].width) {
          const visit = visits.get(id); if (visit) { visit.sized = false; visit.userSized = false; }
        }
      }
      config = next;
      generation++;
      schedule();
    }
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'panels.measure') return;
    if (sender.id !== api.runtime.id) return;
    respond({ errors:resizeErrors, widths:Object.fromEntries(Object.keys(model.panels).map(id => {
      const item = moduleRoute() && find(id);
      return [id, item?.close ? model.width(measured(item)) : null];
    })) });
  });
  api.storage.local.get(['builderPanels', ...Object.keys(model.panels).map(model.rememberedKey)]).then(result => {
    config = model.settings(result.builderPanels); stored = result; ready = true; schedule();
  }).catch(() => { ready = true; schedule(); });
})();
