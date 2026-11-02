import { cleanup, render, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import type { SseRequest } from '@/lib/sse-run';
import { apiNames, byId, click, press, query, settle, type ApiName, type as typeInto } from './harness';
import { entry, log } from './sse-fixture';

// The debugger window draws lanes with ResizeObserver and copies with the clipboard, neither in jsdom.
beforeEach(() => {
  // The window keeps its switches in its own storage; each test starts without them.
  localStorage.clear();
  (globalThis as Record<string, unknown>).ResizeObserver = class { observe() {} disconnect() {} };
  Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:vi.fn(async () => {}) } });
});

const context = {
  url:'https://acme-staging.unqork.io/ide/builder/workspaces/w/modules/646125c9ce236b1c9e80986d',
  moduleId:'646125c9ce236b1c9e80986d', title:'Application: Update (API)', host:'acme-staging.unqork.io',
  identity:{ mode:'designer', designerRole:'Viewer', expressRole:'' }
};
const success = (request: SseRequest) => ({
  ok:true, status:200, ms:317, headers:{ 'x-assume-role':'Administrator', 'x-service-log-id':'6ae7e4bcf8cab860cdbcca9a' },
  body:{ data:{ resolved:{ applicationId:'APP-1', status:'done' } }, metadata:{}, validationErrors:[], invalidNavigationPanels:[], eventLog:log },
  sent:{ url:'https://acme-staging.unqork.io/fbu/uapi/modules/' + request.moduleId + '/execute', method:'PUT', headers:{ 'Content-Type':'application/json', 'x-xsrf':'' }, body:{ moduleId:request.moduleId, data:request.data, verbose:true } }
});
const failure = () => ({
  ok:false, status:412, ms:1900, headers:{ 'x-assume-role':'Administrator' },
  body:{ executionError:{ component:'callService', message:'Request failed with status code 500', code:500 }, eventLog:log.slice(0, -1) }
});

interface State { kind?: string; blocked?: boolean; roles?: string[]; responses?: ((request: SseRequest) => object)[] }

// The browser's side, which the window uses directly: its builder tab, the unqork.io grant, saved
// environments, and the two functions it injects into the tab's MAIN world.
function setup(apiName: ApiName, state: State = {}) {
  const runs: { request: SseRequest }[] = [];
  const injections: { target: { tabId: number }; world?: string; func: { name: string }; args?: unknown[] }[] = [];
  const listeners = { updated:[] as ((id: number, change: object) => void)[], removed:[] as ((id: number) => void)[], stored:[] as ((changes: object, area: string) => void)[] };
  const page = () => state.kind === 'production' ? { ...context, url:context.url.replace('acme-staging', 'acme-prod'), host:'acme-prod.unqork.io' } : context;
  const api = {
    tabs:{
      get:async (id: number) => ({ id, url:page().url }),
      onUpdated:{ addListener:(fn: typeof listeners.updated[number]) => listeners.updated.push(fn), removeListener:() => {} },
      onRemoved:{ addListener:(fn: typeof listeners.removed[number]) => listeners.removed.push(fn), removeListener:() => {} }
    },
    permissions:{ contains:async () => true },
    storage:{
      local:{ get:async () => ({ environment:{ blockProduction:state.blocked === true } }) },
      onChanged:{ addListener:(fn: typeof listeners.stored[number]) => listeners.stored.push(fn), removeListener:() => {} }
    },
    scripting:{ executeScript:async (options: typeof injections[number]) => {
      injections.push(options);
      if (options.func.name === 'readSseContext') return [{ result:{ ...page(), ...(state.roles ? { roles:state.roles } : {}) } }];
      const request = options.args![0] as SseRequest;
      runs.push({ request });
      return [{ result:(state.responses?.shift() || success)(request) }];
    } }
  };
  const contexts = () => injections.filter(injection => injection.func.name === 'readSseContext').length;
  return { api, runs, injections, contexts, listeners };
}

async function renderDebugger(apiName: ApiName, api: object, query = 'tab=7') {
  vi.resetModules();
  history.replaceState(null, '', 'https://extension.test/sse.html?' + query);
  (globalThis as Record<string, unknown>)[apiName] = api;
  const { Debugger } = await import('@/popup/sse/Debugger');
  const result = render(<Debugger />);
  await settle();
  return result;
}

