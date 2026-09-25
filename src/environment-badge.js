"use strict";
(() => {
  if (globalThis.unqlockBadgeInstalled) return;
  globalThis.unqlockBadgeInstalled = true;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const host = document.createElement('div');
  host.id = 'unqlock-environment';
  const shadow = host.attachShadow({ mode:'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;position:fixed;z-index:2147483647;max-width:calc(100vw - 32px)}
    :host([data-position="bottom-left"]){bottom:16px;left:16px}
    :host([data-position="bottom-right"]){bottom:16px;right:16px}
    :host([data-position="top-left"]){top:16px;left:16px}
    :host([data-position="top-right"]){top:16px;right:16px}
    iframe{position:absolute;width:354px;max-width:calc(100vw - 32px);height:min(600px,calc(100dvh - 92px));border:1px solid #94a3b8;border-radius:12px;background:#f8fafc;box-shadow:0 8px 32px #0004}
    :host([data-position^="bottom"]) iframe{bottom:calc(100% + 8px)}
    :host([data-position^="top"]) iframe{top:calc(100% + 8px)}
    :host([data-position$="left"]) iframe{left:0}
    :host([data-position$="right"]) iframe{right:0}
    button{display:flex;align-items:center;gap:8px;max-width:100%;min-height:44px;padding:7px;border:1px solid #94a3b8;border-radius:10px;background:#172033;color:#fff;box-shadow:0 2px 8px #0003;cursor:pointer;font:600 12px/1.4 system-ui;letter-spacing:.06em}
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
  icon.src = api.runtime.getURL('icons/icon-32.png');
  icon.alt = '';
  const badge = document.createElement('span');
  const feedback = document.createElement('p');
  feedback.setAttribute('role', 'status');
  feedback.hidden = true;
  button.append(icon, badge);
  shadow.append(style, button, feedback);
  let environmentValue;
  let floatingValue;
  let frame;
  function closeMenu(restoreFocus = true) {
    frame?.remove();
    frame = undefined;
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }
  function render() {
    try {
      const config = UnqlockEnvironment.settings(environmentValue);
      const floating = UnqlockEnvironment.floatingSettings(floatingValue);
      if (!location.hostname.endsWith('.unqork.io') && !config.groups.some(group => group.domains.some(domain => domain.hostname === location.hostname))) { closeMenu(false); host.remove(); return; }
      const environment = UnqlockEnvironment.detect(location.href, config);
      host.dataset.position = floating.position;
      badge.textContent = (environment.kind === 'production' ? '● ' : '') + environment.label;
      badge.hidden = !config.badge;
      button.dataset.kind = config.badge ? environment.kind : '';
      button.title = 'Open Unqlock' + (config.badge ? ' · ' + environment.label + '\n' + environment.host + '\n' + environment.source : '');
      if (floating.enabled) { if (!host.isConnected) document.documentElement.append(host); }
      else { closeMenu(false); host.remove(); }
    } catch { host.remove(); }
  }
  let opening = false;
  button.addEventListener('click', async event => {
    if (!event.isTrusted || opening) return;
    if (frame) { closeMenu(); return; }
    // Tab URLs stay unreadable without host access, so the page reports its own address first.
    opening = true;
    try {
      const result = await api.runtime.sendMessage({ type:'floating.open' });
      if (!result?.ok) throw new Error(result?.error || 'Could not open Unqlock.');
      feedback.hidden = true;
    } catch (error) {
      feedback.textContent = error.message || 'Could not open Unqlock. Try the browser toolbar.';
      feedback.hidden = false;
      return;
    } finally { opening = false; }
    if (frame) return;
    frame = document.createElement('iframe');
    frame.src = api.runtime.getURL('popup.html') + '?input=' + (event.detail === 0 ? 'keyboard' : 'pointer');
    frame.title = 'Unqlock menu';
    frame.setAttribute('role', 'dialog');
    shadow.append(frame);
    button.setAttribute('aria-expanded', 'true');
  });
  api.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'debug.accessChanged') {
      frame?.contentWindow?.postMessage({ type:'unqlock.debugAccessChanged' }, new URL(api.runtime.getURL('popup.html')).origin);
      respond({ ok:true });
      return;
    }
    if (message?.type !== 'floating.source') return;
    respond({ ok:true, url:location.href });
  });
  window.addEventListener('message', event => {
    if (frame && event.source === frame.contentWindow && event.origin === new URL(api.runtime.getURL('popup.html')).origin && event.data?.type === 'unqlock.close') closeMenu();
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
})();
