import { defineContentScript } from 'wxt/utils/define-content-script';
import { whenIde } from '@/lib/builder-route';

// React fibers are not a typed public API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fiber = any;

export default defineContentScript({
  // Every unqork.io page, since Unqork's module search reaches the builder without a page load.
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    whenIde(() => {
      // Unqork's legacy canvas view draws inputs, buttons and content as a preview, without the icon
      // and type a styled row needs. Each canvas row's React node holds its component definition, so
      // its type and label are copied onto the row for the isolated content script, which cannot read
      // React's properties, along with whether the node renders the legacy view. A row whose node is not
      // found is left unmarked.
      const rowSelector = '[data-component-key]';
      const typeAttribute = 'data-unqlock-type';
      const labelAttribute = 'data-unqlock-label';
      const legacyAttribute = 'data-unqlock-legacy';
      let scheduled = false;

      const fiberOf = (element: Element): Fiber => {
        const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
        return key ? (element as unknown as Record<string, Fiber>)[key] : null;
      };
      // The row is the node's own element or sits a few levels inside it; a container's header is nine
      // levels down. Matching the key keeps a row from taking a parent container's definition.
      function definition(row: Element) {
        const key = row.getAttribute('data-component-key');
        let fiber = fiberOf(row);
        for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
          const component = fiber.memoizedProps?.component;
          if (component && component.key === key && typeof component.type === 'string') return { ...component, legacy:fiber.memoizedProps.renderPreview === true } as { type: string; label?: unknown; title?: unknown; legacy: boolean };
        }
        return null;
      }
      // Field groups keep the label shown in Properties in title, leaving label empty.
      const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
      const labelOf = (component: { label?: unknown; title?: unknown }) => text(component.label) || text(component.title);
      const write = (element: Element, name: string, value: string | null) => {
        if (value === null) element.removeAttribute(name);
        else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      };

      function render() {
        scheduled = false;
        for (const row of document.querySelectorAll(rowSelector)) {
          const component = definition(row);
          write(row, typeAttribute, component ? component.type : null);
          write(row, labelAttribute, component ? labelOf(component) : null);
          write(row, legacyAttribute, component?.legacy ? '' : null);
        }
      }
      function schedule() {
        if (!scheduled) {
          scheduled = true;
          requestAnimationFrame(render);
        }
      }
      // Only rows coming, going or changing key need a pass; most of the builder, such as Build
      // Agent replies, changes on nearly every frame.
      const touchesRow = (node: Node) => node.nodeType === 1 && ((node as Element).matches(rowSelector) || (node as Element).querySelector(rowSelector) !== null);
      const observer = new MutationObserver(records => {
        if (scheduled) return;
        if (records.some(record => record.type === 'attributes' || [...record.addedNodes].some(touchesRow))) schedule();
      });
      const start = () => {
        observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['data-component-key'] });
        schedule();
      };
      // A label edited in the Properties panel changes React's definition but nothing in a row that shows
      // the property ID, so typing there also triggers a pass. Edits from elsewhere, such as Build Agent,
      // undo or redo, are caught by a light poll; a pass only reads definitions and writes changes.
      document.addEventListener('input', schedule, true);
      document.addEventListener('change', schedule, true);
      setInterval(() => { if (!document.hidden) schedule(); }, 1000);
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start, { once:true });
    });
  }
});
