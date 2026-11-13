import { defineContentScript } from 'wxt/utils/define-content-script';
import { whenIde } from '@/lib/builder-route';
import { frameScheduler } from '@/lib/frame';
import { describe, envLabel, formatDate, promotionsOf } from '@/lib/history-promotions';
import * as Restores from '@/lib/history-restores';
import { ancestors, currentFiber, type Fiber } from '@/lib/react-fiber';

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
      // Restored saves get a badge of their own, a real element so that it can be hovered, and a guide drawn
      // from it to the save it was restored from, while its badge is hovered or, under Always, for every one.
      const rowSelector = 'li > div.group > button[aria-label]';
      const rootAttribute = 'data-unqlock-history-promotions';
      const promotedAttribute = 'data-unqlock-promoted';
      // Under Environment, the name line holds the badge's text for style.css to show with attr().
      const envAttribute = 'data-unqlock-promoted-env';
      const restoresAttribute = 'data-unqlock-history-restores';
      const restoredAttribute = 'data-unqlock-restored';
      const badgeAttribute = 'data-unqlock-restored-badge';
      const sourceAttribute = 'data-unqlock-restore-source';
      const guidesAttribute = 'data-unqlock-restore-guides';
      const { schedule } = frameScheduler(render);
      const { schedule: scheduleDraw } = frameScheduler(draw);

      // Every save seen on this page, by ID, and the sources the selected saves' details named.
      const seen = new Map<string, Restores.Save>();
      const known = new Map<string, string>();
      // The restored rows the last pass found, with their sources, and the badge being hovered.
      let guides: { id: string; row: Element; source: string | null }[] = [];
      let hovered: string | null = null;
      let overlay: HTMLElement | null = null;

      // The record sits two levels above the row's button.
      function revisionOf(button: Element) {
        for (const fiber of ancestors(button, 6)) {
          const revision = fiber.memoizedProps?.revision;
          if (revision && typeof revision._id === 'string') return revision;
        }
        return null;
      }

      // The History container, about thirty levels above a row, takes the module's ID and keeps the loaded saves,
      // filtered and paged as Unqork fetched them, and the selected save's detail among its hooks.
      function readContainer(button: Element) {
        let container: Fiber = null;
        for (const fiber of ancestors(button, 60)) {
          if (typeof fiber.memoizedProps?.moduleId === 'string' && fiber.memoizedState) { container = currentFiber(fiber) ?? fiber; break; }
        }
        let list: unknown[] = [];
        for (let hook = container?.memoizedState, count = 0; hook && count < 400; hook = hook.next, count++) {
          const value = hook.memoizedState;
          if (Array.isArray(value)) {
            if (value.length > list.length && typeof value[0]?._id === 'string' && 'created' in value[0]) list = value;
          } else if (value && typeof value === 'object' && typeof value._id === 'string' && typeof value.sourceArchiveId === 'string' && value.sourceArchiveId) {
            known.set(value._id, value.sourceArchiveId);
          }
        }
        return list;
      }

      function remember(revision: unknown) {
        const save = Restores.saveOf(revision, formatDate);
        if (save) seen.set(save.id, save);
        return save;
      }

      // A module's saves seen so far, newest first, which name matching searches.
      function savesOf(module: string) {
        return [...seen.values()].filter(save => save.module === module).sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
      }

      function render() {
        const on = document.documentElement.hasAttribute(rootAttribute);
        const named = document.documentElement.getAttribute(rootAttribute) === 'env';
        const restores = document.documentElement.getAttribute(restoresAttribute);
        const buttons = [...document.querySelectorAll(rowSelector)];
        if (restores && buttons.length) readContainer(buttons[0]).forEach(remember);
        const found: typeof guides = [];
        const rendered = restores ? renderedRows() : new Map<string, Element>();
        const pills: [Element, string | null][] = [];
        for (const button of buttons) {
          const row = button.parentElement!;
          const revision = revisionOf(button);
          const marked = row.getAttribute(promotedAttribute);
          const promotions = on ? promotionsOf(revision) : [];
          const value = promotions.length ? describe(promotions) : null;
          pills.push([row, named && promotions.length ? envLabel(promotions, location.hostname) : null]);
          if (value !== marked) {
            // The tooltip is removed only while it is still the one written here.
            if (marked !== null && button.getAttribute('title') === marked) button.removeAttribute('title');
            if (value === null) row.removeAttribute(promotedAttribute);
            else {
              row.setAttribute(promotedAttribute, value);
              button.setAttribute('title', value);
            }
          }

          const save = restores ? remember(revision) : null;
          const line = row.querySelector(':scope > .flex-1 > :first-child');
          let badge = row.querySelector<HTMLElement>('[' + badgeAttribute + ']');
          if (!save?.restored || !line) {
            badge?.remove();
            row.removeAttribute(restoredAttribute);
            continue;
          }
          const saves = savesOf(save.module);
          const source = Restores.sourceOf(save, saves, known);
          let label = Restores.describe(source, saves, formatDate);
          if (source.id && saves.some(other => other.id === source.id) && !rendered.has(source.id)) label += '. Open its month in the list to see the guide';
          if (!badge) {
            badge = document.createElement('span');
            badge.setAttribute('role', 'img');
          }
          // Unqork adds its own badges to this line as they change, so the badge is kept last.
          if (badge.parentElement !== line || badge.nextSibling) line.append(badge);
          if (badge.getAttribute(badgeAttribute) !== save.id) badge.setAttribute(badgeAttribute, save.id);
          if (badge.getAttribute('aria-label') !== label) {
            badge.setAttribute('aria-label', label);
            badge.setAttribute('title', label);
          }
          if (row.getAttribute(restoredAttribute) !== (source.id ?? '')) row.setAttribute(restoredAttribute, source.id ?? '');
          found.push({ id:save.id, row, source:source.id });
        }
        guides = found;
        // Pills are placed once the restored badges are in, which take room on the name line.
        if (named) for (const [row] of pills) resized.observe(row);
        else resized.disconnect();
        for (const [row, env] of pills) placePill(row, env);
        draw();
      }

      // Under Environment the pill goes after the name line's badges when the whole name, every badge and the
      // pill fit; otherwise after the author line, so the name, star and restored badge keep the first line.
      // The fit is measured from the name's full width and the pill's text, not from the current placement,
      // so it does not flip back and forth.
      const measure = document.createElement('canvas').getContext('2d');
      function placePill(row: Element, env: string | null) {
        const lines = [...row.querySelectorAll(':scope > .flex-1 > *')];
        const [first, second] = lines;
        let target: Element | null = null;
        if (env !== null && first) {
          target = first;
          if (second && measure) {
            const style = getComputedStyle(first);
            const gap = parseFloat(style.columnGap) || 0;
            measure.font = '500 12px ' + style.fontFamily;
            // 23px before the text, for the rocket, 8px after; at most 180px, as style.css draws it.
            const pill = Math.min(180, Math.ceil(measure.measureText(env).width) + 31);
            const kids = [...first.children];
            const needed = kids.reduce((sum, kid, index) => sum + (index === 0 ? kid.scrollWidth : kid.getBoundingClientRect().width), 0) + gap * kids.length + pill;
            if (needed > first.clientWidth) target = second;
          }
        }
        for (const line of lines) {
          const value = line === target ? env : null;
          if (line.getAttribute(envAttribute) === value) continue;
          if (value === null) line.removeAttribute(envAttribute);
          else line.setAttribute(envAttribute, value);
        }
      }
      // A narrower or wider History panel changes what fits.
      const resized = new ResizeObserver(() => schedule());

      // The rendered rows by save. A collapsed month renders none of its rows.
      function renderedRows() {
        const rows = new Map<string, Element>();
        for (const button of document.querySelectorAll(rowSelector)) {
          const id = revisionOf(button)?._id;
          if (id && button.getClientRects().length) rows.set(id, button.parentElement!);
        }
        return rows;
      }

      // The row's status dot, whose center a guide starts and ends at.
      const dotOf = (row: Element) => (row.querySelector(':scope > button + div > *') ?? row).getBoundingClientRect();

      // Guides are drawn in one fixed layer over the list's scroll area, clipped to it, so Unqork's markup gains
      // nothing but the badges. Each guide is a bracket in the gutter left of the rows, from the restored save's
      // dot down to its source's, with an arrowhead at the restored save.
      function draw() {
        const mode = document.documentElement.getAttribute(restoresAttribute);
        const shown = mode === 'always' ? guides : mode ? guides.filter(guide => guide.id === hovered) : [];
        const rendered = shown.length ? renderedRows() : null;
        const pairs = shown.flatMap(guide => {
          if (!guide.source || !guide.row.isConnected || !guide.row.getClientRects().length) return [];
          const source = rendered!.get(guide.source);
          return source ? [{ ...guide, sourceRow:source }] : [];
        });
        for (const row of document.querySelectorAll('[' + sourceAttribute + ']')) row.removeAttribute(sourceAttribute);
        if (!pairs.length) {
          overlay?.remove();
          overlay = null;
          return;
        }
        const area = pairs[0].row.closest('[data-slot="scroll-area-viewport"]')?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.setAttribute(guidesAttribute, '');
          overlay.setAttribute('aria-hidden', 'true');
        }
        if (overlay.parentElement !== document.body) document.body.append(overlay);
        Object.assign(overlay.style, { left:area.left + 'px', top:area.top + 'px', width:area.width + 'px', height:area.height + 'px' });
        const spans = pairs.map(pair => {
          const from = dotOf(pair.row);
          const to = dotOf(pair.sourceRow);
          const left = Math.min(pair.row.getBoundingClientRect().left, pair.sourceRow.getBoundingClientRect().left);
          return { pair, from, to, left, top:Math.min(from.top, to.top) + Math.min(from.height, to.height) / 2, bottom:Math.max(from.bottom, to.bottom) - Math.min(from.height, to.height) / 2 };
        });
        const lanes = Restores.lanes(spans.map(span => [span.top, span.bottom]));
        const lines = spans.map((span, index) => {
          const line = document.createElement('div');
          const x = span.left - 4 - lanes[index] * 3;
          const end = Math.min(span.from.left, span.to.left) - 2;
          Object.assign(line.style, {
            left:(x - area.left) + 'px',
            top:(span.top - area.top) + 'px',
            width:Math.max(4, end - x) + 'px',
            height:Math.max(2, span.bottom - span.top) + 'px'
          });
          if (span.pair.id === hovered) line.setAttribute('data-active', '');
          // The arrowhead marks the restored save, which may sit above or below its source.
          line.setAttribute('data-to', span.from.top <= span.to.top ? 'top' : 'bottom');
          return line;
        });
        overlay.replaceChildren(...lines);
        for (const pair of pairs) if (pair.id === hovered) pair.sourceRow.setAttribute(sourceAttribute, '');
      }

      // A badge's hover, as the pointer enters or leaves it.
      document.addEventListener('pointerover', event => {
        const id = (event.target as Element).closest?.('[' + badgeAttribute + ']')?.getAttribute(badgeAttribute) ?? null;
        if (id !== hovered) { hovered = id; scheduleDraw(); }
      }, true);
      document.addEventListener('pointerout', event => {
        if (!event.relatedTarget && hovered) { hovered = null; scheduleDraw(); }
      }, true);
      // Selecting a save loads its detail, which may name its source, after the list has rendered.
      document.addEventListener('click', event => {
        if (!document.documentElement.hasAttribute(restoresAttribute) || !(event.target as Element).closest?.('li > div.group')) return;
        for (const delay of [300, 1000, 3000]) setTimeout(schedule, delay);
      }, true);
      document.addEventListener('scroll', () => { if (overlay) scheduleDraw(); }, { capture:true, passive:true });
      addEventListener('resize', () => { if (overlay) scheduleDraw(); });

      // Only rows coming, going, being relabelled, as when the save-type filter reuses them, or being selected
      // need a pass. The badges and guides this script adds are left out.
      const ours = (node: Node) => node.nodeType === 1 && ((node as Element).hasAttribute(badgeAttribute) || (node as Element).hasAttribute(guidesAttribute) || node.parentElement?.hasAttribute(guidesAttribute) === true);
      const touchesRow = (node: Node) => node.nodeType === 1 && !ours(node) && ((node as Element).matches(rowSelector) || (node as Element).querySelector(rowSelector) !== null);
      const observer = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes'
          ? !['aria-label', 'aria-current'].includes(record.attributeName!) || touchesRow(record.target)
          : [...record.addedNodes].some(touchesRow) || [...record.removedNodes].some(touchesRow))) schedule();
      });
      const start = () => {
        observer.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['aria-label', 'aria-current'] });
        schedule();
      };
      // The history content script turns the badges on and off through the root attributes.
      observer.observe(document.documentElement, { attributes:true, attributeFilter:[rootAttribute, restoresAttribute] });
      if (document.body) start();
      else document.addEventListener('DOMContentLoaded', start, { once:true });
    });
  }
});
