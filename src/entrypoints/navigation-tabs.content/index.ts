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
      const titleAttribute = 'data-unqlock-module-title';
      const nameAttribute = 'data-unqlock-tab-name';
      let mode: Panels.TabsMode = 'native';
      let scheduled = false;
      let stopped = false;
      let route = location.pathname;
      // Clicks per tab or group since the last route or settings change.
      let attempts = new Map<string, number>();
      // Only a hidden or wrapped bar needs to watch the page; Unqork's default costs nothing.
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

      // The hidden bar was the only place naming the application and module, so its current tab is
      // repeated in the toolbar row, between the two spacers after the view selector. The attribute
      // holds what was rendered, so the mutations this causes find nothing to change.
      function showTitle(active?: Element | null) {
        const current = document.querySelector(`[${titleAttribute}]`);
        const spacer = document.querySelector('button[aria-label="Select view"]')?.parentElement?.nextElementSibling;
        // The title already shown sits between the spacers; look past it.
        const next = spacer?.nextElementSibling === current ? current?.nextElementSibling : spacer?.nextElementSibling;
        if (!active || !spacer?.classList.contains('flex-1') || !next?.classList.contains('flex-1')) {
          current?.remove();
          return;
        }
        const module = (active.querySelector('[data-slot="tooltip-trigger"]') || active).textContent?.trim() || '';
        const pill = active.closest('[data-tab-group]')?.querySelector('[data-tab-group-pill] button');
        const app = (pill?.querySelector('[data-slot="tooltip-trigger"]') || pill)?.textContent?.trim() || '';
        const icon = active.querySelector(':scope > svg.lucide');
        const key = [app, module, icon?.getAttribute('class') || ''].join('\n');
        if (current?.getAttribute(titleAttribute) === key && current.previousElementSibling === spacer) return;
        const part = (name: string, text: string) => {
          const span = document.createElement('span');
          span.setAttribute('data-part', name);
          span.textContent = text;
          return span;
        };
        const title = document.createElement('div');
        title.setAttribute(titleAttribute, key);
        title.title = app ? app + ' / ' + module : module;
        if (app) title.append(part('app', app), part('separator', '/'));
        if (icon) title.append(icon.cloneNode(true));
        title.append(part('module', module));
        current?.remove();
        spacer.after(title);
      }

      // Unqork shortens long tab names in the label text itself, so wrapping alone would not bring them
      // back. Each tab gets the full name from its close button beside the hidden native label.
      function showFullNames(nav: Element | null) {
        for (const link of nav?.querySelectorAll('[data-sortable-tab] a') || []) {
          const label = link.querySelector(':scope > [data-slot="tooltip-trigger"]');
          const close = link.querySelector('button[aria-label^="Close "][aria-label$=" tab"]')?.getAttribute('aria-label');
          const name = close ? close.slice('Close '.length, -' tab'.length) : label?.textContent || '';
          const current = link.querySelector(`:scope > [${nameAttribute}]`);
          if (!label || current?.textContent === name && current.previousElementSibling === label) continue;
          const full = document.createElement('span');
          full.setAttribute(nameAttribute, '');
          full.textContent = name;
          current?.remove();
          label.after(full);
        }
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
        if (mode === 'wrapped') showFullNames(document.querySelector(navSelector));
        if (mode !== 'hidden') return;
        const nav = document.querySelector(navSelector);
        const active = nav?.querySelector('[data-sortable-tab] a[data-active]');
        showTitle(active);
        // A route without a tab of its own, such as a preview, has nothing to keep.
        if (stopped || !nav || !active) return;
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
        // style.css hides or wraps the bar while this attribute says so.
        document.documentElement.setAttribute('data-unqlock-navigation-tabs', mode);
        observer.disconnect();
        document.querySelectorAll(`[${titleAttribute}], [${nameAttribute}]`).forEach(element => element.remove());
        if (mode !== 'native') {
          // A renamed module changes its close button's label in place.
          observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-label'] });
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
