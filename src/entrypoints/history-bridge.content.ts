import { defineContentScript } from 'wxt/utils/define-content-script';
import { whenIde } from '@/lib/builder-route';
import { frameScheduler } from '@/lib/frame';
import { describe, promotionsOf } from '@/lib/history-promotions';
import { ancestors } from '@/lib/react-fiber';

export default defineContentScript({
  // Every unqork.io page, since Unqork's module search reaches the builder without a page load.
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    whenIde(() => {
      // Unqork's History view lists a module's saves, and its Promoted filter knows which were promoted, but a
      // row does not show it. Each row's React node holds the save's record, so while the history content script
      // marks the root, a promoted row is marked with its promotions, which style.css shows as a badge, and its
      // button gets them as a tooltip. A row whose record is not found is left alone.
      const rowSelector = 'li > div.group > button[aria-label]';
      const rootAttribute = 'data-unqlock-history-promotions';
      const promotedAttribute = 'data-unqlock-promoted';
      const { schedule } = frameScheduler(render);

      // The record sits two levels above the row's button.
      function revisionOf(button: Element) {
        for (const fiber of ancestors(button, 6)) {
          const revision = fiber.memoizedProps?.revision;
          if (revision && typeof revision._id === 'string') return revision;
        }
        return null;
      }

      function render() {
        const on = document.documentElement.hasAttribute(rootAttribute);
        for (const button of document.querySelectorAll(rowSelector)) {
          const row = button.parentElement!;
          const marked = row.getAttribute(promotedAttribute);
          const promotions = on ? promotionsOf(revisionOf(button)) : [];
          const value = promotions.length ? describe(promotions) : null;
          if (value === marked) continue;
          // The tooltip is removed only while it is still the one written here.
          if (marked !== null && button.getAttribute('title') === marked) button.removeAttribute('title');
          if (value === null) row.removeAttribute(promotedAttribute);
          else {
            row.setAttribute(promotedAttribute, value);
            button.setAttribute('title', value);
          }
        }
      }

      // Only rows coming, going or being relabelled, as when the save-type filter reuses them, need a pass.
      const touchesRow = (node: Node) => node.nodeType === 1 && ((node as Element).matches(rowSelector) || (node as Element).querySelector(rowSelector) !== null);
      const observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' ? record.attributeName !== 'aria-label' || touchesRow(record.target) : [...record.addedNodes].some(touchesRow))) schedule();
      });
      const start = () => {
        observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-label'] });
        schedule();
      };
      // The history content script turns the badges on and off through the root attribute.
      observer.observe(document.documentElement, { attributes:true, attributeFilter:[rootAttribute] });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start, { once:true });
    });
  }
});
