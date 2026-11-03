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

// Writes the runs that are still kept and returns them. When the browser's quota refuses the list, the oldest
// runs go first; a newest run too large to store even alone is left out instead, keeping the older ones.
export function writeRuns(storage: Storage, runs: StoredRun[], now = Date.now()): StoredRun[] {
  const kept = prune(runs, now);
  for (const list of [kept, kept.slice(1)]) {
    for (let count = list.length; count > 0; count--) {
      try {
        storage.setItem(historyKey, JSON.stringify(list.slice(0, count)));
        return list.slice(0, count);
      } catch {}
    }
  }
  storage.removeItem(historyKey);
  return [];
}

export function clearRuns(storage: Storage) {
  storage.removeItem(historyKey);
}
