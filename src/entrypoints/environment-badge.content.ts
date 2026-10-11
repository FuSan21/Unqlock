import { defineContentScript } from 'wxt/utils/define-content-script';
import { api, type Stored } from '@/lib/api';
import * as Environment from '@/lib/environment';

export default defineContentScript({
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_idle',
  // Don't broadcast WXT's start-up message to the page's own message listeners.
  noScriptStartedPostMessage: true,
  main() {
    // Installation can inject this script again into a page that already has it.
    const scope = globalThis as typeof globalThis & { unqlockBadgeInstalled?: boolean };
    if (scope.unqlockBadgeInstalled) return;
    scope.unqlockBadgeInstalled = true;
    const host = document.createElement('div');
    host.id = 'unqlock-environment';
    const shadow = host.attachShadow({ mode:'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host{all:initial;position:fixed;z-index:2147483647;max-width:calc(100vw - 32px)}
      :host([data-corner="bottom-left"]){bottom:16px;left:16px}
      :host([data-corner="bottom-right"]){bottom:16px;right:16px}
      :host([data-corner="top-left"]){top:16px;left:16px}
      :host([data-corner="top-right"]){top:16px;right:16px}
      iframe{position:absolute;box-sizing:border-box;border:1px solid #94a3b8;border-radius:12px;background:#f8fafc;box-shadow:0 8px 32px #0004}
      button{display:flex;align-items:center;gap:8px;max-width:100%;min-height:44px;padding:7px;border:1px solid #94a3b8;border-radius:10px;background:#172033;color:#fff;box-shadow:0 2px 8px #0003;cursor:pointer;font:600 12px/1.4 system-ui;letter-spacing:.06em}
      :host([data-draggable]) button{cursor:grab;touch-action:none}:host([data-dragging]) button{cursor:grabbing}
      button:hover{filter:brightness(1.15)}button:focus-visible{outline:3px solid #8b5cf6;outline-offset:3px}
      img{width:28px;height:28px;display:block}span{padding-right:5px}
      button[data-kind="production"]{background:#991b1b;border-color:#fca5a5}
      button[data-kind="staging"]{background:#115e59}button[data-kind="qa"]{background:#1e40af}
      button[data-kind="uat"]{background:#5b21b6}button[data-kind="preprod"]{background:#854d0e}
      [hidden]{display:none!important}p{max-width:260px;margin:6px 0 0;padding:8px;border-radius:6px;background:#172033;color:#fff;font:12px/1.4 system-ui}
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Open Unqlock menu');
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    const icon = document.createElement('img');
    icon.src = api.runtime.getURL('/icons/icon-32.png');
    icon.alt = '';
    const badge = document.createElement('span');
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    button.append(icon, badge);
    shadow.append(style, button, feedback);
    let environmentValue: Stored;
    let floatingValue: Stored;
    let floating = Environment.floatingSettings();
    let frame: HTMLIFrameElement | undefined;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

    // A dragged spot is anchored to the nearer edges of the quarter it was dropped in, so it holds when
    // the window resizes. It lives in the page's session storage: reloads and module changes in this tab
    // keep it, a new tab starts from the corner, and it is dropped when the corner changes.
    interface Spot { corner: Environment.Corner; x: 'left' | 'right'; y: 'top' | 'bottom'; dx: number; dy: number }
    const spotKey = 'unqlock.launcherSpot';
    function readSpot(): Spot | null {
      try {
        const spot = JSON.parse(sessionStorage.getItem(spotKey) || 'null');
        if (spot?.corner === floating.corner && ['left', 'right'].includes(spot.x) && ['top', 'bottom'].includes(spot.y) && Number.isFinite(spot.dx) && Number.isFinite(spot.dy)) return spot;
        sessionStorage.removeItem(spotKey);
      } catch { /* Without session storage the launcher stays in its corner. */ }
      return null;
    }
    function writeSpot(spot: Spot | null) {
      try { if (spot) sessionStorage.setItem(spotKey, JSON.stringify(spot)); else sessionStorage.removeItem(spotKey); }
      catch { /* The spot then lasts until the page reloads. */ }
    }

    // Puts the launcher in its corner, or its dragged spot kept on screen, then the open menu beside it.
    function place(spot = floating.mode === 'draggable' ? readSpot() : null) {
      host.dataset.corner = floating.corner;
      host.toggleAttribute('data-draggable', floating.mode === 'draggable');
      for (const side of ['top', 'right', 'bottom', 'left']) host.style.removeProperty(side);
      if (spot) {
        const { width, height } = host.getBoundingClientRect();
        host.style.setProperty(spot.x, clamp(spot.dx, 8, innerWidth - width - 8) + 'px');
        host.style.setProperty(spot.y, clamp(spot.dy, 8, innerHeight - height - 8) + 'px');
        host.style.setProperty(spot.x === 'left' ? 'right' : 'left', 'auto');
        host.style.setProperty(spot.y === 'top' ? 'bottom' : 'top', 'auto');
      }
      placeMenu();
    }

    // The menu opens on the side with more room, as tall as fits up to 600px, starting at the launcher's
    // nearer edge and shifted to stay on screen.
    function placeMenu() {
      if (!frame) return;
      const box = host.getBoundingClientRect();
      const gap = 8, edge = 16;
      const above = box.top - gap - edge, below = innerHeight - box.bottom - gap - edge;
      const up = above > below;
      const width = Math.min(354, innerWidth - 2 * edge);
      const start = box.left + box.width / 2 < innerWidth / 2 ? 0 : box.width - width;
      Object.assign(frame.style, {
        width:width + 'px',
        height:Math.max(0, Math.min(600, up ? above : below)) + 'px',
        left:clamp(start, edge - box.left, innerWidth - edge - width - box.left) + 'px',
        top:up ? 'auto' : box.height + gap + 'px',
        bottom:up ? box.height + gap + 'px' : 'auto'
      });
    }
    function closeMenu(restoreFocus = true) {
      frame?.remove();
      frame = undefined;
      button.setAttribute('aria-expanded', 'false');
      if (restoreFocus) button.focus();
    }
    function render() {
      try {
        const config = Environment.settings(environmentValue);
        floating = Environment.floatingSettings(floatingValue);
        if (floating.mode === 'fixed') writeSpot(null);
        if (!location.hostname.endsWith('.unqork.io') && !config.groups.some(group => group.domains.some(domain => domain.hostname === location.hostname))) { closeMenu(false); host.remove(); return; }
        const environment = Environment.detect(location.href, config);
        badge.textContent = (environment.kind === 'production' ? '● ' : '') + environment.label;
        badge.hidden = !config.badge;
        button.dataset.kind = config.badge ? environment.kind : '';
        button.title = 'Open Unqlock' + (config.badge ? ' · ' + environment.label + '\n' + environment.host + '\n' + environment.source : '');
        if (floating.enabled) {
          if (!host.isConnected) document.documentElement.append(host);
          place();
        }
        else { closeMenu(false); host.remove(); }
      } catch { host.remove(); }
    }
    // With dragging allowed, a press that moves a few pixels drags the launcher instead of opening it.
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    let dropped = false;
    button.addEventListener('pointerdown', event => {
      if (floating.mode !== 'draggable' || event.button !== 0 || !event.isPrimary) return;
      const box = host.getBoundingClientRect();
      drag = { id:event.pointerId, x:event.clientX, y:event.clientY, left:box.left, top:box.top, moved:false };
      // A quick drag leaves the button before it counts as one; capture keeps its moves here.
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        host.setAttribute('data-dragging', '');
      }
      const { width, height } = host.getBoundingClientRect();
      Object.assign(host.style, {
        left:clamp(drag.left + dx, 8, innerWidth - width - 8) + 'px', top:clamp(drag.top + dy, 8, innerHeight - height - 8) + 'px', right:'auto', bottom:'auto'
      });
      placeMenu();
    });
    function drop(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (!moved) return;
      host.removeAttribute('data-dragging');
      // The click that ends a drag does not open the menu; a cancelled drag has no click to skip.
      dropped = event.type === 'pointerup';
      setTimeout(() => { dropped = false; });
      const box = host.getBoundingClientRect();
      const x = box.left + box.width / 2 < innerWidth / 2 ? 'left' : 'right';
      const y = box.top + box.height / 2 < innerHeight / 2 ? 'top' : 'bottom';
      const spot: Spot = { corner:floating.corner, x, y, dx:x === 'left' ? box.left : innerWidth - box.right, dy:y === 'top' ? box.top : innerHeight - box.bottom };
      writeSpot(spot);
      place(spot);
    }
    button.addEventListener('pointerup', drop);
    button.addEventListener('pointercancel', drop);
    window.addEventListener('resize', () => { if (host.isConnected) place(); });

    let opening = false;
    button.addEventListener('click', async event => {
      if (dropped) { dropped = false; return; }
      if (!event.isTrusted || opening) return;
      if (frame) { closeMenu(); return; }
      // Tab URLs stay unreadable without host access, so the page reports its own address first.
      opening = true;
      try {
        const result = await api.runtime.sendMessage({ type:'floating.open' });
        if (!result?.ok) throw new Error(result?.error || 'Could not open Unqlock.');
        feedback.hidden = true;
      } catch (error) {
        feedback.textContent = (error as Error).message || 'Could not open Unqlock. Try the browser toolbar.';
        feedback.hidden = false;
        return;
      } finally { opening = false; }
      if (frame) return;
      frame = document.createElement('iframe');
      frame.src = api.runtime.getURL('/popup.html') + '?input=' + (event.detail === 0 ? 'keyboard' : 'pointer');
      frame.title = 'Unqlock menu';
      // Copy JSON under Import & export writes to the clipboard from inside this frame.
      frame.allow = 'clipboard-write';
      frame.setAttribute('role', 'dialog');
      shadow.append(frame);
      placeMenu();
      button.setAttribute('aria-expanded', 'true');
    });
    api.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message?.type === 'access.changed') {
        frame?.contentWindow?.postMessage({ type:'unqlock.accessChanged', kind:message.kind }, new URL(api.runtime.getURL('/popup.html')).origin);
        respond({ ok:true });
        return;
      }
      if (message?.type !== 'floating.source') return;
      respond({ ok:true, url:location.href });
    });
    window.addEventListener('message', event => {
      if (frame && event.source === frame.contentWindow && event.origin === new URL(api.runtime.getURL('/popup.html')).origin && event.data?.type === 'unqlock.close') closeMenu();
    });
    document.addEventListener('pointerdown', event => {
      if (frame && !event.composedPath().includes(host)) closeMenu(false);
    }, true);
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape' && frame) { event.preventDefault(); closeMenu(); }
    });
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.environment) environmentValue = changes.environment.newValue;
      if (changes.floating) floatingValue = changes.floating.newValue;
      if (changes.environment || changes.floating) render();
    });
    api.storage.local.get(['environment', 'floating']).then(result => {
      environmentValue = result.environment;
      floatingValue = result.floating;
      render();
    }).catch(() => {});
    api.runtime.sendMessage({ type:'environment.observe' }).catch(() => {});
  }
});
