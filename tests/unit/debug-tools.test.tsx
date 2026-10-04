import { expect, test } from 'vitest';
import { byId, click, press, query, renderPopup, settle, type, type ApiName } from './harness';

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
    expect(byId('quick-status').textContent).toMatch(/Approve site access/);
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
