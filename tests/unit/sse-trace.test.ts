import { expect, test } from 'vitest';
import { outcome, parseInput, type SseResponse } from '@/lib/sse-run';
import { buildTrace, chain, describe, duration, path, slowAfter } from '@/lib/sse-trace';
import { entry, log } from './sse-fixture';


test('arranges the log into steps and lanes in execution order', () => {
  const trace = buildTrace(log);
  expect(trace.steps.map(step => [step.tick, step.events, step.changes, step.ms])).toEqual([[0, 5, 3, 1], [1, 3, 0, 1], [2, 5, 2, 8]]);
  expect(trace.lanes.map(lane => lane.key + ':' + lane.type)).toEqual(['init:initializer', 'env:hidden', 'vars:hidden', 'buildFlags:transformer', 'callService:integrator', 'validate:hidden', 'save:hidden']);
  expect(trace.events.map(event => event.key + ' ' + event.kind)).toEqual([
    'init set', 'init queued', 'env set', 'vars set', 'init ran', 'buildFlags queued', 'callService queued',
    'buildFlags ran', 'validate set', 'save set', 'callService wait'
  ]);
  // An async start and finish become one wait with its duration.
  const wait = trace.events.find(event => event.kind === 'wait')!;
  expect([wait.ms, wait.open, wait.endTick]).toEqual([4, false, undefined]);
  expect(describe(wait)).toBe('ran and waited 4 ms');
  expect(trace.events.find(event => event.key === 'env')!.value).toEqual({ level:'staging' });
});

test('links each event to its cause: a run to the trigger that queued it, anything else to its cause running', () => {
  const trace = buildTrace(log);
  const id = (key: string, kind: string) => trace.events.find(event => event.key === key && event.kind === kind)!.id;
  // save ← buildFlags ran ← buildFlags queued ← init ran ← init queued (setup)
  expect(path(trace, id('save', 'set')).map(event => event.key + ' ' + event.kind)).toEqual(['init queued', 'init ran', 'buildFlags queued', 'buildFlags ran', 'save set']);
  expect(path(trace, id('callService', 'wait')).map(event => event.key + ' ' + event.kind)).toEqual(['init queued', 'init ran', 'callService queued', 'callService wait']);
  // Setup values have no cause in the log.
  expect(trace.byId.get(id('env', 'set'))!.cause).toBeUndefined();
  // The chain holds the path and what follows directly.
  expect([...chain(trace, id('buildFlags', 'ran'))].map(each => trace.byId.get(each)!.key).sort()).toEqual(['buildFlags', 'buildFlags', 'init', 'init', 'save', 'validate']);
});

test('an execution error marks its component, and a wait without a finish stays open', () => {
  const failed = log.slice(0, -1);
  const trace = buildTrace(failed, { component:'callService', message:'Request failed with status code 500' });
  const wait = trace.events.find(event => event.kind === 'wait')!;
  expect(wait.open).toBe(true);
  expect(describe(wait)).toBe('started and did not finish');
  const failure = trace.events.find(event => event.kind === 'fail')!;
  expect([failure.key, failure.tick, failure.cause, failure.message]).toEqual(['callService', 2, wait.id, 'Request failed with status code 500']);
  // A component the log never mentions still gets its lane.
  const elsewhere = buildTrace(log, { component:'outside', message:'Boom' });
  expect(elsewhere.lanes.at(-1)).toEqual({ key:'outside', type:'', setup:false });
  // An empty or missing log is an empty trace.
  expect(buildTrace(undefined)).toMatchObject({ steps:[], lanes:[], events:[] });
});

test('overlapping waits of one component finish in the order they began', () => {
  const trace = buildTrace([
    entry(1, 'executeComponentAsyncStart', 'init', 'callService', 'integrator', 0),
    entry(1, 'executeComponentAsyncStart', 'init', 'callService', 'integrator', 10),
    entry(2, 'executeComponentAsyncFinish', 'callService', 'callService', 'integrator', 100),
    entry(3, 'executeComponentAsyncFinish', 'callService', 'callService', 'integrator', 400)
  ]);
  const waits = trace.events.filter(event => event.kind === 'wait');
  expect(waits.map(wait => [wait.open, wait.ms])).toEqual([[false, 100], [false, 390]]);
});

