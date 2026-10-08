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
      // React's properties. A row whose node is not found is left unmarked.
      const rowSelector = '[data-component-key]';
      const typeAttribute = 'data-unqlock-type';
      const labelAttribute = 'data-unqlock-label';
      let scheduled = false;

      const fiberOf = (element: Element): Fiber => {
        const key = Object.keys(element).find(name => name.startsWith('__reactFiber$'));
        return key ? (element as unknown as Record<string, Fiber>)[key] : null;
      };
      // The row is the node's own element or sits a few levels inside it.
      function definition(row: Element) {
        const key = row.getAttribute('data-component-key');
        let fiber = fiberOf(row);
        for (let depth = 0; fiber && depth < 6; depth++, fiber = fiber.return) {
          const component = fiber.memoizedProps?.component;
          if (component && component.key === key && typeof component.type === 'string') return component as { type: string; label?: unknown };
        }
        return null;
      }
      const write = (element: Element, name: string, value: string | null) => {
        if (value === null) element.removeAttribute(name);
        else if (element.getAttribute(name) !== value) element.setAttribute(name, value);
      };

      function render() {
        scheduled = false;
        for (const row of document.querySelectorAll(rowSelector)) {
          const component = definition(row);
          write(row, typeAttribute, component ? component.type : null);
          write(row, labelAttribute, component && typeof component.label === 'string' && component.label.trim() ? component.label.trim() : null);
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
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start, { once:true });
    });
  }
});
