import { defineContentScript } from 'wxt/utils/define-content-script';
import { whenIde } from '@/lib/builder-route';
import { api } from '@/lib/api';
import * as Panels from '@/lib/panel-settings';
import './style.css';

export default defineContentScript({
  // Every unqork.io page, since Unqork's module search reaches the builder without a page load.
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_idle',
  // Don't broadcast WXT's start-up message to the page's own message listeners.
  noScriptStartedPostMessage: true,
  main() {
    whenIde(() => {
      const navSelector = 'nav[data-testid="navigation-tabs"]';
      let mode: Panels.TabsMode = 'native';
      let scheduled = false;
      let stopped = false;
      let route = location.pathname;
      // Clicks per tab or group since the last route or settings change.
      let attempts = new Map<string, number>();
      // Only a hidden bar needs to watch the page; Unqork's default costs nothing.
      const observer = new MutationObserver(schedule);

      // Unqork closes a tab that is not the current page without a dirty check, since the navigation
      // guard already handled leaving it. A control that keeps coming back means its click did nothing;
      // leave the tabs alone until the next route or settings change instead of clicking in a loop.
      function press(key: string, button: HTMLButtonElement) {
        const count = (attempts.get(key) || 0) + 1;
        if (count > 3) { stopped = true; return; }
        attempts.set(key, count);
        button.click();
      }

      // Keeps only the current tab, through Unqork's own close buttons, so its store and saved
      // workspace tabs shrink the same way they would for a user closing them.
      function render() {
        scheduled = false;
        if (route !== location.pathname) {
          route = location.pathname;
          stopped = false;
          attempts = new Map();
        }
        if (mode !== 'hidden' || stopped) return;
        const nav = document.querySelector(navSelector);
        // A route without a tab of its own, such as a preview, has nothing to keep.
        if (!nav?.querySelector('[data-sortable-tab] a[data-active]')) return;
        // A collapsed group does not render its tabs; open it so they can be closed.
        for (const pill of nav.querySelectorAll<HTMLButtonElement>('[data-tab-group-pill] button[aria-expanded="false"]')) {
          press('group:' + (pill.closest('[data-tab-group]')?.getAttribute('data-tab-group') || ''), pill);
          if (stopped) return;
        }
        for (const tab of nav.querySelectorAll('[data-sortable-tab]')) {
          if (tab.querySelector('a[data-active]')) continue;
          const close = tab.querySelector<HTMLButtonElement>('button[aria-label^="Close "][aria-label$=" tab"]');
          if (close) press('tab:' + tab.getAttribute('data-sortable-tab'), close);
          if (stopped) return;
        }
      }

      function schedule() {
        if (!scheduled) {
          scheduled = true;
          requestAnimationFrame(render);
        }
      }

      function apply(value?: unknown) {
        mode = Panels.tabsMode(value);
        stopped = false;
        attempts = new Map();
        // style.css hides the bar while this attribute says so.
        document.documentElement.setAttribute('data-unqlock-navigation-tabs', mode);
        observer.disconnect();
        if (mode === 'hidden') {
          observer.observe(document.body, { childList:true, subtree:true });
          schedule();
        }
      }

      api.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[Panels.tabsKey]) apply(changes[Panels.tabsKey].newValue);
      });
      api.storage.local.get(Panels.tabsKey).then(result => apply(result[Panels.tabsKey])).catch(() => apply());
    });
  }
});
