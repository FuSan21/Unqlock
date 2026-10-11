import { expect, test, vi } from 'vitest';
import { apiNames, byId, click, press, query, renderPopup, settle, type, type ApiName } from './harness';

// Toolbar popups run actions directly; detached windows and the floating menu go through the
// background and need site access first.
const cases: [ApiName, boolean, boolean][] = [['chrome', false, false], ['chrome', true, false], ['browser', false, false], ['browser', true, false], ['browser', false, true]];

test.each(cases)('home logging, site access, confirmation and tabs (%s, detached %s, embedded %s)', async (apiName, detached, embedded) => {
  let calls = 0;
  const api: Record<string, unknown> & { permissions?: { request: (options: { origins: string[] }) => Promise<boolean> } } = {
    storage:{ local:{ get:async () => ({}), set:async () => {} } },
    tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async (message: { type: string; request?: { url: string } }) => {
      if (message.type === 'debug.execute') {
        calls++;
        expect(message.request!.url).toBe('https://example.test/app');
        return { ok:true, result:{ ok:true, message:'Done' } };
      }
      if (message.type === 'debug.access') return { ok:true, granted:false };
      if (message.type === 'debug.permission') return { ok:true, granted:false };
      if (message.type === 'environment.read') return { ok:true, config:{}, missingOrigins:[] };
      expect(message.type).toBe('floating.target');
      return { ok:true, tab:{ id:7, url:'https://example.test/app' } };
    } },
    scripting:{ executeScript:async (injection: { world: string; target: { tabId: number }; args: { url: string }[] }) => {
      calls++;
      expect(injection.world).toBe('MAIN');
      expect(injection.target.tabId).toBe(7);
      expect(injection.args[0].url).toBe('https://example.test/app');
      return [{ result:{ ok:true, message:'Done' } }];
    } }
  };
  await renderPopup(apiName, api, { url:'https://extension.test/popup.html' + (detached ? '?targetTab=7' : ''), embedded });
  expect(byId('environment-summary').textContent).toMatch(/UNKNOWN · example\.test/);
  if (embedded) expect(byId('floating-close').hidden).toBe(false);

  // Home logs directly with access, and otherwise hands over to Debug tools.
  const homeLog = byId('home-log');
  click(homeLog); await settle();
  if (detached || embedded) {
    expect(byId('quick-page').hidden).toBe(false);
    expect(byId('home').hidden).toBe(true);
    expect(document.activeElement?.id).toBe('quick-title');
    expect(calls).toBe(0);
    press('Escape');
    expect(byId('home').hidden).toBe(false);
    expect(document.activeElement).toBe(homeLog);
  } else {
    expect(calls).toBe(1);
    expect(byId('home-log-status').textContent).toBe('Done');
    expect(byId('quick-page').hidden).toBe(true);
    calls = 0;
  }

  click(query('[aria-controls="quick-page"]')); await settle();
  if (detached || embedded) {
    const access = byId<HTMLButtonElement>('quick-access');
    const controls = byId<HTMLFieldSetElement>('quick-controls');
    expect(access.hidden).toBe(false);
    expect(controls.disabled).toBe(true);
    click(access); await settle();
    expect(byId('quick-status').textContent).toMatch(/Allow site access in the Unqlock window/);
    expect(access.disabled).toBe(false);
    api.permissions = { request:() => { throw new Error('Request failed'); } };
    click(access); await settle();
    expect(byId('quick-status').textContent).toMatch(/Request failed/);
    expect(access.disabled).toBe(false);
    api.permissions.request = async () => false;
    click(access); await settle();
    expect(controls.disabled).toBe(true);
    api.permissions.request = async ({ origins }) => {
      expect(origins[0]).toBe('https://example.test/*');
      return true;
    };
    click(access); await settle();
    expect(controls.disabled).toBe(false);
    expect(access.hidden).toBe(true);
  }

  // Data changes ask first; editing a value withdraws the question.
  expect(byId('panel-inspect').hidden).toBe(false);
  click('tab-data');
  type('property-key', 'test');
  const button = query('[data-quick-action="set"]');
  click(button); await settle();
  expect(calls).toBe(0);
  expect(byId('debug-confirmation').hidden).toBe(false);
  click('cancel-action');
  expect(byId('debug-confirmation').hidden).toBe(true);
  click(button);
  type('property-value', '1');
  expect(byId('debug-confirmation').hidden).toBe(true);
  click(button);
  click('confirm-action'); await settle();
  expect(calls).toBe(1);
  expect(byId('debug-confirmation').hidden).toBe(true);
  expect(query('#panel-data .debug-feedback').textContent).toBe('Done');

  // Arrow keys move between tabs; Escape dismisses a pending confirmation before leaving.
  press('ArrowRight', byId('tab-data'));
  expect(byId('panel-execute').hidden).toBe(false);
  expect(document.activeElement?.id).toBe('tab-execute');
  type('component-key', 'run');
  click(query('[data-quick-action="trigger"]'));
  press('Escape');
  expect(byId('debug-confirmation').hidden).toBe(true);
  expect(byId('quick-page').hidden).toBe(false);
  click(query('#quick-page .page-back'));
  expect(byId('quick-page').hidden).toBe(true);
  expect(document.activeElement?.id).toBe('open-quick');
  // On the home menu of the floating launcher, Escape closes the menu.
  if (embedded) {
    press('Escape');
    expect(window.parent.postMessage).toHaveBeenCalledWith({ type:'unqlock.close' }, 'https://example.test');
  }
});