const runButton = () => byId<HTMLButtonElement>('run-module');
const mark = (key: string, kind: string) => query(`.lane[data-key="${key}"] [data-kind="${kind}"]`);
const tab = (name: string) => query(`[role="tab"][id="view-tab-${name}"]`);

test.each(apiNames)('runs the module and shows its steps, changes, output and raw response (%s)', async apiName => {
  const { api, runs, injections } = setup(apiName);
  await renderDebugger(apiName, api);
  expect(query('h1').textContent).toBe('Application: Update (API)');
  expect(document.title).toBe('Application: Update (API) · Unqlock debugger');
  expect(query('.env').textContent).toBe('STAGING');
  // Run as starts from Unqork's own choice.
  expect(query<HTMLSelectElement>('select[aria-label="Identity"]').value).toBe('designer');
  expect(query<HTMLInputElement>('input[aria-label="Role"]').value).toBe('Viewer');
  expect(query('.state').textContent).toMatch(/The input is empty, so it runs with no data/);

  typeInto('sse-input', '{"applicationId":"APP-1"}');
  expect(byId('sse-input-meta').textContent).toBe('Valid JSON1 field');
  click(runButton()); await settle();
  expect(runs).toHaveLength(1);
  expect(runs[0].request).toEqual({ url:context.url, moduleId:context.moduleId, data:{ applicationId:'APP-1' }, submissionId:undefined, validate:false, hydrate:false, save:false, mode:'designer', role:'Viewer' });
  // Both read and run the window's own tab, in its MAIN world.
  expect(injections.map(injection => [injection.target.tabId, injection.world, injection.func.name])).toEqual([[7, 'MAIN', 'readSseContext'], [7, 'MAIN', 'runSseExecute']]);

  // The outcome in one line, and no callout for a clean run.
  expect(query('.outcome').textContent).toBe('200Ran as Administrator · 317 ms · 3 steps · 5 values set');
  expect(document.querySelector('.callout')).toBeNull();
  expect(document.querySelectorAll('.lane')).toHaveLength(7);
  expect(document.querySelectorAll('.lanes-head [role="columnheader"]')).toHaveLength(4);
  expect(query('[data-kind="wait"]').textContent).toBe('4 ms');

  // Selecting a mark opens the inspector with how it got there; Escape closes it.
  click(mark('save', 'set'));
  const inspector = query('.inspector');
  expect(query('.inspector h2').textContent).toBe('save');
  expect(query('.inspector .lead').textContent).toBe('Set a value in step 3, caused by buildFlags.');
  expect([...inspector.querySelectorAll('.path li')].map(item => item.querySelector('.mono')?.textContent)).toEqual(['init', 'buildFlags', 'save']);
  expect(query('.lanes').hasAttribute('data-focused')).toBe(true);
  expect(mark('save', 'set').getAttribute('aria-pressed')).toBe('true');
  // The chain stays bright and the rest fades.
  expect([mark('init', 'queued'), mark('buildFlags', 'ran'), mark('env', 'set')].map(each => each.hasAttribute('data-related'))).toEqual([true, true, false]);
  // The path moves the selection.
  click(within(inspector).getByRole('button', { name:'init' }));
  expect(query('.inspector h2').textContent).toBe('init');
  press('Escape', document.body);
  expect(document.querySelector('.inspector')).toBeNull();

  // The filter applies to lanes, and follows to Changes.
  typeInto(query('input[type="search"]'), 'sa');
  expect([...document.querySelectorAll('.lane')].map(lane => lane.getAttribute('data-key'))).toEqual(['save']);
  typeInto(query('input[type="search"]'), '');

  click(tab('changes'));
  expect(tab('changes').textContent).toBe('Changes5');
  expect([...document.querySelectorAll('.changes h3')].map(head => head.textContent)).toEqual(['Step 1 3 values · 1 ms', 'Step 2 no changes', 'Step 3 2 values · 8 ms']);
  const row = [...document.querySelectorAll<HTMLButtonElement>('.change-row')].find(button => button.textContent?.startsWith('save'))!;
  expect(row.textContent).toBe('saveby buildFlagstrue');
  click(row);
  expect(row.getAttribute('aria-expanded')).toBe('true');
  click(within(row.parentElement!).getByRole('button', { name:'Show in steps' }));
  expect(tab('steps').getAttribute('aria-selected')).toBe('true');
  expect(query('.inspector h2').textContent).toBe('save');

  click(tab('output'));
  expect(query('[aria-label="Resolved data"]').textContent).toMatch(/applicationId: "APP-1"/);
  click(tab('raw'));
  expect(query('.raw .request-line').textContent).toBe('PUT https://acme-staging.unqork.io/fbu/uapi/modules/646125c9ce236b1c9e80986d/execute');
  expect(query('.raw').textContent).toMatch(/x-service-log-id6ae7e4bcf8cab860cdbcca9a/);
  click(within(query('.raw')).getByRole('button', { name:'Copy request as fetch' })); await settle();
  expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/^await \(await fetch\("https:\/\/acme-staging/);

  // Alt+1 goes back to Steps; the run is in the history.
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'1', altKey:true, bubbles:true }));
  await settle();
  expect(tab('steps').getAttribute('aria-selected')).toBe('true');
  expect(document.querySelectorAll('.runs li')).toHaveLength(1);
});

