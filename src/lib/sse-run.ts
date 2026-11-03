import type { Stored } from './api';

// One server-side execution of a module, as Unqork's own SSE Debugger sends it: PUT
// /fbu/uapi/modules/{id}/execute from the builder page, with its cookies, an empty x-xsrf header (Unqork's
// CSRF check needs the header present) and verbose: true, which adds the event log to the response.
export type IdentityMode = 'designer' | 'express';

export interface SseContext {
  url: string;
  moduleId: string;
  title: string;
  host: string;
  // Unqork's last Run as choice in its own debugger, used as the starting point here.
  identity: { mode: IdentityMode; designerRole: string; expressRole: string };
  // The environment's roles, which Run as can impersonate, by name; absent when they could not be loaded.
  roles?: string[];
}

// Where the input goes in the submission data: as it is, or as an API module's _request, its query or its body.
export type InputShape = 'data' | 'request' | 'query' | 'body';

// Each shape's label, the fixed JSON drawn before the input and the lines after it that close the shape's own
// keys inside data, matching what runSseExecute sends.
export const inputShapes: { id: InputShape; label: string; before: string; close: string }[] = [
  { id:'data', label:'data', before:'{\n  "data":', close:'' },
  { id:'request', label:'_request', before:'{\n  "data": {\n    "_request":', close:'  }' },
  { id:'query', label:'query', before:'{\n  "data": {\n    "_request": {\n      "query":', close:'    }\n  }' },
  { id:'body', label:'body', before:'{\n  "data": {\n    "_request": {\n      "body":', close:'    }\n  }' }
];

// The fixed JSON around the input: `before` and `after` it, or with metadata, `between` the input and the
// metadata, which goes beside data in the body, and `after` the metadata.
export function inputWrapper(shape: InputShape, metadata: boolean): { before: string; between?: string; after: string } {
  const { before, close } = inputShapes.find(each => each.id === shape) ?? inputShapes[0];
  return metadata ? { before, between:close + ',\n  "metadata":', after:'}' } : { before, after:(close ? close + '\n' : '') + '}' };
}

export interface SseRequest {
  // The builder page the run was started for; a run against another page is refused.
  url: string;
  moduleId: string;
  // The input as typed; `shape` says where runSseExecute places it.
  data: Record<string, unknown>;
  shape: InputShape;
  // The body's metadata, beside data; absent unless Include metadata is on.
  metadata?: Record<string, unknown>;
  submissionId?: string;
  validate?: boolean;
  hydrate?: boolean;
  save?: boolean;
  mode: IdentityMode;
  role: string;
}

export interface SseSent { url: string; method: 'PUT'; headers: Record<string, string>; body: Record<string, unknown> }

export interface SseResponse {
  ok: boolean;
  status?: number;
  ms: number;
  headers: Record<string, string>;
  body: Stored;
  // A body that was not JSON, cut short.
  text?: string;
  // Why no response came back at all.
  error?: string;
  sent?: SseSent;
}

// Injected into the builder tab's MAIN world by scripting.executeScript, which serializes the function's
// source. It must stay self-contained: no imports, closures or helpers from this module.
// `knownHost` is a host whose roles the window already holds, so moving between its modules fetches none.
export async function readSseContext(knownHost?: string): Promise<SseContext | { error: string }> {
  const match = location.pathname.match(/\/modules\/([0-9a-f]{24})(?:[/?#]|$)/i);
  if (!location.pathname.startsWith('/ide/') || !match) return { error:'Open a module in the builder tab.' };
  let state: Record<string, unknown> = {};
  try { state = JSON.parse(localStorage.getItem('ide-sse-debugger-identity') || '{}')?.state || {}; } catch {}
  const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;
  // The roles Unqork's own Run as menu offers: its fetchExpressRoles server action reads the same list.
  // A slow list gives up after five seconds, leaving Run as a typed role rather than the window unloaded.
  let roles: string[] | undefined;
  if (location.hostname !== knownHost) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(location.origin + '/fbu/uapi/roles', { credentials:'include', headers:{ 'x-xsrf':'' }, signal:controller.signal });
      const list = response.ok ? await response.json() : undefined;
      if (Array.isArray(list)) roles = [...new Set(list.map((role: { name?: unknown }) => role?.name).filter((name): name is string => typeof name === 'string' && name.trim() !== ''))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity:'base' }));
    } catch {} finally { clearTimeout(timer); }
  }
  return {
    roles,
    url:location.href,
    moduleId:match[1],
    title:document.title.replace(/\s[-–]\s(?:UnqorkAI|Unqork)$/, '') || match[1],
    host:location.hostname,
    identity:{
      mode:state.identityMode === 'express' ? 'express' : 'designer',
      designerRole:text(state.designerAssumeRole, 'Administrator'),
      expressRole:text(state.expressPreferredRole, '')
    }
  };
}

