(() => {
  'use strict';
  // Only bounded panel resizing and collapse policy cross this MAIN-world bridge.
  const locked = new Map();
  const moduleRoute = () => location.pathname.match(/^\/ide\/builder\/workspaces\/[^/]+\/modules\/[^/]+/)?.[0] || '';
  function panelRef(panel) {
    const key = Object.keys(panel).find(key => key.startsWith('__reactFiber$'));
    let fiber = key && panel[key];
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.['data-slot'] === 'resizable-panel-group') break;
      const ref = props?.panelRef?.current;
      if (ref && typeof ref.resize === 'function' && typeof ref.getSize === 'function' && typeof ref.collapse === 'function') return ref;
    }
  }
  function release(id) {
    const record = locked.get(id);
    if (!record) return;
    for (const name of ['expand', 'resize']) {
      if (Object.getOwnPropertyDescriptor(record.ref, name)?.get === record.getters[name]) {
        Object.defineProperty(record.ref, name, { ...record.descriptors[name], value:record.current[name] });
      }
    }
    record.panel.removeAttribute('data-unqlock-native-locked');
    locked.delete(id);
  }
  function preventExpansion(panel, route) {
    const ref = panelRef(panel);
    if (!ref) return false;
    const previous = locked.get(panel.id);
    if (previous?.ref === ref && previous.panel === panel && previous.route === route) { ref.collapse(); return true; }
    release(panel.id);
    const names = ['expand', 'resize'];
    const descriptors = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(ref, name)]));
    if (names.some(name => !descriptors[name]?.configurable || !descriptors[name]?.writable || typeof descriptors[name]?.value !== 'function')) return false;
    const record = { panel, ref, route, descriptors, current:{}, getters:{} };
    const blocked = () => {};
    for (const name of names) {
      record.current[name] = descriptors[name].value;
      // The library refreshes these public methods on rerender. Retain each
      // replacement so unlocking restores the current native implementation.
      record.getters[name] = () => panel.isConnected && moduleRoute() === record.route ? blocked : record.current[name];
      Object.defineProperty(ref, name, {
        configurable:true, enumerable:descriptors[name].enumerable,
        get:record.getters[name], set:value => { record.current[name] = value; }
      });
    }
    locked.set(panel.id, record);
    ref.collapse();
    panel.setAttribute('data-unqlock-native-locked', 'true');
    return true;
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || !['unqlock.panel.resize', 'unqlock.panel.locks'].includes(data?.type)) return;
    if (typeof data.request !== 'string' || data.request.length > 80) return;
    const route = moduleRoute();
    if (data.type === 'unqlock.panel.locks') {
      if (!Array.isArray(data.panels) || data.panels.length > 4 || data.panels.some(id => typeof id !== 'string' || id.length > 200)) return;
      const wanted = route ? new Set(data.panels) : new Set();
      for (const id of locked.keys()) if (!wanted.has(id)) release(id);
      let ok = true;
      for (const id of wanted) {
        try {
          const panel = document.getElementById(id);
          if (!panel?.matches('[data-slot="resizable-panel"]') || !preventExpansion(panel, route)) ok = false;
        } catch { release(id); ok = false; }
      }
      window.postMessage({type:'unqlock.panel.locked', request:data.request, ok}, location.origin);
      return;
    }
    if (!route || typeof data.panelId !== 'string' || data.panelId.length > 200 || !Number.isFinite(data.width) || data.width < 120 || data.width > 1600) return;
    let ok = false;
    try {
      const panel = document.getElementById(data.panelId);
      const ref = panel?.matches('[data-slot="resizable-panel"]') && panelRef(panel);
      if (ref && !locked.has(panel.id)) { ref.resize(data.width + 'px'); ok = true; }
    } catch { /* A changed builder implementation must not break the editor. */ }
    window.postMessage({type:'unqlock.panel.resized', request:data.request, ok}, location.origin);
  });
})();
