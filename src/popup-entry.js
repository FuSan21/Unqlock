"use strict";
(async () => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const embedded = window.top !== window;
  try {
    if (embedded) {
      // Resolve the containing tab through the browser, never a page-supplied ID.
      const result = await api.runtime.sendMessage({ type:'floating.target' });
      if (!result?.ok) throw new Error('This page is not configured for Unqlock.');
      document.body.classList.add('embedded');
      const close = document.getElementById('floating-close');
      close.hidden = false;
      close.addEventListener('click', () => parent.postMessage({ type:'unqlock.close' }, new URL(result.tab.url).origin));
    }
    for (const file of ['environment.js', 'quick-actions.js', 'popup.js', 'quick-popup.js', 'environment-popup.js', 'general-popup.js']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = file;
        script.onload = resolve;
        script.onerror = reject;
        document.body.append(script);
      });
    }
    if (embedded) {
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented) document.getElementById('floating-close').click();
      });
      document.getElementById('open-appearance').focus();
    }
    document.body.classList.add('ready');
  } catch {
    document.querySelector('main').textContent = 'Could not open Unqlock on this page. Reload the page and try again.';
  }
})();