// Injected like readSseContext, so also self-contained. `runId` names the run so stopSseExecute can abort it.
export async function runSseExecute(request: SseRequest, runId = ''): Promise<SseResponse> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  // Runs in flight on this page, by ID; a later injection reaches them through the global symbol registry.
  // 'stopped' marks a run Stop reached before it started here.
  const runs = ((globalThis as unknown as Record<symbol, Record<string, AbortController | 'stopped'> | undefined>)[Symbol.for('unqlock.sse.runs')] ??= {});
  const controller = new AbortController();
  if (runs[runId] === 'stopped') controller.abort('stopped');
  else if (runId) runs[runId] = controller;
  try {
    controller.signal.throwIfAborted();
    if (location.href !== request.url) return { ok:false, ms:0, headers:{}, body:null, error:'The builder tab is on another page now. Choose Run module again.' };
    if (!/^[0-9a-f]{24}$/i.test(request.moduleId)) return { ok:false, ms:0, headers:{}, body:null, error:'That is not a module ID.' };
    // Unqork's getExpressOrigin: a Creator host drops -designer, any other gains an x before .unqork.io.
    let base = location.origin;
    if (request.mode === 'express') {
      const host = /^(.*)(\.unqork(?:gov)?\.io)$/.exec(base);
      base = base.includes('-designer') ? base.replace('-designer', '') : host ? host[1] + 'x' + host[2] : base;
    }
    // One URL for both the request and what the Raw view shows.
    const url = base + '/fbu/uapi/modules/' + request.moduleId + '/execute';
    const headers: Record<string, string> = { 'Content-Type':'application/json', 'x-xsrf':'' };
    if (request.role) headers['x-assume-role'] = request.role;
    if (request.mode === 'designer') headers['x-quill-preview'] = 'true';
    // The input is the body's data as it is, or for an API module its _request, query or body; the window draws
    // exactly this as the fixed lines around the input. Kept in step with inputShapes.
    const values = request.shape === 'request' ? { _request:request.data }
      : request.shape === 'query' ? { _request:{ query:request.data } }
      : request.shape === 'body' ? { _request:{ body:request.data } }
      : request.data;
    const body: Record<string, unknown> = { moduleId:request.moduleId, data:values, verbose:true };
    if (request.metadata) body.metadata = request.metadata;
    if (request.submissionId) body.submissionId = request.submissionId;
    if (request.save) body.save = true;
    if (request.validate) body.validate = true;
    if (request.hydrate) body.hydrateDataInitially = true;
    const sent: SseSent = { url, method:'PUT', headers, body };
    // Unqork allows long-running executions six minutes.
    const timer = setTimeout(() => controller.abort('timeout'), 360000);
    try {
      const response = await fetch(url, { method:'PUT', credentials:'include', headers, body:JSON.stringify(body), signal:controller.signal });
      const text = await response.text();
      const kept: Record<string, string> = {};
      response.headers.forEach((value, name) => { if (/^(x-assume-|x-service-log-id$|content-type$)/.test(name)) kept[name] = value; });
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch {}
      return { ok:response.ok, status:response.status, ms:elapsed(), headers:kept, body:parsed ?? null, ...(parsed === undefined ? { text:text.slice(0, 20000) } : {}), sent };
    } finally { clearTimeout(timer); }
  } catch (error) {
    // Stopping ends only the wait here: the server may still finish the run.
    const reason = controller.signal.aborted ? controller.signal.reason : undefined;
    return { ok:false, ms:elapsed(), headers:{}, body:null, error:reason === 'stopped' ? `You stopped waiting for this run. Unqork may still finish it on the server${request.save ? ' and save its result' : ''}.`
      : reason ? 'No response after six minutes, so Unqlock stopped waiting.'
      : 'The request did not reach Unqork: ' + ((error as Error)?.message || 'unknown error') + '.' };
  } finally {
    delete runs[runId];
  }
}

// Injected like readSseContext, so also self-contained: stops waiting for the run runSseExecute started under
// `runId` on this page. Stop can arrive while the run is still being checked, before runSseExecute is injected,
// so a run not here yet is marked, and stops as it starts.
export function stopSseExecute(runId: string): boolean {
  if (!runId) return false;
  const runs = ((globalThis as unknown as Record<symbol, Record<string, AbortController | 'stopped'> | undefined>)[Symbol.for('unqlock.sse.runs')] ??= {});
  const run = runs[runId];
  if (run && run !== 'stopped') run.abort('stopped');
  else runs[runId] = 'stopped';
  return true;
}