test.each(apiNames)('a failed run names the component that stopped it and selects its failure (%s)', async apiName => {
  const { api, runs } = setup(apiName, { responses:[failure, success] });
  await renderDebugger(apiName, api);
  click(runButton()); await settle();
  expect(query('.outcome').textContent).toBe('412Stopped at callService · ran as Administrator · 1.90 s · step 3 of 3');
  expect(query('.outcome').getAttribute('data-state')).toBe('fail');
  expect(query('.callout').textContent).toMatch(/^callService stopped the run in step 3\.Request failed with status code 500 · Code 500/);
  // The failure is selected, so its lane is in view with the error and the open wait that led to it.
  expect(query('.inspector h2').textContent).toBe('callService');
  expect(query('.inspector .error-text').textContent).toMatch(/Request failed with status code 500/);
  expect(query('[data-kind="wait"]').textContent).toBe('no finish');

  // A second run joins the history; the first can be shown again.
  click(runButton()); await settle();
  expect(runs).toHaveLength(2);
  const history = [...document.querySelectorAll<HTMLButtonElement>('.runs .run-entry')];
  expect(history.map(button => button.querySelector('[data-state]')?.textContent)).toEqual(['200', '412']);
  click(history[1]);
  expect(query('.outcome .status').textContent).toBe('412');
});

test('input that is not valid JSON names the line and runs nothing', async () => {
  const { api, runs } = setup('chrome');
  await renderDebugger('chrome', api);
  typeInto('sse-input', '{\n  "a": 1,\n}');
  expect(byId('sse-input').getAttribute('aria-invalid')).toBe('true');
  expect(byId('sse-input-meta').textContent).toBe('Unexpected "}" · line 3');
  click(runButton()); await settle();
  expect(runs).toHaveLength(0);
  expect(query('.notice').textContent).toBe('Fix the input first: Unexpected "}" (line 3).');
  expect(document.activeElement?.id).toBe('sse-input');
});

test.each(apiNames)('production asks before every run, and blocked production cannot run (%s)', async apiName => {
  const { api, runs } = setup(apiName, { kind:'production' });
  await renderDebugger(apiName, api);
  expect(query('.env').textContent).toBe('Production');
  click(runButton()); await settle();
  expect(runs).toHaveLength(0);
  expect(query('.confirm').textContent).toMatch(/runs Application: Update \(API\) on production \(acme-prod\.unqork\.io\)/);
  click(within(query('.confirm')).getByRole('button', { name:'Cancel' }));
  expect(document.querySelector('.confirm')).toBeNull();
  expect(document.activeElement).toBe(runButton());
  click(runButton()); await settle();
  click(within(query('.confirm')).getByRole('button', { name:'Run on production' })); await settle();
  expect(runs).toHaveLength(1);

  cleanup();
  const blocked = setup(apiName, { kind:'production', blocked:true });
  await renderDebugger(apiName, blocked.api);
  expect(runButton().disabled).toBe(true);
  expect(query('.state').textContent).toMatch(/Production actions are turned off/);
});

