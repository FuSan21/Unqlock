// The shape of a real verbose event log, with invented keys: setup sets values and queues init; init runs
// and queues a transformer and an async integrator; the transformer sets values; the integrator waits.
const at = (ms: number) => new Date(Date.UTC(2026, 10, 2, 1, 17, 48) + ms).toISOString();
export const entry = (tick: number, eventType: string, causeKey: string, componentKey: string, componentType: string, ms: number, eventAttributes: object = {}) =>
  ({ timestamp:at(ms), eventType, tick, causeKey, componentKey, componentType, eventAttributes });
export const log = [
  entry(0, 'start', '__setup__', '__setup__', '__setup__', 0, { flavor:'new' }),
  entry(0, 'setData', '__setup__', 'init', 'initializer', 0, { value:'ready', update:true }),
  entry(0, 'addTrigger', '__setup__', 'init', 'initializer', 0),
  entry(0, 'setData', '__setup__', 'env', 'hidden', 1, { value:{ level:'staging' }, update:true }),
  entry(0, 'setData', '__setup__', 'vars', 'hidden', 1, { value:{ retries:0 }, update:true }),
  entry(1, 'executeComponent', '__setup__', 'init', 'initializer', 2),
  entry(1, 'addTrigger', 'init', 'buildFlags', 'transformer', 3),
  entry(1, 'addTrigger', 'init', 'callService', 'integrator', 3),
  entry(2, 'executeComponent', 'init', 'buildFlags', 'transformer', 3),
  entry(2, 'setData', 'buildFlags', 'validate', 'hidden', 6, { value:false, update:true }),
  entry(2, 'setData', 'buildFlags', 'save', 'hidden', 7, { value:true, update:true }),
  entry(2, 'executeComponentAsyncStart', 'init', 'callService', 'integrator', 7),
  entry(2, 'executeComponentAsyncFinish', 'callService', 'callService', 'integrator', 11)
];
