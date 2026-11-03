import { api } from '@/lib/api';
import * as DevOverlay from '@/lib/dev-overlay';
import * as Environment from '@/lib/environment';
import { inputShapes, readSseContext, runSseExecute, stopSseExecute, type SseContext, type SseRequest, type SseResponse } from '@/lib/sse-run';

// The debugger window reads and runs its builder tab itself, through the extension APIs every extension page
// has, rather than through the background: a Manifest V3 background stops when idle (Chrome's service worker,
// Firefox's event page), and a message sent while it stops or restarts fails with "Receiving end does not
// exist", as can a long run that outlasts it.
export interface TabEnvironment { kind: string; label: string; blocked: boolean }
export type ContextResult = { ok: true; context: SseContext; environment: TabEnvironment } | { ok: false; error: string };
export type RunResult = { ok: true; response: SseResponse } | { ok: false; error: string };

const closed = 'The builder tab this window belongs to was closed. Open a module in the builder, then choose Open in Unqlock debugger in its dev overlay.';

async function settings() {
  return Environment.settings((await api.storage.local.get('environment')).environment);
}

// Checks shared by both: the tab exists, the unqork.io grant is held, and the tab is still on Unqork. The
// grant lets the browser report the tab's address; a tab elsewhere reports none or another host, and nothing
// is injected into it.
async function builderTab(tabId: number): Promise<string | undefined> {
  const tab = await api.tabs.get(tabId).catch(() => undefined);
  if (!tab) return closed;
  if (!await api.permissions.contains({ origins:DevOverlay.matches })) return 'Unqlock no longer has access to unqork.io sites. Turn on Unqlock SSE debugger under Debug tools again.';
  let host = '';
  try { const address = new URL(tab.url || ''); if (address.protocol === 'https:') host = address.hostname; } catch {}
  if (!host.endsWith('.unqork.io')) return 'The builder tab is no longer on Unqork. Open a module in the builder there.';
}

export async function readContext(tabId: number, knownHost?: string): Promise<ContextResult> {
  try {
    const problem = await builderTab(tabId);
    if (problem) return { ok:false, error:problem };
    const [result] = await api.scripting.executeScript({ target:{ tabId }, world:'MAIN', func:readSseContext, args:[knownHost ?? ''] });
    const context = result?.result as SseContext | { error: string } | undefined;
    if (!context || 'error' in context) return { ok:false, error:context?.error || 'Could not read the builder tab.' };
    if (!context.host.endsWith('.unqork.io')) return { ok:false, error:'The builder tab is no longer on Unqork. Open a module in the builder there.' };
    const config = await settings();
    const environment = Environment.detect(context.url, config);
    return { ok:true, context, environment:{ kind:environment.kind, label:environment.label, blocked:environment.kind === 'production' && config.blockProduction } };
  } catch (error) { return { ok:false, error:(error as Error).message || 'Could not read the builder tab.' }; }
}

// Runs the module, applying the production rules Debug tools uses: none while Environments blocks production
// actions, otherwise only with a confirmation for this run.
// `runId` names the run so stop can end the wait for it.
export async function run(tabId: number, request: SseRequest, productionConfirmed: boolean, runId = ''): Promise<RunResult> {
  try {
    if (!request || typeof request.url !== 'string' || typeof request.moduleId !== 'string' || !request.data || typeof request.data !== 'object' || Array.isArray(request.data)
      || !inputShapes.some(shape => shape.id === request.shape) || !['designer', 'express'].includes(request.mode) || typeof request.role !== 'string' || request.role.length > 200) return { ok:false, error:'That run request is not valid.' };
    let target: URL;
    try { target = new URL(request.url); } catch { return { ok:false, error:'That run request is not valid.' }; }
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.unqork.io')) return { ok:false, error:'That run request is not valid.' };
    const problem = await builderTab(tabId);
    if (problem) return { ok:false, error:problem };
    const config = await settings();
    if (Environment.detect(request.url, config).kind === 'production') {
      if (config.blockProduction) return { ok:false, error:'Production actions are turned off in Environments.' };
      if (productionConfirmed !== true) return { ok:false, error:'Confirm the production run again.' };
    }
    const [result] = await api.scripting.executeScript({ target:{ tabId }, world:'MAIN', func:runSseExecute, args:[request, runId] });
    if (!result?.result) return { ok:false, error:'The builder tab did not answer. Reload it and try again.' };
    return { ok:true, response:result.result as SseResponse };
  } catch (error) { return { ok:false, error:(error as Error).message || 'The run did not start.' }; }
}

// Stops waiting for a run in flight. Unqork may still finish it on the server. False when the tab no longer
// holds it, as after the tab closed, moved or the run ended.
export async function stop(tabId: number, runId: string): Promise<boolean> {
  try {
    if (await builderTab(tabId)) return false;
    const [result] = await api.scripting.executeScript({ target:{ tabId }, world:'MAIN', func:stopSseExecute, args:[runId] });
    return result?.result === true;
  } catch { return false; }
}