test('saving asks first and names the submission', async () => {
  const { api, runs } = setup('chrome');
  await renderDebugger('chrome', api);
  click('sse-save');
  expect(runButton().textContent).toMatch(/^Run and save/);
  click(runButton()); await settle();
  expect(query('.confirm').textContent).toBe('The result is saved to a new submission.Run and saveCancel');
  click(within(query('.confirm')).getByRole('button', { name:'Cancel' }));
  typeInto('sse-submission', 'abc123');
  // Ctrl+Enter runs, and confirms an open confirmation.
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', ctrlKey:true, bubbles:true })); await settle();
  expect(query('.confirm').textContent).toMatch(/saved to submission abc123, replacing its data/);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', ctrlKey:true, bubbles:true })); await settle();
  expect(runs[0].request).toMatchObject({ save:true, submissionId:'abc123' });
});

test.each(apiNames)('Rerun puts a past run’s input and options back and runs it again (%s)', async apiName => {
  const { api, runs } = setup(apiName);
  await renderDebugger(apiName, api);
  typeInto('sse-input', '{"a":1}');
  click(query('.options input[type="checkbox"]'));
  typeInto('sse-submission', 'sub-1');
  click(runButton()); await settle();
  typeInto('sse-input', '{"b":2}');
  click(query('.options input[type="checkbox"]'));
  typeInto('sse-submission', '');
  click(runButton()); await settle();
  expect(runs.map(each => each.request.data)).toEqual([{ a:1 }, { b:2 }]);
  // The older run is second in the history.
  click(document.querySelectorAll<HTMLButtonElement>('.runs .rerun')[1]); await settle();
  expect(runs).toHaveLength(3);
  expect(runs[2].request).toMatchObject({ data:{ a:1 }, submissionId:'sub-1', validate:true });
  expect(byId<HTMLTextAreaElement>('sse-input').value).toBe(JSON.stringify({ a:1 }, null, 2));
  expect(byId<HTMLInputElement>('sse-submission').value).toBe('sub-1');
});

test('Rerun of a run that saved asks first, and the confirmation stays up', async () => {
  const { api, runs } = setup('chrome');
  await renderDebugger('chrome', api);
  click('sse-save');
  click(runButton()); await settle();
  click(within(query('.confirm')).getByRole('button', { name:'Run and save' })); await settle();
  click('sse-save');
  click(query('.runs .rerun')); await settle();
  expect(runs).toHaveLength(1);
  expect(byId<HTMLInputElement>('sse-save').checked).toBe(true);
  expect(query('.confirm').textContent).toBe('The result is saved to a new submission.Run and saveCancel');
  click(within(query('.confirm')).getByRole('button', { name:'Run and save' })); await settle();
  expect(runs).toHaveLength(2);
});

test.each(apiNames)('In values finds components by the values they set, and setup lanes can be hidden (%s)', async apiName => {
  const { api } = setup(apiName);
  await renderDebugger(apiName, api);
  click(runButton()); await settle();
  const lanes = () => [...document.querySelectorAll('.lane')].map(lane => lane.getAttribute('data-key'));
  const button = (name: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('.viewbar .switch')].find(each => name.test(each.textContent || ''))!;
  // Keys alone: nothing is called "staging".
  typeInto(query('input[type="search"]'), 'staging');
  expect(document.querySelector('.lane')).toBeNull();
  click(button(/^In values/));
  expect(button(/^In values/).getAttribute('aria-pressed')).toBe('true');
  expect(query('input[type="search"]').getAttribute('placeholder')).toBe('Filter keys and values');
  expect(lanes()).toEqual(['env']);
  expect(mark('env', 'set').hasAttribute('data-found')).toBe(true);
  // It follows to Changes, and is remembered by the window.
  click(tab('changes'));
  expect([...document.querySelectorAll('.change-key')].map(key => key.textContent)).toEqual(['env']);
  expect(localStorage.getItem('unqlock.sse.values')).toBe('true');
  click(tab('steps'));
  typeInto(query('input[type="search"]'), '');

  // env and vars only received setup values.
  expect(button(/^Hide setup values/).textContent).toBe('Hide setup values 2');
  click(button(/^Hide setup values/));
  expect(lanes()).toEqual(['init', 'buildFlags', 'callService', 'validate', 'save']);
  click(query('.mode button:last-child'));
  expect([...document.querySelectorAll('.event-list .row-button')].map(each => each.textContent)).not.toContain('env');
  click(button(/^Hide setup values/));
  expect([...document.querySelectorAll('.event-list .row-button')].map(each => each.textContent)).toContain('env');
});

