import { afterEach, expect, test, vi } from 'vitest';
import { runSseExecute, stopSseExecute, type InputShape, type SseRequest } from '@/lib/sse-run';
import { apiNames, type ApiName } from './harness';

// The debugger window reads and runs its builder tab itself (src/popup/sse/tab.ts), with the checks the
// background used to make: the tab exists and is still on Unqork, the unqork.io grant is held, the request
// is well formed, and production runs follow Environments.
afterEach(() => { vi.resetModules(); });

const builder = 'https://acme-staging.unqork.io/ide/builder/workspaces/w/modules/646125c9ce236b1c9e80986d';
const production = builder.replace('acme-staging', 'acme-prod');
const request: SseRequest = { url:builder, moduleId:'646125c9ce236b1c9e80986d', data:{ a:1 }, shape:'data', mode:'designer', role:'Administrator' };

interface State { url?: string; closed?: boolean; granted?: boolean; blocked?: boolean; context?: object; fails?: boolean }

async function load(apiName: ApiName, state: State = {}) {
  const injected: { tabId: number; world?: string; name: string; args?: unknown[] }[] = [];
  (globalThis as Record<string, unknown>)[apiName] = {
    tabs:{ get:async (id: number) => { if (state.closed) throw new Error('No tab with id: ' + id); return { id, url:'url' in state ? state.url : builder }; } },
    permissions:{ contains:async () => state.granted !== false },
    storage:{ local:{ get:async () => ({ environment:{ blockProduction:state.blocked === true } }) } },
    scripting:{ executeScript:async (options: { target: { tabId: number }; world?: string; func: { name: string }; args?: unknown[] }) => {
      injected.push({ tabId:options.target.tabId, world:options.world, name:options.func.name, args:options.args });
      if (state.fails) throw new Error('Frame with ID 0 was removed.');
      if (options.func.name === 'readSseContext') return [{ result:state.context ?? { url:builder, moduleId:request.moduleId, title:'Module', host:'acme-staging.unqork.io', identity:{ mode:'designer', designerRole:'Administrator', expressRole:'' } } }];
      return [{ result:{ ok:true, status:200, ms:5, headers:{}, body:{} } }];
    } }
  };
  const tab = await import('@/popup/sse/tab');
  return { tab, injected };
}

test.each(apiNames)('reads the context and runs the module in the tab’s MAIN world (%s)', async apiName => {
  const { tab, injected } = await load(apiName);
  const read = await tab.readContext(7);
  expect(read).toMatchObject({ ok:true, environment:{ kind:'staging', label:'STAGING', blocked:false } });
  expect(await tab.run(7, request, false, 'run-1')).toMatchObject({ ok:true, response:{ status:200 } });
  // Stop reaches the same tab's MAIN world with the run's ID.
  expect(await tab.stop(7, 'run-1')).toBe(false);
  expect(injected).toEqual([
    { tabId:7, world:'MAIN', name:'readSseContext', args:[''] },
    { tabId:7, world:'MAIN', name:'runSseExecute', args:[request, 'run-1'] },
    { tabId:7, world:'MAIN', name:'stopSseExecute', args:['run-1'] }
  ]);
});

test('Stop ends the wait for a run in flight, and says Unqork may still finish it', async () => {
  // A fetch that waits until it is aborted, as a long run does.
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason))));
  try {
    const running = runSseExecute({ ...request, url:location.href, save:true }, 'run-2');
    expect(stopSseExecute('run-2')).toBe(true);
    const response = await running;
    expect(response).toMatchObject({ ok:false, error:'You stopped waiting for this run. Unqork may still finish it on the server and save its result.' });
  } finally { vi.unstubAllGlobals(); }
});