test('unknown event types are kept as other, and an error-like type as a failure', () => {
  const trace = buildTrace([...log, entry(2, 'componentError', 'callService', 'callService', 'integrator', 12, { message:'Timed out' }), entry(2, 'somethingNew', 'init', 'vars', 'hidden', 12)]);
  expect(trace.events.at(-2)).toMatchObject({ kind:'fail', message:'Timed out' });
  expect(trace.events.at(-1)).toMatchObject({ kind:'other', eventType:'somethingNew' });
  expect(describe(trace.events.at(-1)!)).toBe('logged somethingNew');
});

test('a value an integrator saves under its own key follows from its wait, as one it saves elsewhere does', () => {
  const trace = buildTrace([...log,
    entry(3, 'setData', 'callService', 'callService', 'integrator', 12, { value:{ status:200 }, update:true }),
    entry(3, 'setData', 'callService', 'response', 'hidden', 12, { value:'ok', update:true })
  ]);
  const wait = trace.events.find(event => event.key === 'callService' && event.kind === 'wait')!;
  const own = trace.events.find(event => event.key === 'callService' && event.kind === 'set')!;
  const other = trace.events.find(event => event.key === 'response' && event.kind === 'set')!;
  expect([own.cause, other.cause]).toEqual([wait.id, wait.id]);
  // Selecting the value highlights the wait, and its path runs through the wait to the value.
  expect(chain(trace, own.id).has(wait.id)).toBe(true);
  expect(chain(trace, wait.id).has(own.id)).toBe(true);
  expect(path(trace, own.id).slice(-2).map(event => event.id)).toEqual([wait.id, own.id]);
});

test('a run lasts until the last event it caused in its step, and runs and waits past their limits are slow', () => {
  const trace = buildTrace([
    entry(0, 'addTrigger', '__setup__', 'calc', 'calculator', 0),
    entry(1, 'executeComponent', '__setup__', 'calc', 'calculator', 0),
    entry(1, 'setData', 'calc', 'total', 'hidden', 250, { value:3 }),
    entry(1, 'addTrigger', 'calc', 'quick', 'decision', 360),
    entry(2, 'executeComponent', 'calc', 'quick', 'decision', 400),
    entry(2, 'setData', 'quick', 'flag', 'hidden', 440, { value:true }),
    // Caused by calc, but a step later: it belongs to what calc queued, not to calc's own run.
    entry(2, 'setData', 'calc', 'late', 'hidden', 900, { value:1 }),
    entry(2, 'executeComponentAsyncStart', 'quick', 'plug', 'plugin', 400),
    entry(2, 'executeComponentAsyncFinish', 'plug', 'plug', 'plugin', 3600),
    entry(3, 'executeComponentAsyncStart', 'quick', 'fast', 'plugin', 3600),
    entry(3, 'executeComponentAsyncFinish', 'fast', 'fast', 'plugin', 6100)
  ]);
  const event = (key: string, kind: string) => trace.events.find(each => each.key === key && each.kind === kind)!;
  expect([event('calc', 'ran').ms, event('calc', 'ran').slow]).toEqual([360, true]);
  expect([event('quick', 'ran').ms, event('quick', 'ran').slow]).toEqual([40, undefined]);
  expect([event('plug', 'wait').ms, event('plug', 'wait').slow]).toEqual([3200, true]);
  // A wait has more room than a run: 2.5 s is fine for a plug-in.
  expect([event('fast', 'wait').ms, event('fast', 'wait').slow]).toEqual([2500, undefined]);
  expect(slowAfter).toEqual({ ran:300, wait:3000 });
});

test('a setup lane holds only values set during setup', () => {
  const trace = buildTrace(log);
  expect(trace.lanes.filter(lane => lane.setup).map(lane => lane.key)).toEqual(['env', 'vars']);
  // init was set during setup but also queued and ran, so it is not a setup lane.
  expect(trace.lanes.find(lane => lane.key === 'init')!.setup).toBe(false);
  // A failure on a setup lane makes it part of the run.
  expect(buildTrace(log, { component:'env', message:'Bad' }).lanes.find(lane => lane.key === 'env')!.setup).toBe(false);
});

test('durations read as ms under a second and s above', () => {
  expect([duration(4), duration(317), duration(1840), duration(12500), duration(undefined)]).toEqual(['4 ms', '317 ms', '1.84 s', '12.5 s', '']);
});