test('slow runs and waits carry a Slow badge, and the outcome links to the slowest', async () => {
  const slowLog = [
    entry(0, 'addTrigger', '__setup__', 'calc', 'calculator', 0),
    entry(1, 'executeComponent', '__setup__', 'calc', 'calculator', 0),
    entry(1, 'setData', 'calc', 'total', 'hidden', 250, { value:3 }),
    entry(1, 'executeComponentAsyncStart', 'calc', 'plug', 'plugin', 300),
    entry(2, 'executeComponentAsyncFinish', 'plug', 'plug', 'plugin', 3800)
  ];
  const { api } = setup('chrome', { responses:[request => ({ ...success(request), body:{ data:{}, eventLog:slowLog } })] });
  await renderDebugger('chrome', api);
  click(runButton()); await settle();
  expect([...document.querySelectorAll('.lanes .slow')].map(badge => badge.closest('.lane')!.getAttribute('data-key'))).toEqual(['calc', 'plug']);
  expect(mark('calc', 'ran').getAttribute('aria-label')).toBe('calc ran in step 2, slow: 300 ms');
  const link = within(query('.outcome')).getByRole('button', { name:'2 slow' });
  click(link);
  expect(query('.inspector h2').textContent).toBe('plug');
  expect(query('.inspector .lead + .lead').textContent).toBe('Slow Took 3.50 s. A wait usually needs under 3.00 s.');
  click(query('.mode button:last-child'));
  expect([...document.querySelectorAll('.event-list .slow')]).toHaveLength(2);
});

test('follows the builder tab and says when it closes', async () => {
  const { api, contexts, listeners } = setup('browser');
  await renderDebugger('browser', api);
  expect(contexts()).toBe(1);
  listeners.updated.forEach(fn => fn(7, { url:context.url + '/x' })); await settle();
  listeners.updated.forEach(fn => fn(8, { url:'https://other.test/' })); await settle();
  expect(contexts()).toBe(2);
  listeners.removed.forEach(fn => fn(7)); await settle();
  expect(query('.state[role="alert"]').textContent).toMatch(/builder tab this window belongs to was closed/);
  expect(runButton().disabled).toBe(true);
  click(within(query('.state')).getByRole('button', { name:'Reconnect' })); await settle();
  expect(contexts()).toBe(3);
});

test('a window opened without a tab says so', async () => {
  const { api, injections } = setup('chrome');
  await renderDebugger('chrome', api, '');
  expect(query('.state[role="alert"]').textContent).toMatch(/opened without a builder tab/);
  expect(injections).toHaveLength(0);
});

// Firefox offers no full screen of its own for popup windows, so the window has a button that asks for it.
test('Full screen asks the page to fill the screen, and leaves it again', async () => {
  let element: Element | null = null;
  Object.defineProperty(document, 'fullscreenEnabled', { configurable:true, value:true });
  Object.defineProperty(document, 'fullscreenElement', { configurable:true, get:() => element });
  document.documentElement.requestFullscreen = vi.fn(async () => { element = document.documentElement; document.dispatchEvent(new Event('fullscreenchange')); });
  document.exitFullscreen = vi.fn(async () => { element = null; document.dispatchEvent(new Event('fullscreenchange')); });
  try {
    const { api } = setup('browser');
    await renderDebugger('browser', api);
    const button = byId('sse-fullscreen');
    expect([button.textContent, button.getAttribute('aria-pressed')]).toEqual(['Full screen', 'false']);
    click(button); await settle();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect([button.textContent, button.getAttribute('aria-pressed')]).toEqual(['Exit full screen', 'true']);
    click(button); await settle();
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(button.textContent).toBe('Full screen');
  } finally {
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
    delete (document as { fullscreenElement?: Element }).fullscreenElement;
  }
});

