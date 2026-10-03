"use strict";
(async () => {
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const embedded = window.top !== window;
  const version = api.runtime?.getManifest?.().version;
  if (version) document.getElementById('version').textContent = 'v' + version;
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
    for (const file of ['environment.js', 'panel-settings.js', 'row-layout.js', 'toolbar-settings.js', 'component-colors.js', 'disabled-controls.js', 'quick-actions.js', 'popup.js', 'quick-popup.js', 'environment-popup.js', 'launcher-popup.js', 'panels-popup.js', 'settings-transfer.js', 'transfer-popup.js']) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = file;
        script.onload = resolve;
        script.onerror = reject;
        document.body.append(script);
      });
    }
    // Firefox opens import in a tab, since its toolbar popup closes when the file picker appears.
    if (new URL(location.href).searchParams.get('page') === 'transfer-page') UnqlockPages.open('transfer-page');
    if (embedded) {
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented) document.getElementById('floating-close').click();
      });
      if (new URL(location.href).searchParams.get('input') === 'keyboard') {
        document.getElementById('environment-manage').focus();
      } else {
        // Keep keyboard input inside the popup without selecting a menu item.
        const container = document.querySelector('main');
        container.tabIndex = -1;
        container.classList.add('initial-focus');
        container.focus();
      }
    }
    document.body.classList.add('ready');
  } catch {
    document.querySelector('main').textContent = 'Could not open Unqlock on this page. Reload the page and try again.';
  }
})();