test('Stop that arrives while the run is still being checked stops it as it starts', async () => {
  const fetched = vi.fn();
  vi.stubGlobal('fetch', fetched);
  try {
    expect(stopSseExecute('run-3')).toBe(true);
    const response = await runSseExecute({ ...request, url:location.href }, 'run-3');
    expect(response).toMatchObject({ ok:false, error:'You stopped waiting for this run. Unqork may still finish it on the server.' });
    expect(fetched).not.toHaveBeenCalled();
    expect(stopSseExecute('')).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});

test.each(apiNames)('refuses a tab that has left Unqork, closed, or lost its access, before injecting anything (%s)', async apiName => {
  for (const [state, message] of [
    [{ url:'https://custom.test/ide/builder/workspaces/w/modules/646125c9ce236b1c9e80986d' }, /no longer on Unqork/],
    [{ url:undefined }, /no longer on Unqork/],
    [{ url:'http://acme-staging.unqork.io/ide/' }, /no longer on Unqork/],
    [{ closed:true }, /was closed/],
    [{ granted:false }, /no longer has access/]
  ] as [State, RegExp][]) {
    vi.resetModules();
    const { tab, injected } = await load(apiName, state);
    expect((await tab.readContext(7) as { error: string }).error).toMatch(message);
    expect((await tab.run(7, request, false) as { error: string }).error).toMatch(message);
    expect(injected).toEqual([]);
  }
});

test('refuses a malformed request, and production runs follow Environments', async () => {
  const { tab, injected } = await load('chrome');
  for (const invalid of [{ ...request, mode:'root' }, { ...request, shape:'_request' }, { ...request, url:'https://evil.test/ide/' }, { ...request, data:[1] }, { ...request, metadata:[1] }, { ...request, metadata:null }, { ...request, role:'x'.repeat(201) }, { ...request, url:'not a url' }]) {
    expect(await tab.run(7, invalid as SseRequest, false)).toEqual({ ok:false, error:'That run request is not valid.' });
  }
  const onProduction = { ...request, url:production };
  expect(await tab.run(7, onProduction, false)).toEqual({ ok:false, error:'Confirm the production run again.' });
  expect(injected).toEqual([]);
  expect(await tab.run(7, onProduction, true)).toMatchObject({ ok:true });
  vi.resetModules();
  const blocked = await load('chrome', { blocked:true });
  expect(await blocked.tab.run(7, onProduction, true)).toEqual({ ok:false, error:'Production actions are turned off in Environments.' });
  expect((await blocked.tab.readContext(7) as { environment?: object }).environment).toEqual({ kind:'staging', label:'STAGING', blocked:false });
});

test('a page error, a host the script reports off Unqork, and a tab that goes away mid-call come back as errors', async () => {
  let loaded = await load('browser', { context:{ error:'Open a module in the builder tab.' } });
  expect(await loaded.tab.readContext(7)).toEqual({ ok:false, error:'Open a module in the builder tab.' });
  vi.resetModules();
  loaded = await load('browser', { context:{ url:'https://elsewhere.test/', host:'elsewhere.test', moduleId:'x', title:'x', identity:{} } });
  expect((await loaded.tab.readContext(7) as { error: string }).error).toMatch(/no longer on Unqork/);
  vi.resetModules();
  loaded = await load('browser', { fails:true });
  expect(await loaded.tab.readContext(7)).toEqual({ ok:false, error:'Frame with ID 0 was removed.' });
  expect(await loaded.tab.run(7, request, false)).toEqual({ ok:false, error:'Frame with ID 0 was removed.' });
});

test.each<[InputShape, unknown]>([
  ['data', { a:1 }],
  ['request', { _request:{ a:1 } }],
  ['query', { _request:{ query:{ a:1 } } }],
  ['body', { _request:{ body:{ a:1 } } }]
])('the %s shape places the input in the body’s data, as the window draws it', async (shape, values) => {
  const sent: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { sent.push({ url, init }); return new Response('{}', { status:200 }); });
  try {
    const response = await runSseExecute({ ...request, url:location.href, shape });
    expect(response.ok).toBe(true);
    expect(JSON.parse(sent[0].init.body as string)).toEqual({ moduleId:request.moduleId, data:values, verbose:true });
    expect(response.sent?.body).toEqual({ moduleId:request.moduleId, data:values, verbose:true });
    // Metadata goes beside data, whatever the shape.
    await runSseExecute({ ...request, url:location.href, shape, metadata:{ source:'test' } });
    expect(JSON.parse(sent[1].init.body as string)).toEqual({ moduleId:request.moduleId, data:values, metadata:{ source:'test' }, verbose:true });
  } finally { vi.unstubAllGlobals(); }
});