// The background's side of Detach dev overlay, which owns the option and its access: a floating menu
// frame in Firefox has no permissions API.
function overlayBackground(state: { stored: Record<string, unknown>; granted: boolean; removed: number }) {
  return (message: { type: string; on?: boolean }) => {
    if (message.type === 'devOverlay.set') {
      if (message.on && !state.granted) return { ok:true, on:false, needsAccess:true };
      state.stored.devOverlayDetach = message.on;
      if (!message.on) { state.granted = false; state.removed++; }
    }
    return { ok:true, on:state.stored.devOverlayDetach === true && state.granted };
  };
}

test.each(apiNames)('Detach dev overlay asks for unqork.io access before saving, and gives it back when off (%s)', async apiName => {
  const state = { stored:{} as Record<string, unknown>, granted:false, removed:0 };
  const requests: string[][] = [];
  const background = overlayBackground(state);
  const api = {
    storage:{ local:{ get:async () => ({}), set:async () => {} } },
    tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
    permissions:{ request:async ({ origins }: { origins: string[] }) => { requests.push(origins); return state.granted; } },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async (message: { type: string; on?: boolean }) =>
      message.type.startsWith('devOverlay.') ? background(message) : { ok:true, config:{}, missingOrigins:[] } },
    scripting:{ executeScript:async () => [{ result:true }] }
  };
  await renderPopup(apiName, api);
  click(query('[aria-controls="quick-page"]')); await settle();
  const option = query<HTMLInputElement>('input[name="dev-overlay-detach"]');
  expect(option.checked).toBe(false);
  expect(option.closest('fieldset')).toBeNull();

  // Declining the prompt saves nothing and leaves the switch off.
  click(option); await settle();
  expect(requests).toEqual([['https://*.unqork.io/*']]);
  expect(state.stored.devOverlayDetach).toBeUndefined();
  expect(option.checked).toBe(false);
  expect(byId('dev-overlay-status').textContent).toMatch(/not granted/);

  state.granted = true;
  click(option); await settle();
  expect(state.stored.devOverlayDetach).toBe(true);
  expect(option.checked).toBe(true);

  click(option); await settle();
  expect(state.stored.devOverlayDetach).toBe(false);
  expect(option.checked).toBe(false);
  expect(state.removed).toBe(1);
});

test('Detach dev overlay shows off when its access was revoked', async () => {
  const background = overlayBackground({ stored:{ devOverlayDetach:true }, granted:false, removed:0 });
  const api = {
    storage:{ local:{ get:async () => ({}), set:async () => {} } },
    tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async (message: { type: string; on?: boolean }) =>
      message.type.startsWith('devOverlay.') ? background(message) : { ok:true, config:{}, missingOrigins:[] } },
    scripting:{ executeScript:async () => [{ result:true }] }
  };
  await renderPopup('chrome', api);
  click(query('[aria-controls="quick-page"]')); await settle();
  expect(query<HTMLInputElement>('input[name="dev-overlay-detach"]').checked).toBe(false);
});

// The floating menu in Firefox: no permissions API in its frame, and storage reports a change even when a
// saved value stays the same.
test('in Firefox, the floating menu turns Detach dev overlay on in the prompt window, and off again', async () => {
  const listeners: ((changes: object, area: string) => void)[] = [];
  const state = { stored:{} as Record<string, unknown>, granted:false, removed:0 };
  const background = overlayBackground(state);
  const messages: { type: string; kind?: string; on?: boolean }[] = [];
  const changed = async () => { for (const listener of listeners) listener({ devOverlayDetach:{ newValue:state.stored.devOverlayDetach } }, 'local'); await settle(); };
  const api = {
    storage:{ local:{ get:async () => ({}), set:async () => {} }, onChanged:{ addListener:(fn: typeof listeners[number]) => { listeners.push(fn); }, removeListener:() => {} } },
    tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
    runtime:{ getBrowserInfo:async () => ({ name:'Firefox' }), getManifest:() => ({ version:'1.0.0' }), sendMessage:async (message: { type: string; kind?: string; on?: boolean }) => {
      messages.push(message);
      if (message.type.startsWith('devOverlay.')) return background(message);
      if (message.type === 'prompt.open') return { ok:true, granted:state.granted };
      if (message.type === 'floating.target') return { ok:true, tab:{ id:7, url:'https://example.test/app' } };
      if (message.type === 'debug.access') return { ok:true, granted:false };
      return { ok:true, config:{}, missingOrigins:[] };
    } },
    scripting:{ executeScript:async () => [{ result:true }] }
  };
  await renderPopup('browser', api, { embedded:true });
  click(query('[aria-controls="quick-page"]')); await settle();
  const option = query<HTMLInputElement>('input[name="dev-overlay-detach"]');
  click(option); await settle();
  expect(messages.filter(message => message.type === 'prompt.open')).toEqual([{ type:'prompt.open', kind:'devOverlay' }]);
  expect(option.checked).toBe(false);
  expect(byId('dev-overlay-status').textContent).toMatch(/Unqlock window/);

  // The window grants access and saves the option; the menu follows.
  state.granted = true;
  state.stored.devOverlayDetach = true;
  await changed();
  expect(option.checked).toBe(true);
  expect(byId('dev-overlay-status').textContent).toMatch(/^On\./);
  // A repeated change event for the same value keeps it on.
  await changed();
  expect(option.checked).toBe(true);

  // Off works from the menu too, giving the access back through the background.
  click(option); await settle();
  expect(option.checked).toBe(false);
  expect(state.stored.devOverlayDetach).toBe(false);
  expect(state.removed).toBe(1);
  await changed();
  expect(option.checked).toBe(false);

  // On again with access already held needs no window.
  state.granted = true;
  click(option); await settle();
  expect(messages.filter(message => message.type === 'prompt.open')).toHaveLength(2);
  expect(option.checked).toBe(true);
});
