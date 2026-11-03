// The SSE debugger's runs as the window holds them, and how they are kept in and read back from storage.
import { keptRuns, type StoredRun } from '@/lib/sse-history';
import { outcome as outcomeOf, type Outcome, type SseRequest, type SseResponse } from '@/lib/sse-run';
import { buildTrace, type Trace } from '@/lib/sse-trace';

export interface Run {
  id: string;
  at: Date;
  title: string;
  moduleId: string;
  request: SseRequest;
  response: SseResponse;
  outcome: Outcome;
  trace: Trace;
  // Restored without its event log and response body, with the counts the result line shows.
  trimmed?: boolean;
  summary?: StoredRun['summary'];
  // A run this window holds in full that storage keeps only trimmed, or not at all.
  saved?: 'trimmed' | 'none';
}

// With Keep past runs on, past runs are kept in this page's localStorage (src/lib/sse-history.ts), never in
// extension storage: they hold submission data. The outcome and trace are worked out again from the stored response.
export function restore(stored: StoredRun): Run {
  const outcome = outcomeOf(stored.response);
  return { id:stored.id, at:new Date(stored.at), title:stored.title, moduleId:stored.moduleId, request:stored.request, response:stored.response, outcome,
    trace:buildTrace(stored.response.body?.eventLog, outcome.problem), ...(stored.trimmed ? { trimmed:true, summary:stored.summary } : {}) };
}
export const store = (run: Run): StoredRun => ({ id:run.id, at:run.at.getTime(), title:run.title, moduleId:run.moduleId, request:run.request, response:run.response,
  summary:run.summary ?? { steps:run.trace.steps.length, sets:run.trace.events.filter(event => event.kind === 'set').length, failedStep:firstFailure(run.trace)?.step }, ...(run.trimmed ? { trimmed:true as const } : {}) });
export const firstFailure = (trace: Trace) => trace.events.find(event => event.kind === 'fail');
// The step that stopped the run. A restored trimmed run has no event log, so it comes from the stored summary;
// the failure its trace still adds from the execution error is not placed in a real step.
export const failedStep = (run: Run) => run.summary ? run.summary.failedStep : firstFailure(run.trace)?.step;
// The stored list as runs, reusing those already worked out; a run held in full notes when storage trimmed it.
// A run too large to store stays in the window that ran it, among the stored ones by time.
export const synced = (list: Run[], stored: StoredRun[]) => [...stored.map((each): Run => {
  const held = list.find(run => run.id === each.id);
  if (!held) return restore(each);
  const saved = each.trimmed && !held.trimmed ? 'trimmed' as const : undefined;
  return held.saved === saved ? held : { ...held, saved };
}), ...list.filter(run => run.saved === 'none' && !stored.some(each => each.id === run.id))]
  .sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, keptRuns);

const time = (date: Date) => date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
// A run from an earlier day also names its date.
export const stamp = (date: Date) => date.toDateString() === new Date().toDateString() ? time(date) : date.toLocaleDateString([], { month:'short', day:'numeric' }) + ' ' + time(date);