// Run as offers the environment's roles, read from the builder tab with its context.
test.each(apiNames)('Run as picks a role from the environment’s roles, and falls back to typing one (%s)', async apiName => {
  const { api, runs } = setup(apiName, { roles:['Administrator', 'Underwriter'] });
  await renderDebugger(apiName, api);
  const role = () => query<HTMLSelectElement>('select[aria-label="Role"]');
  // Unqork's saved choice is kept at the top when the environment lacks it.
  expect([...role().options].map(option => option.value)).toEqual(['Viewer', 'Administrator', 'Underwriter']);
  expect(role().value).toBe('Viewer');
  typeInto(role(), 'Underwriter');
  click(runButton()); await settle();
  expect(runs[0].request).toMatchObject({ mode:'designer', role:'Underwriter' });
  // Express starts with the account's own role, which sends none.
  typeInto(query('select[aria-label="Identity"]'), 'express');
  expect([...role().options].map(option => option.textContent)).toEqual(['Account’s own role', 'Administrator', 'Underwriter']);
  expect(role().value).toBe('');
  click(runButton()); await settle();
  expect(runs[1].request).toMatchObject({ mode:'express', role:'' });
});

test('without a role list, Run as takes a typed role', async () => {
  const { api } = setup('chrome');
  await renderDebugger('chrome', api);
  const role = query<HTMLInputElement>('input[aria-label="Role"]');
  expect(role.title).toMatch(/Couldn’t load the environment’s roles/);
});

test('the module ID is shown in full, and copying it says so beside it', async () => {
  const { api } = setup('chrome');
  await renderDebugger('chrome', api);
  const id = query('.module-id');
  expect(id.textContent).toBe(context.moduleId);
  expect(query('.copied').textContent).toBe('');
  click(id); await settle();
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(context.moduleId);
  expect([id.textContent, query('.copied').textContent]).toEqual([context.moduleId, 'Copied']);
});

// A confirmation approves only what it showed: when the builder moves to a production module, it is withdrawn.
test('a held Ctrl+Enter does not approve the confirmation its first press opened', async () => {
  const { api, runs } = setup('chrome');
  await renderDebugger('chrome', api);
  click('sse-save');
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', ctrlKey:true, bubbles:true })); await settle();
  expect(query('.confirm').textContent).toMatch(/saved to a new submission/);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', ctrlKey:true, repeat:true, bubbles:true })); await settle();
  expect(runs).toHaveLength(0);
  expect(query('.confirm').textContent).toMatch(/saved to a new submission/);
});

test('a change in Environments applies at once, without a reload of the builder tab', async () => {
  const state: State = { kind:'production' };
  const { api, listeners } = setup('chrome', state);
  await renderDebugger('chrome', api);
  expect(runButton().disabled).toBe(false);
  state.blocked = true;
  listeners.stored.forEach(fn => fn({ environment:{ newValue:{} } }, 'local')); await settle();
  expect(runButton().disabled).toBe(true);
  expect(runButton().title).toMatch(/Production actions are turned off/);
});

test('roles are fetched once per host, and a moving tab keeps them', async () => {
  const { api, injections, listeners } = setup('chrome', { roles:['Administrator', 'Viewer'] });
  await renderDebugger('chrome', api);
  listeners.updated.forEach(fn => fn(7, { url:context.url })); await settle();
  const reads = injections.filter(injection => injection.func.name === 'readSseContext');
  expect(reads.map(injection => injection.args)).toEqual([[''], ['acme-staging.unqork.io']]);
  expect([...query<HTMLSelectElement>('select[aria-label="Role"]').options].map(option => option.value)).toEqual(['Administrator', 'Viewer']);
});

test('a pending confirmation is withdrawn when the builder tab moves', async () => {
  const state: State = {};
  const { api, runs, listeners } = setup('chrome', state);
  await renderDebugger('chrome', api);
  click('sse-save');
  click(runButton()); await settle();
  expect(query('.confirm').textContent).toMatch(/saved to a new submission/);
  state.kind = 'production';
  listeners.updated.forEach(fn => fn(7, { url:context.url })); await settle();
  expect(document.querySelector('.confirm')).toBeNull();
  // Ctrl+Enter now asks again, this time naming production, instead of running.
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', ctrlKey:true, bubbles:true })); await settle();
  expect(runs).toHaveLength(0);
  expect(query('.confirm').textContent).toMatch(/on production/);
});
