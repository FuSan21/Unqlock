import type { Stored } from './api';
import type { Problem } from './sse-run';

// The verbose event log of one execution, arranged the way the SSE debugger draws it: one lane per
// component, one column per step, and each event linked to the event that caused it.
//
// A step is a tick that has events. Unqork's ticks are its own counter and skip ahead, from 97 to 13299 in
// one real run, so steps are numbered in order as Unqork's debugger numbers them, not by tick.
//
// In Unqork's log, componentKey is the component an event happens to and causeKey the component that
// caused it: addTrigger queues componentKey, executeComponent runs it, setData writes it, and an async
// component logs a start and a finish instead of executeComponent. Setup events have __setup__ as cause.
export type EventKind = 'set' | 'ran' | 'queued' | 'wait' | 'fail' | 'other';

export interface TraceEvent {
  id: string;
  // Unqork's tick, and the one-based step it falls in.
  tick: number;
  step: number;
  kind: EventKind;
  key: string;
  type: string;
  causeKey: string;
  // The event this one follows from, when it is in the log.
  cause?: string;
  // Unqork's eventType, or for a wait the start's.
  eventType: string;
  at?: number;
  // A wait's duration, and the tick it finished in when that is later. For a run, the time from it to the
  // last event it caused in the same step, which is as close to its own work as the log tells.
  ms?: number;
  // Took longer than `slowAfter` allows for its kind.
  slow?: boolean;
  endTick?: number;
  // A wait whose finish is missing from the log.
  open?: boolean;
  value?: unknown;
  hasValue: boolean;
  message?: string;
  attributes: Record<string, unknown>;
}

export interface Step { tick: number; number: number; ms?: number; events: number; changes: number }
// A setup lane holds only values set during setup, such as the module's hidden fields filled from the input.
export interface Lane { key: string; type: string; setup: boolean }
export interface Trace { steps: Step[]; lanes: Lane[]; events: TraceEvent[]; byId: Map<string, TraceEvent> }

const setup = '__setup__';

// When a run or a wait counts as slow. A native component's run usually takes a few milliseconds; a wait is
// a plug-in, integrator or other remote call, which is expected to take longer.
export const slowAfter = { ran:300, wait:3000 };
const string = (value: unknown, fallback = '') => typeof value === 'string' && value ? value : fallback;

