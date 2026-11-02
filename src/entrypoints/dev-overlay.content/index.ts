import { defineContentScript } from 'wxt/utils/define-content-script';
import { api } from '@/lib/api';
import { detachedName, inIde, isDetached, whenIde } from '@/lib/builder-route';
import * as DevOverlay from '@/lib/dev-overlay';
import * as SseDebugger from '@/lib/sse-debugger';
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

// A button before Unqork's Minimize button, or before another added one, styled like Minimize. The row
// spreads its children apart, so style.css pushes the first added button right, next to Minimize.
function button(minimize: HTMLButtonElement, attribute: string, label: string, shapes: [string, Record<string, string>][], action: () => void, before: Element = minimize) {
  const current = minimize.parentElement?.querySelector<HTMLButtonElement>(`:scope > [${attribute}]`);
  if (current?.nextElementSibling === before) return;
  const created = document.createElement('button');
  created.type = 'button';
  created.setAttribute(attribute, '');
  created.setAttribute('aria-label', label);
  created.title = label;
  created.className = minimize.className;
  created.append(icon(minimize.querySelector('svg'), shapes));
  created.addEventListener('click', action);
  current?.remove();
  before.before(created);
}

// The screen this page is on, without the taskbar or dock. availLeft and availTop place it among several
// screens; Firefox and Chrome have them, other engines may not.
function workArea() {
  const area = screen as Screen & { availLeft?: number; availTop?: number };
  return { left:area.availLeft ?? 0, top:area.availTop ?? 0, width:screen.availWidth, height:screen.availHeight };
}

// Lucide's bug icon, for Open in Unqlock debugger.
const bug: [string, Record<string, string>][] = [
  ['path', { d:'m8 2 1.88 1.88' }], ['path', { d:'M14.12 3.88 16 2' }], ['path', { d:'M9 7.13v-1a3.003 3.003 0 1 1 6 0v1' }],
  ['path', { d:'M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6' }], ['path', { d:'M12 20v-9' }],
  ['path', { d:'M6.53 9C4.6 8.8 3 7.1 3 5' }], ['path', { d:'M6 13H2' }], ['path', { d:'M3 21c0-2.1 1.7-3.9 3.8-4' }],
  ['path', { d:'M20.97 5c0 2.1-1.6 3.8-3.5 4' }], ['path', { d:'M22 13h-4' }], ['path', { d:'M17.2 17c2.1.1 3.8 1.9 3.8 4' }]
];

export default defineContentScript({
  // Registered by the background on every unqork.io page, since Unqork's module search reaches the
  // builder without a page load, and only while Debug tools → Detach dev overlay or Unqlock SSE debugger
  // is on. It adds the button of each option that is on.
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
    // Which buttons to add. Turning an option off removes its button; with both off the script stands down,
    // and reloaded pages no longer get it at all.
    const options = { detach:false, debugger:false };
    const remove = (selector: string) => document.querySelectorAll(selector).forEach(button => button.remove());
    function apply() {
      if (!options.detach) remove('[data-unqlock-detach], [data-unqlock-reattach]');
      if (!options.debugger) remove('[data-unqlock-debugger]');
      if (options.detach || options.debugger) { schedule(); return; }
      // Standing down: turning an option on again injects a fresh copy, which owns the root attribute.
      observer.disconnect();
      render = () => {};
      api.storage.onChanged.removeListener?.(changed);
      root.removeAttribute(stateAttribute);
    }
    function changed(changes: Record<string, { newValue?: unknown }>, area: string) {
      if (area !== 'local' || (!changes[DevOverlay.key] && !changes[SseDebugger.key])) return;
      if (changes[DevOverlay.key]) options.detach = DevOverlay.enabled(changes[DevOverlay.key].newValue);
      if (changes[SseDebugger.key]) options.debugger = SseDebugger.enabled(changes[SseDebugger.key].newValue);
      apply();
    }
    api.storage.onChanged.addListener(changed);
    api.storage.local.get([DevOverlay.key, SseDebugger.key]).then(stored => {
      options.detach = DevOverlay.enabled(stored[DevOverlay.key]);
      options.debugger = SseDebugger.enabled(stored[SseDebugger.key]);
      apply();
    }).catch(() => {});

    // The popup is a full copy of the builder showing only the overlay, so dropdowns, editors and
    // Execute keep working as Unqork wrote them. Its debugger state is its own.
    if (isDetached()) {
      if (!inIde()) return;
      // Firefox reads the opener's width and height as the content area and adds its frame, which runs the
      // window past the work area; once loaded, a window that overflows fits itself to it.
      const area = workArea();
      if (outerWidth > area.width + 8 || outerHeight > area.height + 8) {
        try { moveTo(area.left, area.top); resizeTo(area.width, area.height); } catch {}
      }
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
        if (minimize && options.detach) button(minimize, 'data-unqlock-reattach', 'Reattach dev overlay', [
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
        // A page cannot open a window maximized, so the popup covers the screen's work area instead.
        const { left, top, width, height } = workArea();
        // The same name reuses an open popup, which moves to this module.
        const opened = window.open(location.href, detachedName, `popup,left=${left},top=${top},width=${width},height=${height}`);
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
      // The background opens Unqlock's own window for this tab, maximized, or over this work area where it can't.
      const openDebugger = () => { api.runtime.sendMessage({ type:'sse.open', ...workArea() }).catch(() => {}); };
      watch(() => {
        const minimize = document.querySelector<HTMLButtonElement>(minimizeSelector);
        if (!minimize) return;
        if (options.detach) button(minimize, 'data-unqlock-detach', 'Detach dev overlay', [
          ['path', { d:'M15 3h6v6' }], ['path', { d:'M10 14 21 3' }], ['path', { d:'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]
        ], detach);
        // Order in the row: Open in Unqlock debugger, Detach, Minimize.
        if (options.debugger) button(minimize, 'data-unqlock-debugger', 'Open in Unqlock debugger', bug, openDebugger,
          minimize.parentElement?.querySelector(':scope > [data-unqlock-detach]') || minimize);
      }, {});
    });
  }
});
