(() => {
  'use strict';
  // MAIN-world adapter: only exposes a bounded, cosmetic resize. No extension APIs,
  // module contents, application actions or arbitrary property/method names cross it.
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window || event.origin !== location.origin || data?.type !== 'unqlock.panel.resize') return;
    if (!/^\/ide\/builder\/workspaces\/[^/]+\/modules\/[^/]+/.test(location.pathname)) return;
    if (typeof data.request !== 'string' || data.request.length > 80 || typeof data.panelId !== 'string' || data.panelId.length > 200) return;
    if (!Number.isFinite(data.width) || data.width < 120 || data.width > 1600) return;
    let ok = false;
    try {
      const panel = document.getElementById(data.panelId);
      if (panel?.matches('[data-slot="resizable-panel"]')) {
        // Unqork's Panel wrapper supplies the library's public imperative panelRef.
        // Find that ref without modifying React state, styles, or pointer-capture APIs.
        const key = Object.keys(panel).find(key => key.startsWith('__reactFiber$'));
        let fiber = key && panel[key];
        for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
          const props = fiber.memoizedProps;
          if (props?.['data-slot'] === 'resizable-panel-group') break;
          const ref = props?.panelRef?.current;
          if (ref && typeof ref.resize === 'function' && typeof ref.getSize === 'function' && typeof ref.collapse === 'function') {
            ref.resize(data.width + 'px'); ok = true; break;
          }
        }
      }
    } catch { /* A changed builder implementation must not break the editor. */ }
    window.postMessage({type:'unqlock.panel.resized', request:data.request, ok}, location.origin);
  });
})();