export function buildTrace(log: Stored, problem?: Problem): Trace {
  const entries: Stored[] = Array.isArray(log) ? log.filter(entry => entry && typeof entry === 'object') : [];
  const events: TraceEvent[] = [];
  const lanes = new Map<string, Lane>();
  const ticks = new Map<number, { min?: number; max?: number; events: number; changes: number }>();
  const waits = new Map<string, TraceEvent>();
  // A component's queued triggers not yet followed by its run.
  const queued = new Map<string, TraceEvent[]>();
  // Each component's latest event, and its latest run, kept as events are added so a long log stays linear.
  const latestEvent = new Map<string, TraceEvent>();
  const latestRun = new Map<string, TraceEvent>();
  const add = (event: TraceEvent) => {
    events.push(event);
    latestEvent.set(event.key, event);
    if (event.kind === 'ran' || event.kind === 'wait') latestRun.set(event.key, event);
  };
  const causeOf = (key: string, causeKey: string) => causeKey === setup || causeKey === key ? undefined
    : (latestRun.get(causeKey) || latestEvent.get(causeKey))?.id;
  entries.forEach((entry, index) => {
    const tick = Number.isInteger(entry.tick) && entry.tick >= 0 ? entry.tick : 0;
    const at = Date.parse(entry.timestamp);
    const step = ticks.get(tick) || { events:0, changes:0 };
    step.events++;
    if (Number.isFinite(at)) { step.min = Math.min(step.min ?? at, at); step.max = Math.max(step.max ?? at, at); }
    ticks.set(tick, step);
    const key = string(entry.componentKey, setup);
    const eventType = string(entry.eventType, 'event');
    if (key === setup) return;
    const type = string(entry.componentType);
    if (!lanes.has(key)) lanes.set(key, { key, type, setup:true });
    else if (type && !lanes.get(key)!.type) lanes.get(key)!.type = type;
    const causeKey = string(entry.causeKey, setup);
    const attributes = entry.eventAttributes && typeof entry.eventAttributes === 'object' ? entry.eventAttributes : {};
    const base = { id:'e' + index, tick, step:0, key, type, causeKey, eventType, at:Number.isFinite(at) ? at : undefined, hasValue:'value' in attributes, value:attributes.value, attributes };
    // A run follows the trigger that queued it; anything else follows the run of its cause.
    const runCause = () => queued.get(key)?.shift()?.id ?? causeOf(key, causeKey);
    if (eventType === 'executeComponentAsyncFinish') {
      const wait = waits.get(key);
      if (wait) {
        waits.delete(key);
        wait.open = false;
        if (wait.at !== undefined && base.at !== undefined) wait.ms = Math.max(0, base.at - wait.at);
        if (tick !== wait.tick) wait.endTick = tick;
        return;
      }
    }
    let event: TraceEvent;
    // A component that sets its own value, as an integrator saves its response under its own key, does so from
    // its own latest run or wait.
    if (eventType === 'setData') event = { ...base, kind:'set', cause:causeKey === key ? latestRun.get(key)?.id : causeOf(key, causeKey) };
    else if (eventType === 'addTrigger') {
      event = { ...base, kind:'queued', cause:causeOf(key, causeKey) };
      const waiting = queued.get(key);
      if (waiting) waiting.push(event); else queued.set(key, [event]);
    } else if (eventType === 'executeComponent') event = { ...base, kind:'ran', cause:runCause() };
    else if (eventType === 'executeComponentAsyncStart') {
      event = { ...base, kind:'wait', open:true, cause:runCause() };
      waits.set(key, event);
    } else if (/error|fail/i.test(eventType)) event = { ...base, kind:'fail', cause:latestEvent.get(key)?.id ?? causeOf(key, causeKey), message:string(attributes.message) || undefined };
    else event = { ...base, kind:'other', cause:causeOf(key, causeKey) };
    if (event.kind === 'set') step.changes++;
    if (event.kind !== 'set' || causeKey !== setup) lanes.get(key)!.setup = false;
    add(event);
  });
  // An execution error names the component that stopped the run; show it on that lane unless the log did.
  if (problem?.component && !events.some(event => event.kind === 'fail' && event.key === problem.component)) {
    const last = latestEvent.get(problem.component);
    const tick = last?.tick ?? [...ticks.keys()].reduce((highest, each) => Math.max(highest, each), 0);
    if (!lanes.has(problem.component)) lanes.set(problem.component, { key:problem.component, type:last?.type || '', setup:false });
    else lanes.get(problem.component)!.setup = false;
    if (!ticks.has(tick)) ticks.set(tick, { events:0, changes:0 });
    events.push({ id:'error', tick, step:0, kind:'fail', key:problem.component, type:last?.type || '', causeKey:problem.component, cause:last?.id, eventType:'executionError', hasValue:false, message:[problem.message, problem.detail].filter(Boolean).join('\n'), attributes:{} });
  }
  // One step per tick that has events, numbered in order.
  const steps: Step[] = [...ticks.keys()].sort((a, b) => a - b).map((tick, index) => {
    const step = ticks.get(tick)!;
    return { tick, number:index + 1, events:step.events, changes:step.changes, ms:step.min !== undefined && step.max !== undefined ? step.max - step.min : undefined };
  });
  const numbers = new Map(steps.map(step => [step.tick, step.number]));
  for (const event of events) event.step = numbers.get(event.tick)!;
  // A run lasts until the last event it caused in its own step; later steps belong to what it queued.
  const byId = new Map(events.map(event => [event.id, event]));
  for (const event of events) {
    const cause = event.cause ? byId.get(event.cause) : undefined;
    if (cause?.kind !== 'ran' || cause.tick !== event.tick || cause.at === undefined || event.at === undefined) continue;
    cause.ms = Math.max(cause.ms ?? 0, event.at - cause.at);
  }
  for (const event of events) if ((event.kind === 'ran' || event.kind === 'wait') && event.ms !== undefined && event.ms >= slowAfter[event.kind]) event.slow = true;
  return { steps, lanes:[...lanes.values()], events, byId };
}

// The event and every event it follows from, then the events that follow directly from it.
export function chain(trace: Trace, id: string) {
  const ids = new Set<string>();
  for (let event = trace.byId.get(id); event && !ids.has(event.id); event = event.cause ? trace.byId.get(event.cause) : undefined) ids.add(event.id);
  for (const event of trace.events) if (event.cause === id) ids.add(event.id);
  return ids;
}

// The path to an event, oldest first.
export function path(trace: Trace, id: string) {
  const events: TraceEvent[] = [];
  const seen = new Set<string>();
  for (let event = trace.byId.get(id); event && !seen.has(event.id); event = event.cause ? trace.byId.get(event.cause) : undefined) {
    seen.add(event.id);
    events.unshift(event);
  }
  return events;
}

export const verbs: Record<EventKind, string> = { set:'set a value', ran:'ran', queued:'was queued', wait:'ran and waited', fail:'failed', other:'logged' };

// "8 ms", "1.84 s".
export function duration(ms: number | undefined) {
  if (ms === undefined) return '';
  return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s';
}

// What one event did, in words: "Step 3: ran and waited 4 ms".
export function describe(event: TraceEvent) {
  const verb = event.kind === 'other' ? 'logged ' + event.eventType : event.kind === 'wait' ? (event.open ? 'started and did not finish' : 'ran and waited ' + duration(event.ms)) : verbs[event.kind];
  return verb;
}
