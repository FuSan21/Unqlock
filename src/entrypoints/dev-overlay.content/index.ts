import { defineContentScript } from 'wxt/utils/define-content-script';
import { api } from '@/lib/api';
import { detachedName, inIde, isDetached, whenIde } from '@/lib/builder-route';
import * as DevOverlay from '@/lib/dev-overlay';
import './style.css';

const overlaySelector = '[data-testid="dev-overlay"]';
const minimizeSelector = 'button[aria-label="Minimize dev overlay"]';
const expandSelector = 'button[aria-label="Expand dev overlay"]';
const svgNs = 'http://www.w3.org/2000/svg';

// A lucide-style icon with the classes of Unqork's own, so it takes the same size and color.
function icon(like: Element | null, shapes: [string, Record<string, string>][]) {
  const svg = document.createElementNS(svgNs, 'svg');
  for (const [name, value] of Object.entries({ viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'2', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true' })) svg.setAttribute(name, value);
  svg.setAttribute('class', like?.getAttribute('class') || '');
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(svgNs, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}

// A button beside Unqork's Minimize button, styled like it. The row spreads its children apart, so
// style.css pushes this one right, next to Minimize.
function button(minimize: HTMLButtonElement, attribute: string, label: string, shapes: [string, Record<string, string>][], action: () => void) {
  const current = minimize.parentElement?.querySelector<HTMLButtonElement>(`:scope > [${attribute}]`);
  if (current?.nextElementSibling === minimize) return;
  const created = document.createElement('button');
  created.type = 'button';
  created.setAttribute(attribute, '');
  created.setAttribute('aria-label', label);
  created.title = label;
  created.className = minimize.className;
  created.append(icon(minimize.querySelector('svg'), shapes));
  created.addEventListener('click', action);
  current?.remove();
  minimize.before(created);
}

export default defineContentScript({
  // Registered by the background on every unqork.io page, since Unqork's module search reaches the
  // builder without a page load, and only while Debug tools → Detach dev overlay is on.
  registration: 'runtime',
  // Don't broadcast WXT's start-up message to the page's own message listeners.
  noScriptStartedPostMessage: true,
  main() {
    const root = document.documentElement;
    const stateAttribute = 'data-unqlock-dev-overlay';
    // Turning the option on also injects this into open builder tabs, which may already have it.
    if (root.hasAttribute(stateAttribute)) return;
    root.setAttribute(stateAttribute, isDetached() ? 'detached' : 'attached');
    let scheduled = false;
    const observer = new MutationObserver(schedule);
    let render = () => {};
    function schedule() {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; render(); });
      }
    }
    const watch = (step: () => void, options: MutationObserverInit) => {
      render = step;
      observer.observe(document.documentElement, { childList:true, subtree:true, ...options });
      schedule();
    };
    // Turning the option off removes what was added; reloaded pages no longer get the script at all.
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[DevOverlay.key] || DevOverlay.enabled(changes[DevOverlay.key].newValue)) return;
      observer.disconnect();
      render = () => {};
      document.querySelectorAll('[data-unqlock-detach], [data-unqlock-reattach]').forEach(button => button.remove());
      root.removeAttribute(stateAttribute);
    });

    // The popup is a full copy of the builder showing only the overlay, so dropdowns, editors and
    // Execute keep working as Unqork wrote them. Its debugger state is its own.
    if (isDetached()) {
      if (!inIde()) return;
      // Unqork saves the overlay as minimized when it is detached; open it here, a few times at most.
      let expands = 0;
      watch(() => {
        const overlay = document.querySelector(overlaySelector);
        if (overlay?.getAttribute('aria-hidden') === 'true' && expands < 3) {
          const expand = document.querySelector<HTMLButtonElement>(expandSelector);
          if (expand) { expands++; expand.click(); }
        }
        const minimize = document.querySelector<HTMLButtonElement>(minimizeSelector);
        // Closing the popup is what reattaches; the opener notices and expands its overlay.
        if (minimize) button(minimize, 'data-unqlock-reattach', 'Reattach dev overlay', [
          ['rect', { width:'18', height:'18', x:'3', y:'3', rx:'2' }], ['path', { d:'M3 15h18' }], ['path', { d:'m9 10 3 3 3-3' }]
        ], () => window.close());
        if (!document.title.startsWith('Dev overlay · ')) document.title = 'Dev overlay · ' + document.title;
      }, { attributes:true, attributeFilter:['aria-hidden'] });
      return;
    }

    whenIde(() => {
      let popup: Window | null = null;
      let timer = 0;
      function detach() {
        const minimize = document.querySelector<HTMLButtonElement>(minimizeSelector);
        const rect = document.querySelector(overlaySelector)?.getBoundingClientRect();
        const width = Math.min(screen.availWidth, Math.max(900, Math.round(rect?.width || 0)));
        const height = Math.min(screen.availHeight, Math.max(600, Math.round(rect?.height || 0)));
        // The same name reuses an open popup, which moves to this module.
        const opened = window.open(location.href, detachedName, `popup,width=${width},height=${height}`);
        if (!opened) return;
        opened.focus();
        popup = opened;
        minimize?.click();
        clearInterval(timer);
        timer = window.setInterval(() => {
          if (!popup?.closed) return;
          clearInterval(timer);
          popup = null;
          if (document.querySelector(overlaySelector)?.getAttribute('aria-hidden') === 'true') document.querySelector<HTMLButtonElement>(expandSelector)?.click();
        }, 1000);
      }
      watch(() => {
        const minimize = document.querySelector<HTMLButtonElement>(minimizeSelector);
        if (minimize) button(minimize, 'data-unqlock-detach', 'Detach dev overlay', [
          ['path', { d:'M15 3h6v6' }], ['path', { d:'M10 14 21 3' }], ['path', { d:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]
        ], detach);
      }, {});
    });
  }
});
