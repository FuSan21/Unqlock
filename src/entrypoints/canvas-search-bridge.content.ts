import { defineContentScript } from 'wxt/utils/define-content-script';
import { inBuilder, whenIde } from '@/lib/builder-route';
import { index, results, type Definition, type Result } from '@/lib/canvas-search';
import { frameScheduler } from '@/lib/frame';
import { ancestors, currentFiber } from '@/lib/react-fiber';

interface SearchState { matches: Set<string>; current: unknown; select: (component: Definition) => void }

export default defineContentScript({
  // Every unqork.io page, since Unqork's module search reaches the builder without a page load.
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    whenIde(() => {
      // Lists the canvas search's matches under its field while the canvas-toolbar content script marks the root.
      // The matches, the current one and the select function are the props Unqork gives every canvas row
      // (searchMatchKeys, currentSearchKey, onNodeClick); a row whose node lacks them leaves the field alone.
      // Picking a match opens the containers above it, scrolls to its row and selects it through onNodeClick,
      // as clicking the row does, which opens its Properties.
      const inputSelector = '[role="toolbar"][aria-label="Editing toolbar"] input[aria-label="Search configuration"]';
      const rowSelector = '[data-component-key]';
      const listId = 'unqlock-search-results';
      const limit = 100;
      let list: HTMLElement | null = null;
      let shown: Result[] = [];
      let signature = '';
      let active = -1;
      // Escape or a pick hides the list until the text changes or an arrow key asks for it again.
      let dismissed = false;
      const { schedule } = frameScheduler(render);
      const enabled = () => document.documentElement.hasAttribute('data-unqlock-search-results') && inBuilder();
      const field = () => document.querySelector<HTMLInputElement>(inputSelector);

      // Either version of a row's node identifies it; only the current one has the latest search. The node is nine
      // levels above a container's row and thirteen above any other.
      function searchState(): SearchState | null {
        for (const row of document.querySelectorAll(rowSelector)) {
          for (const fiber of ancestors(row, 20)) {
            if (!(fiber.memoizedProps?.searchMatchKeys instanceof Set) && !(fiber.alternate?.memoizedProps?.searchMatchKeys instanceof Set)) continue;
            const props = currentFiber(fiber)?.memoizedProps;
            return props?.searchMatchKeys instanceof Set && typeof props.onNodeClick === 'function' ? { matches:props.searchMatchKeys, current:props.currentSearchKey, select:props.onNodeClick } : null;
          }
        }
        return null;
      }

      // The definition a row's node holds, matched by key so a row does not take its container's.
      function definition(row: Element) {
        const key = row.getAttribute('data-component-key');
        for (const fiber of ancestors(row, 12)) {
          const component = fiber.memoizedProps?.component;
          if (component && component.key === key) return component;
        }
        return null;
      }
      const tree = () => index([...document.querySelectorAll(rowSelector)].map(definition));
      const rowOf = (key: string) => document.querySelector(rowSelector.slice(0, -1) + '="' + CSS.escape(key) + '"]');

      function hide(input = field()) {
        list?.remove();
        list = null;
        shown = [];
        signature = '';
        active = -1;
        input?.removeAttribute('aria-controls');
        input?.removeAttribute('aria-activedescendant');
      }

      // The deepest container above a match whose row is on the canvas; when the match itself is not, that
      // container is collapsed.
      function collapsedIn(result: Result) {
        if (rowOf(result.key)) return '';
        return [...result.path].reverse().find(key => rowOf(key)) || result.path[0] || '';
      }

      function option(result: Result, position: number, current: unknown) {
        const item = document.createElement('div');
        item.id = listId + '-' + position;
        item.setAttribute('role', 'option');
        item.setAttribute('data-key', result.key);
        if (result.key === current) item.setAttribute('data-current', '');
        const name = document.createElement('span');
        name.setAttribute('data-part', 'key');
        name.textContent = result.key;
        item.append(name);
        if (result.label && result.label !== result.key) {
          const label = document.createElement('span');
          label.setAttribute('data-part', 'label');
          label.textContent = result.label;
          item.append(label);
        }
        const inside = collapsedIn(result);
        if (inside) {
          const where = document.createElement('span');
          where.setAttribute('data-part', 'inside');
          where.textContent = 'in ' + inside;
          where.title = 'Inside ' + inside + ', which is collapsed';
          item.append(where);
        }
        if (result.type) {
          const type = document.createElement('span');
          type.setAttribute('data-part', 'type');
          type.textContent = result.type;
          item.append(type);
        }
        // Keeps focus in the field, so Unqork's search stays open and the list stays up.
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => go(result));
        return item;
      }

      function create() {
        const element = document.createElement('div');
        element.setAttribute('data-unqlock-search-list', '');
        element.addEventListener('mousedown', event => event.preventDefault());
        document.body.append(element);
        return element;
      }

      function place(input: HTMLInputElement) {
        const box = (input.closest('[data-slot="input-group"]') || input).getBoundingClientRect();
        const width = Math.min(Math.max(box.width, 360), window.innerWidth - 16);
        // Right-aligned under the field, which sits at the toolbar's right edge, and kept in the window.
        const left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8));
        list!.style.cssText = `top:${Math.round(box.bottom + 4)}px;left:${Math.round(left)}px;width:${Math.round(width)}px;max-height:${Math.max(120, Math.round(window.innerHeight - box.bottom - 16))}px`;
      }

      // `reveal` scrolls the active option into view, for arrow keys only, so the list can be scrolled freely.
      function highlight(input: HTMLInputElement, reveal = false) {
        list?.querySelectorAll('[role="option"]').forEach((item, position) => item.setAttribute('aria-selected', String(position === active)));
        const chosen = active >= 0 ? list?.querySelector('#' + listId + '-' + active) : null;
        if (chosen) {
          input.setAttribute('aria-activedescendant', chosen.id);
          if (reveal) chosen.scrollIntoView({ block:'nearest' });
        } else input.removeAttribute('aria-activedescendant');
      }

      function render() {
        const input = field();
        if (!input || !enabled() || dismissed || document.activeElement !== input || !input.value.trim()) { hide(input); return; }
        let state: SearchState | null = null;
        try { state = searchState(); } catch { state = null; }
        // Any other shape leaves Unqork's search as it is.
        if (!state) { hide(input); return; }
        let found: Result[];
        try { found = results(state.matches, tree()); } catch { hide(input); return; }
        list ||= create();
        place(input);
        const next = JSON.stringify([found.slice(0, limit).map(result => [result.key, result.label, result.type, collapsedIn(result)]), found.length, state.current]);
        if (next !== signature) {
          signature = next;
          shown = found.slice(0, limit);
          if (active >= shown.length) active = shown.length - 1;
          const heading = document.createElement('div');
          heading.setAttribute('data-part', 'heading');
          heading.textContent = !found.length ? 'No components match' : found.length === 1 ? '1 match' : found.length > limit ? `First ${limit} of ${found.length} matches` : found.length + ' matches';
          const options = document.createElement('div');
          options.id = listId;
          options.setAttribute('role', 'listbox');
          options.setAttribute('aria-label', 'Search results');
          options.append(...shown.map((result, position) => option(result, position, state!.current)));
          list.replaceChildren(heading, options);
        }
        input.setAttribute('aria-controls', listId);
        highlight(input);
      }

      // A row appears a few frames after its container opens.
      async function rendered(key: string) {
        for (let frame = 0; frame < 30; frame++) {
          const row = rowOf(key);
          if (row) return row;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return null;
      }

      // Opens each collapsed container above the match, outermost first, through its chevron, which toggles
      // without selecting; then scrolls to the row and selects the component as a click on its row would.
      async function go(result: Result) {
        dismissed = true;
        hide();
        if (!result.component) return;
        try {
          for (const key of result.path) {
            const row = await rendered(key);
            if (!row) break;
            if (row.getAttribute('aria-expanded') === 'false') row.querySelector('svg.lucide-chevron-down')?.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true, view:window }));
          }
          (await rendered(result.key))?.scrollIntoView({ block:'center' });
          searchState()?.select(result.component);
        } catch { /* A changed builder must not break the editor. */ }
      }

      // Capture on window runs before React's listener on its root, so a key the list uses never reaches Unqork.
      window.addEventListener('keydown', event => {
        const input = event.target as HTMLInputElement;
        if (event.isComposing || !input.matches?.(inputSelector) || !enabled()) return;
        const step = ({ ArrowDown:1, ArrowUp:-1 } as Record<string, number>)[event.key];
        if (step) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!list) { dismissed = false; render(); return; }
          if (!shown.length) return;
          active = active < 0 ? (step > 0 ? 0 : shown.length - 1) : (active + step + shown.length) % shown.length;
          highlight(input, true);
        } else if (event.key === 'Enter' && list && active >= 0 && shown[active]) {
          // Only a match picked with the arrows; otherwise Enter stays Unqork's.
          event.preventDefault();
          event.stopImmediatePropagation();
          go(shown[active]);
        } else if (event.key === 'Escape' && list) {
          // The first Escape closes the list; the next is Unqork's, or the toolbar option's.
          event.preventDefault();
          event.stopImmediatePropagation();
          dismissed = true;
          hide(input);
        }
      }, true);

      // Unqork filters as the text changes and re-renders its rows afterward, so the list looks again once they have.
      document.addEventListener('input', event => {
        if (!(event.target as Element).matches?.(inputSelector)) return;
        dismissed = false;
        active = -1;
        for (const delay of [0, 120, 400]) setTimeout(schedule, delay);
      }, true);
      document.addEventListener('focusin', schedule, true);
      document.addEventListener('focusout', () => setTimeout(schedule), true);
      window.addEventListener('resize', schedule);
      document.addEventListener('scroll', schedule, true);
      new MutationObserver(schedule).observe(document.documentElement, { attributes:true, attributeFilter:['data-unqlock-search-results'] });
    });
  }
});