// The input JSON, which becomes the submission data the module runs with.
export type ParsedInput = { ok: true; data: Record<string, unknown>; fields: number } | { ok: false; message: string; line?: number };

export function parseInput(text: string): ParsedInput {
  if (!text.trim()) return { ok:true, data:{}, fields:0 };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok:false, message:'Input must be a JSON object, such as { "key": "value" }.' };
    return { ok:true, data, fields:Object.keys(data).length };
  } catch {
    // Browsers word the error differently and often leave the position out, so find it here.
    const position = breakAt(text);
    return { ok:false, message:position < text.length ? `Unexpected ${JSON.stringify(text[position])}` : 'The JSON ends too early', line:text.slice(0, position).split('\n').length };
  }
}

// Where JSON text stops being valid: a small recursive scanner that only follows the grammar.
function breakAt(text: string) {
  let index = 0;
  const space = () => { while (/[ \t\r\n]/.test(text[index] ?? '')) index++; };
  const fail = () => { throw index; };
  const literal = (word: string) => { if (text.startsWith(word, index)) index += word.length; else fail(); };
  function string() {
    index++;
    while (index < text.length && text[index] !== '"') {
      if (text[index] === '\\') {
        index++;
        if (text[index] === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) fail(); index += 4; }
        else if (!'"\\/bfnrt'.includes(text[index] ?? 'x')) fail();
      } else if (text[index] < ' ') fail();
      index++;
    }
    if (text[index] !== '"') fail();
    index++;
  }
  function value() {
    space();
    const char = text[index];
    if (char === '{' || char === '[') {
      const close = char === '{' ? '}' : ']';
      index++;
      space();
      if (text[index] === close) { index++; return; }
      for (;;) {
        if (close === '}') { space(); if (text[index] !== '"') fail(); string(); space(); if (text[index] !== ':') fail(); index++; }
        value();
        space();
        if (text[index] === ',') { index++; continue; }
        if (text[index] === close) { index++; return; }
        fail();
      }
    }
    if (char === '"') return string();
    if (char === 't') return literal('true');
    if (char === 'f') return literal('false');
    if (char === 'n') return literal('null');
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index));
    if (!number) fail();
    index += number![0].length;
  }
  try {
    value();
    space();
    return index < text.length ? index : text.length;
  } catch (position) { return position as number; }
}

export interface Problem { component?: string; message: string; detail?: string }
export interface ValidationProblem { key: string; label?: string; message: string }

// What a run came to, for the outcome line and the problem callout.
export interface Outcome {
  ok: boolean;
  status?: number;
  // Why the run failed, when it did.
  problem?: Problem;
  validation: ValidationProblem[];
  // x-assume-role: who the platform ran it as.
  ranAs?: string;
}

const text = (value: unknown) => typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value);

export function outcome(response: SseResponse): Outcome {
  const body = response.body && typeof response.body === 'object' ? response.body : {};
  const validation: ValidationProblem[] = (Array.isArray(body.validationErrors) ? body.validationErrors : []).map((item: Stored) => ({
    key:text(item?.id || item?.path || item?.key) || 'unknown',
    label:item?.label ? text(item.label) : undefined,
    message:text(item?.message) || 'Invalid'
  }));
  const ranAs = response.headers['x-assume-role'] || undefined;
  if (response.error) return { ok:false, problem:{ message:response.error }, validation, ranAs };
  const failure = body.executionError;
  let problem: Problem | undefined;
  if (failure && typeof failure === 'object') {
    problem = {
      component:failure.component ? text(failure.component) : undefined,
      message:text(failure.message) || 'The module stopped with an execution error.',
      detail:[failure.code !== undefined ? 'Code ' + text(failure.code) : '', failure.type ? text(failure.type) : '', failure.url ? text(failure.url) : ''].filter(Boolean).join(' · ') || undefined
    };
  } else if (!response.ok) {
    const message = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : response.text?.trim().slice(0, 300);
    const status = response.status;
    problem = {
      message:status === 401 || status === 440 ? 'Your Unqork session ended, so the module did not run. Sign in again in the builder tab, then run it again.'
        : status === 403 && /csrf/i.test(message || '') ? 'Unqork refused the request (CSRF check). Reload the builder tab, then run it again.'
        : message || 'Unqork answered ' + status + '.'
    };
  }
  return { ok:response.ok && !problem, status:response.status, problem, validation, ranAs };
}

// A fetch call that repeats the request in the builder tab's DevTools Console, where its cookies apply.
export function fetchSnippet(sent: SseSent) {
  return `await (await fetch(${JSON.stringify(sent.url)}, ${JSON.stringify({ method:sent.method, credentials:'include', headers:sent.headers, body:JSON.stringify(sent.body) }, null, 2)})).json()`;
}