test('input must be a JSON object, and a parse error names its line', () => {
  expect(parseInput('')).toEqual({ ok:true, data:{}, fields:0 });
  expect(parseInput('{ "a": 1, "b": [2] }')).toEqual({ ok:true, data:{ a:1, b:[2] }, fields:2 });
  expect(parseInput('[1, 2]')).toMatchObject({ ok:false, message:expect.stringMatching(/JSON object/) });
  const broken = parseInput('{\n  "a": 1,\n  "b": }\n');
  expect(broken.ok).toBe(false);
  if (!broken.ok) expect([broken.message, broken.line]).toEqual(['Unexpected "}"', 3]);
  expect(parseInput('{ "a": ')).toMatchObject({ ok:false, message:'The JSON ends too early', line:1 });
  // An escape JSON does not allow is found where it is, not at the end.
  expect(parseInput(String.raw`{
  "path": "C:\q",
  "b": 1
}`)).toMatchObject({ ok:false, line:2 });
  expect(parseInput(String.raw`{ "a": "\u12" }`)).toMatchObject({ ok:false, line:1, message:expect.stringMatching(/^Unexpected/) });
  // Valid escapes still parse.
  expect(parseInput(String.raw`{ "a": "\"\\\/\b\f\n\r\t\u00e9" }`)).toMatchObject({ ok:true });
});

const response = (status: number, body: object, extra: Partial<SseResponse> = {}): SseResponse => ({ ok:status < 400, status, ms:300, headers:{ 'x-assume-role':'Administrator' }, body, ...extra });

test('the outcome names the failing component, validation errors and an ended session', () => {
  expect(outcome(response(200, { data:{ resolved:{} }, validationErrors:[] }))).toEqual({ ok:true, status:200, problem:undefined, validation:[], ranAs:'Administrator' });
  const failed = outcome(response(412, { executionError:{ component:'callService', message:'Request failed with status code 500', code:500, type:'plugin' } }));
  expect(failed).toMatchObject({ ok:false, problem:{ component:'callService', message:'Request failed with status code 500', detail:'Code 500 · plugin' } });
  const invalid = outcome(response(412, { validationErrors:[{ id:'email', label:'Email', message:'Email is required' }] }));
  expect(invalid.validation).toEqual([{ key:'email', label:'Email', message:'Email is required' }]);
  expect(outcome(response(440, {})).problem?.message).toMatch(/session ended/);
  expect(outcome(response(403, {}, { body:null, text:'Invalid CSRF Token' })).problem?.message).toMatch(/CSRF/);
  expect(outcome({ ok:false, ms:0, headers:{}, body:null, error:'The request did not reach Unqork: Failed to fetch.' })).toMatchObject({ ok:false, problem:{ message:'The request did not reach Unqork: Failed to fetch.' } });
});

// Unqork's ticks skip ahead; one real run went from 97 to 13299. Steps are the ticks that have events, numbered
// in order as Unqork's debugger numbers them, so a gap adds no empty columns.
test('steps number the ticks that have events, however far apart', () => {
  const trace = buildTrace([
    entry(0, 'setData', '__setup__', 'a', 'hidden', 0, { value:1 }),
    entry(97, 'executeComponent', '__setup__', 'b', 'transformer', 5),
    entry(13299, 'setData', 'b', 'c', 'hidden', 9, { value:2 }),
    entry(13299, 'setData', 'b', 'd', 'hidden', 9, { value:3 })
  ]);
  expect(trace.steps.map(step => [step.number, step.tick, step.events])).toEqual([[1, 0, 1], [2, 97, 1], [3, 13299, 2]]);
  expect(trace.events.map(event => event.key + ':' + event.step)).toEqual(['a:1', 'b:2', 'c:3', 'd:3']);
  // A failure added for an execution error takes the step of its component's last event.
  const failed = buildTrace([entry(0, 'setData', '__setup__', 'a', 'hidden', 0), entry(40000, 'executeComponent', '__setup__', 'b', 'plugin', 3)], { component:'b', message:'Boom' });
  expect(failed.events.at(-1)).toMatchObject({ kind:'fail', tick:40000, step:2 });
});

test('a long log builds in linear time', () => {
  const long = [];
  for (let index = 0; index < 20000; index++) long.push(entry(Math.floor(index / 50), index % 3 ? 'setData' : 'executeComponent', 'c' + (index % 400), 'c' + ((index + 1) % 400), 'hidden', index));
  const started = performance.now();
  const trace = buildTrace(long);
  expect(trace.events).toHaveLength(20000);
  expect(trace.steps).toHaveLength(400);
  expect(performance.now() - started).toBeLessThan(1000);
});
