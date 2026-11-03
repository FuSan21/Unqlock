import type { SseRequest, SseResponse } from './sse-run';

// The SSE debugger's past runs, kept in the debugger page's own localStorage so they outlast the window:
// the newest 10, none older than 30 days. They hold submission data, so they never go to extension storage,
// sync or exports, and Clear removes them. Every debugger window shares the one list.
export const historyKey = 'unqlock.sse.runs';
export const keptRuns = 10;
export const keptDays = 30;
const keptMs = keptDays * 24 * 60 * 60 * 1000;

export interface StoredRun {
  id: string;
  // Milliseconds since the epoch.
  at: number;
  title: string;
  moduleId: string;
  request: SseRequest;
  response: SseResponse;
  // What the result line counts, kept so a trimmed run can still show it.
  summary?: { steps: number; sets: number };
  // Saved without its event log and response body, which the storage quota could not hold.
  trimmed?: true;
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function valid(value: unknown): value is StoredRun {
  if (!isObject(value)) return false;
  const { id, at, title, moduleId, request, response } = value;
  return typeof id === 'string' && typeof at === 'number' && Number.isFinite(at) && typeof title === 'string' && typeof moduleId === 'string'
    && isObject(request) && isObject(request.data) && typeof request.url === 'string' && isObject(response) && typeof response.ms === 'number';
}

// Newest first, dropping anything unreadable, older than 30 days or beyond the newest 10.
function prune(runs: StoredRun[], now: number) {
  return runs.filter(run => valid(run) && now - run.at < keptMs).sort((a, b) => b.at - a.at).slice(0, keptRuns);
}

export function readRuns(storage: Storage, now = Date.now()): StoredRun[] {
  let stored: unknown;
  try { stored = JSON.parse(storage.getItem(historyKey) || '[]'); } catch { return []; }
  return Array.isArray(stored) ? prune(stored, now) : [];
}

// A run without its event log and response body: its input, options and result, with only what the outcome
// reads (the execution error and validation errors) left in the body.
export function trim(run: StoredRun): StoredRun {
  const { ok, status, ms, headers, error, body } = run.response;
  const kept: Record<string, unknown> = {};
  if (body && typeof body === 'object') for (const key of ['executionError', 'validationErrors']) if (body[key] !== undefined) kept[key] = body[key];
  return { ...run, trimmed:true, response:{ ok, status, ms, headers, body:kept, ...(error ? { error } : {}) } };
}

// Writes the runs that are still kept and returns them. When the browser's quota refuses the list, the largest
// runs are trimmed one at a time, then the oldest go; a run whose input alone is too large is left out.
export function writeRuns(storage: Storage, runs: StoredRun[], now = Date.now()): StoredRun[] {
  let list = prune(runs, now);
  if (!list.length) { storage.removeItem(historyKey); return []; }
  const save = () => {
    try { storage.setItem(historyKey, JSON.stringify(list)); return true; } catch { return false; }
  };
  if (save()) return list;
  const largest = list.map((run, index) => ({ index, size:JSON.stringify(run).length })).sort((a, b) => b.size - a.size);
  for (const { index } of largest) {
    if (list[index].trimmed) continue;
    list = list.map((run, at) => at === index ? trim(run) : run);
    if (save()) return list;
  }
  const trimmed = list;
  for (let rest of [trimmed.slice(0, -1), trimmed.slice(1)]) {
    while (rest.length) {
      list = rest;
      if (save()) return list;
      rest = rest.slice(0, -1);
    }
  }
  storage.removeItem(historyKey);
  return [];
}

export function clearRuns(storage: Storage) {
  storage.removeItem(historyKey);
}
