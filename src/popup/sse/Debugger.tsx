import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { outcome as outcomeOf, parseInput, type IdentityMode, type Outcome, type SseContext, type SseRequest, type SseResponse } from '@/lib/sse-run';
import { buildTrace, duration, slowAfter, type Trace, type TraceEvent } from '@/lib/sse-trace';
import { params } from '../runtime';
import { Steps, type StepsMode } from './Steps';
import { readContext, run as runModule, type TabEnvironment } from './tab';
import { Changes, Empty, Output, Raw } from './views';

export interface Run {
  id: number;
  at: Date;
  title: string;
  moduleId: string;
  request: SseRequest;
  response: SseResponse;
  outcome: Outcome;
  trace: Trace;
}

type ViewId = 'steps' | 'changes' | 'output' | 'raw';
const views: [ViewId, string][] = [['steps', 'Steps'], ['changes', 'Changes'], ['output', 'Output'], ['raw', 'Raw']];

const tab = Number(params().get('tab'));
const railKey = 'unqlock.sse.rail';
// The value search and setup switches, kept with the rail's width in this window's own storage.
const valuesKey = 'unqlock.sse.values';
const setupKey = 'unqlock.sse.hideSetup';
const railDefault = 340;
// Runs are kept in this window only, never in extension storage: they hold submission data.
const kept = 10;
let runCount = 0;

const time = (date: Date) => date.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
// The environment's roles, keeping a chosen role the list lacks at the top, as Unqork's menu does.
const roleOptions = (roles: string[], current: string) => current && !roles.includes(current) ? [current, ...roles] : roles;
const clampRail = (width: number) => Math.round(Math.min(window.innerWidth * .6, Math.max(280, width)));

export function Debugger() {
  const [context, setContext] = useState<SseContext>();
  const [environment, setEnvironment] = useState<TabEnvironment>();
  const [unavailable, setUnavailable] = useState<string>();
  const [input, setInput] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [validate, setValidate] = useState(false);
  const [hydrate, setHydrate] = useState(false);
  const [save, setSave] = useState(false);
  const [mode, setMode] = useState<IdentityMode>('designer');
  const [role, setRole] = useState('');
  const identityChosen = useRef(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [current, setCurrent] = useState<number>();
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState<{ text: ReactNode; action: string }>();
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<ViewId>('steps');
  const [stepsMode, setStepsMode] = useState<StepsMode>('lanes');
  const [filter, setFilter] = useState('');
  const [values, setValues] = useState(() => localStorage.getItem(valuesKey) === 'true');
  const [hideSetup, setHideSetup] = useState(() => localStorage.getItem(setupKey) === 'true');
  const [rerun, setRerun] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [rail, setRail] = useState(() => clampRail(Number(localStorage.getItem(railKey)) || railDefault));
  const [railOpen, setRailOpen] = useState(false);
  const inputField = useRef<HTMLTextAreaElement>(null);
  const filterField = useRef<HTMLInputElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);

  const parsed = useMemo(() => parseInput(input), [input]);
  const run = runs.find(entry => entry.id === current);

  const load = useCallback(async () => {
    if (!Number.isInteger(tab) || tab <= 0) { setUnavailable('This window was opened without a builder tab. Open it from the Unqlock debugger button in Unqork’s dev overlay.'); return; }
    const result = await readContext(tab);
    if (!result.ok) { setUnavailable(result.error); return; }
    setUnavailable(undefined);
    setContext(result.context);
    setEnvironment(result.environment);
    // Start from Unqork's own Run as choice, until one is made here.
    if (!identityChosen.current) {
      setMode(result.context.identity.mode);
      setRole(result.context.identity.mode === 'express' ? result.context.identity.expressRole : result.context.identity.designerRole);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Follows the builder tab to the module it is on, and notices when it closes.
  useEffect(() => {
    const updated = (id: number, change: { url?: string; status?: string }) => { if (id === tab && (change.url || change.status === 'complete')) load(); };
    const removed = (id: number) => { if (id === tab) setUnavailable('The builder tab this window belongs to was closed. Open a module in the builder, then choose Open in Unqlock debugger in its dev overlay.'); };
    api.tabs?.onUpdated?.addListener(updated);
    api.tabs?.onRemoved?.addListener(removed);
    return () => { api.tabs?.onUpdated?.removeListener(updated); api.tabs?.onRemoved?.removeListener(removed); };
  }, [load]);

  // Firefox offers no full screen of its own for popup windows, so the page asks for it.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = () => {
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  };

  useEffect(() => { document.title = (context ? context.title + ' · ' : '') + 'Unqlock debugger'; }, [context]);
  useEffect(() => { localStorage.setItem(railKey, String(rail)); }, [rail]);
  useEffect(() => { localStorage.setItem(valuesKey, String(values)); }, [values]);
  useEffect(() => { localStorage.setItem(setupKey, String(hideSetup)); }, [hideSetup]);

  // A confirmation approves only what it described: a new module, environment or save choice withdraws it.
  useEffect(() => { setConfirm(undefined); }, [context, environment, save, submissionId]);

  // Rerun puts a past run's input and options back in the rail, then runs once they are in place, after the
  // effect above, so a confirmation it asks for is not withdrawn at once.
  useEffect(() => { if (rerun) execute(); }, [rerun]);
  function runAgain(entry: Run) {
    const { request } = entry;
    setInput(Object.keys(request.data).length ? JSON.stringify(request.data, null, 2) : '');
    setSubmissionId(request.submissionId ?? '');
    setValidate(request.validate === true);
    setHydrate(request.hydrate === true);
    setSave(request.save === true);
    identityChosen.current = true;
    setMode(request.mode);
    setRole(request.role);
    setNotice('');
    setRerun(count => count + 1);
  }

  const production = environment?.kind === 'production';
  const blockReason = environment?.blocked ? 'Production actions are turned off in Environments, so this module can’t run here.' : '';

  async function execute(confirmed = false) {
    if (!context || running || unavailable) return;
    if (!parsed.ok) {
      setNotice(`Fix the input first: ${parsed.message}${parsed.line ? ` (line ${parsed.line})` : ''}.`);
      setRailOpen(true);
      inputField.current?.focus();
      return;
    }
    if (blockReason) { setNotice(blockReason); return; }
    if (!confirmed && (production || save)) {
      const target = submissionId.trim();
      setConfirm({
        action:production ? (save ? 'Run and save on production' : 'Run on production') : 'Run and save',
        text:<>
          {production && <>This runs <b>{context.title}</b> on <b>production</b> ({context.host}). Its integrations and saves are real. </>}
          {save && (target ? <>The result is saved to submission <b className="mono">{target}</b>, replacing its data.</> : <>The result is saved to a new submission.</>)}
        </>
      });
      return;
    }
    setConfirm(undefined);
    setNotice('');
    setRunning(true);
    const request: SseRequest = { url:context.url, moduleId:context.moduleId, data:parsed.data, submissionId:submissionId.trim() || undefined, validate, hydrate, save, mode, role:role.trim() };
    const result = await runModule(tab, request, production && confirmed);
    const response: SseResponse = result.ok ? result.response : { ok:false, ms:0, headers:{}, body:null, error:result.error };
    const outcome = outcomeOf(response);
    const trace = buildTrace(response.body?.eventLog, outcome.problem);
    const entry: Run = { id:++runCount, at:new Date(), title:context.title, moduleId:context.moduleId, request, response, outcome, trace };
    setRuns(list => [entry, ...list].slice(0, kept));
    setCurrent(entry.id);
    setSelected(trace.events.find(event => event.kind === 'fail')?.id);
    setRunning(false);
  }

  function cancelConfirm() {
    setConfirm(undefined);
    runButton.current?.focus();
  }

  // Shows a component in Steps: its failure if it has one, otherwise its last event.
  function showKey(key: string) {
    if (!run) return;
    const events = run.trace.events.filter(event => event.key === key);
    const target = events.find(event => event.kind === 'fail') || events[events.length - 1];
    setView('steps');
    setStepsMode('lanes');
    setFilter('');
    setSelected(target?.id);
  }

  function showEvent(id: string) {
    setView('steps');
    setStepsMode('lanes');
    setFilter('');
    setSelected(id);
  }

  // Ctrl/Cmd+Enter runs, / filters, Alt+1–4 switch views, Escape backs out of a confirmation.
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (confirm) execute(true); else execute(); return; }
      if (event.key === '/' && !typing(event.target)) { event.preventDefault(); filterField.current?.focus(); return; }
      if (event.altKey && /^[1-4]$/.test(event.key)) { event.preventDefault(); setView(views[Number(event.key) - 1][0]); return; }
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (confirm) { event.preventDefault(); cancelConfirm(); }
        else if (railOpen) { event.preventDefault(); setRailOpen(false); }
        else if (selected) { event.preventDefault(); setSelected(undefined); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  });

  function tabKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const index = views.findIndex(([id]) => id === view);
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -2;
    if (next === -2) return;
    event.preventDefault();
    const id = views[(next + views.length) % views.length][0];
    setView(id);
    document.getElementById('view-tab-' + id)?.focus();
  }

  function format() {
    if (!parsed.ok || !input.trim()) return;
    setInput(JSON.stringify(parsed.data, null, 2));
  }

  // The rail's edge: drag it, or arrow keys while it has focus.
  function resizeStart(event: React.PointerEvent<HTMLDivElement>) {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    handle.dataset.dragging = '';
    const move = (moved: PointerEvent) => setRail(clampRail(moved.clientX));
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', () => { handle.removeEventListener('pointermove', move); delete handle.dataset.dragging; }, { once:true });
  }
  function resizeKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setRail(width => clampRail(width + (event.key === 'ArrowRight' ? 24 : -24)));
  }
  const expanded = rail >= window.innerWidth * .45;

  const changes = run?.trace.events.filter(event => event.kind === 'set').length ?? 0;

  return (
    <div className="app" style={{ ['--rail' as string]:rail + 'px' }} data-rail={railOpen ? 'open' : undefined}>
      <header className="runbar">
        <img className="brand" src="/icons/icon-32.png" width="22" height="22" alt="" />
        <div className="module">
          <h1 className="module-title" title={context?.title}>{context?.title || 'Unqlock debugger'}</h1>
          {context && <CopyId id={context.moduleId} />}
          {environment && <span className="env" data-kind={environment.kind}>{environment.kind === 'production' ? 'Production' : environment.label}</span>}
        </div>
        <button type="button" className="input-toggle" aria-expanded={railOpen} aria-controls="request-rail" onClick={() => setRailOpen(!railOpen)}>
          Input{parsed.ok ? ` · ${parsed.fields} ${parsed.fields === 1 ? 'field' : 'fields'}` : ' · invalid'}
        </button>
        {document.fullscreenEnabled && <button type="button" id="sse-fullscreen" className="native" aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>}
        <fieldset className="runas">
          <legend>Run as</legend>
          <select aria-label="Identity" value={mode} onChange={event => { identityChosen.current = true; setMode(event.target.value as IdentityMode); if (context) setRole(event.target.value === 'express' ? context.identity.expressRole : context.identity.designerRole); }}>
            <option value="designer">Designer</option>
            <option value="express">Express</option>
          </select>
          {context?.roles ? (
            <select aria-label="Role" value={role} onChange={event => { identityChosen.current = true; setRole(event.target.value); }}>
              {/* Express runs as the signed-in account's own roles unless one is picked to impersonate. */}
              {mode === 'express' && <option value="">Account’s own role</option>}
              {roleOptions(context.roles, role).map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <input aria-label="Role" placeholder={mode === 'express' ? 'Express role' : 'Role'} value={role} spellCheck={false}
              title={context ? 'Couldn’t load the environment’s roles. The role typed here is the one sent.' : undefined}
              onChange={event => { identityChosen.current = true; setRole(event.target.value); }} />
          )}
        </fieldset>
        <button ref={runButton} id="run-module" type="button" className="run" disabled={!context || running || Boolean(unavailable) || Boolean(blockReason)} title={blockReason || undefined} onClick={() => execute()}>
          {running ? 'Running…' : save ? 'Run and save' : 'Run module'} <kbd>Ctrl ↵</kbd>
        </button>
      </header>
      <div className="progress" data-running={running ? '' : undefined} aria-hidden="true" />

      <aside id="request-rail" className="rail" aria-label="Request">
        <div className="resizer" role="separator" aria-orientation="vertical" aria-label="Resize request panel" aria-valuenow={rail} aria-valuemin={280} tabIndex={0}
          onPointerDown={resizeStart} onKeyDown={resizeKey} onDoubleClick={() => setRail(railDefault)} />
        <section className="request">
          <div className="rail-head">
            <h2><label htmlFor="sse-input">Input</label></h2>
            <div className="rail-actions">
              <button type="button" className="link" disabled={!parsed.ok || !input.trim()} onClick={format}>Format</button>
              <button type="button" className="link" aria-pressed={expanded} onClick={() => setRail(expanded ? railDefault : clampRail(window.innerWidth * .5))}>{expanded ? 'Collapse' : 'Expand'}</button>
            </div>
          </div>
          <textarea ref={inputField} id="sse-input" className="code-input" wrap="off" spellCheck={false} aria-invalid={!parsed.ok} aria-describedby="sse-input-meta"
            placeholder={'{\n  "key": "value"\n}'} value={input} onChange={event => { setInput(event.target.value); setNotice(''); }} />
          <p id="sse-input-meta" className="input-meta" data-state={parsed.ok ? 'ok' : 'error'}>
            {parsed.ok
              ? <><span>{input.trim() ? 'Valid JSON' : 'Empty: runs with no data'}</span><span>{parsed.fields} {parsed.fields === 1 ? 'field' : 'fields'}</span></>
              : <span>{parsed.message}{parsed.line ? ` · line ${parsed.line}` : ''}</span>}
          </p>
          <label className="field">Submission ID <input id="sse-submission" className="mono" placeholder="None: runs without a submission" spellCheck={false} value={submissionId} onChange={event => setSubmissionId(event.target.value)} /></label>
          <fieldset className="options">
            <legend className="visually-hidden">Execute options</legend>
            <label><input type="checkbox" checked={validate} onChange={event => setValidate(event.target.checked)} /> Validate after running</label>
            <label><input type="checkbox" checked={hydrate} onChange={event => setHydrate(event.target.checked)} /> Fill data before running</label>
            <label><input id="sse-save" type="checkbox" checked={save} onChange={event => setSave(event.target.checked)} /> Save to submission</label>
          </fieldset>
        </section>
        <section className="runs" aria-labelledby="runs-title">
          <div className="rail-head"><h2 id="runs-title">Runs</h2>{runs.length > 0 && <button type="button" className="link" onClick={() => { setRuns([]); setCurrent(undefined); setSelected(undefined); }}>Clear</button>}</div>
          {runs.length ? (
            <ol>
              {runs.map(entry => (
                <li key={entry.id}>
                  <button type="button" className="run-entry" aria-current={entry.id === current} onClick={() => { setCurrent(entry.id); setSelected(entry.trace.events.find(event => event.kind === 'fail')?.id); }}>
                    <span className="dot" aria-hidden="true" />
                    <span className="mono muted">{time(entry.at)}</span>
                    <span className="mono" data-state={entry.outcome.ok ? 'ok' : 'fail'}>{entry.response.status ?? '—'}</span>
                    <span className="mono muted">{duration(entry.response.ms)}</span>
                    {entry.moduleId !== context?.moduleId && <span className="other">{entry.title}</span>}
                  </button>
                  <button type="button" className="link rerun" disabled={!context || running || Boolean(unavailable) || Boolean(blockReason)}
                    aria-label={`Run again with the input from ${time(entry.at)}`} title="Run again with this run’s input and options" onClick={() => runAgain(entry)}>Rerun</button>
                </li>
              ))}
            </ol>
          ) : <p className="muted">Runs from this window appear here. They are kept only while it is open.</p>}
        </section>
      </aside>

      <main className="result" aria-label="Result">
        {unavailable ? (
          <div className="state" role="alert">
            <p>{unavailable}</p>
            <button type="button" className="secondary" onClick={load}>Reconnect</button>
          </div>
        ) : confirm ? (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-text" data-production={production || undefined}>
            <p id="confirm-text">{confirm.text}</p>
            <div className="confirm-actions">
              <button type="button" className="run" autoFocus onClick={() => execute(true)}>{confirm.action}</button>
              <button type="button" className="secondary" onClick={cancelConfirm}>Cancel</button>
            </div>
          </div>
        ) : null}
        {notice && <p className="notice" role="alert">{notice}</p>}
        {!unavailable && (run ? <RunResult run={run} view={view} setView={setView} tabKeys={tabKeys} stepsMode={stepsMode} setStepsMode={setStepsMode}
          filter={filter} setFilter={setFilter} values={values} setValues={setValues} hideSetup={hideSetup} setHideSetup={setHideSetup} filterField={filterField} selected={selected} setSelected={setSelected} changes={changes}
          showKey={showKey} showEvent={showEvent} current={context?.moduleId} /> : context && !confirm && (
          <div className="state">
            <p>Run <b>{context.title}</b> on the server to see each step. {parsed.ok && !parsed.fields ? 'The input is empty, so it runs with no data.' : 'It runs with the input on the left.'}</p>
            <button type="button" className="run" disabled={running || Boolean(blockReason)} onClick={() => execute()}>{save ? 'Run and save' : 'Run module'}</button>
            {blockReason && <p className="muted">{blockReason}</p>}
          </div>
        ))}
      </main>
    </div>
  );
}

// The full module ID, which copies on click; the confirmation appears beside it, so the ID stays in view.
function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button type="button" className="module-id mono" title="Copy module ID" onClick={() => navigator.clipboard.writeText(id).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})}>{id}</button>
      <span className="copied" role="status">{copied ? 'Copied' : ''}</span>
    </>
  );
}

interface ResultProps {
  run: Run;
  view: ViewId;
  setView: (view: ViewId) => void;
  tabKeys: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  stepsMode: StepsMode;
  setStepsMode: (mode: StepsMode) => void;
  filter: string;
  setFilter: (filter: string) => void;
  values: boolean;
  setValues: (values: boolean) => void;
  hideSetup: boolean;
  setHideSetup: (hide: boolean) => void;
  filterField: React.RefObject<HTMLInputElement | null>;
  selected?: string;
  setSelected: (id?: string) => void;
  changes: number;
  showKey: (key: string) => void;
  showEvent: (id: string) => void;
  current?: string;
}

function RunResult({ run, view, setView, tabKeys, stepsMode, setStepsMode, filter, setFilter, values, setValues, hideSetup, setHideSetup, filterField, selected, setSelected, changes, showKey, showEvent, current }: ResultProps) {
  const { outcome, response, trace } = run;
  const failure = trace.events.find(event => event.kind === 'fail');
  const setupLanes = trace.lanes.filter(lane => lane.setup).length;
  return (
    <>
      <OutcomeLine run={run} onShow={showEvent} />
      {run.moduleId !== current && <p className="notice">This run was for <b>{run.title}</b>, not the module the builder tab is on now.</p>}
      {(outcome.problem || outcome.validation.length > 0) && (
        <div className="callout" role="alert">
          <div>
            {outcome.problem ? (
              <p>
                {outcome.problem.component ? <><strong className="mono">{outcome.problem.component}</strong> stopped the run{failure ? ` in step ${failure.step}` : ''}.</> : <strong>The run failed.</strong>}
                {run.request.save && ' Nothing was saved.'}
                <span className="message mono">{outcome.problem.message}{outcome.problem.detail ? ' · ' + outcome.problem.detail : ''}</span>
              </p>
            ) : (
              <p><strong>{outcome.validation.length} validation {outcome.validation.length === 1 ? 'error' : 'errors'}</strong>
                <span className="message mono">{outcome.validation.slice(0, 3).map(item => `${item.key}: ${item.message}`).join(' · ')}{outcome.validation.length > 3 ? ' · …' : ''}</span>
              </p>
            )}
          </div>
          {outcome.problem?.component && failure ? <button type="button" className="link" onClick={() => showEvent(failure.id)}>Show in steps</button>
            : outcome.validation.length > 0 && <button type="button" className="link" onClick={() => setView('output')}>Show in output</button>}
        </div>
      )}
      <div className="viewbar">
        <div className="tabs" role="tablist" aria-label="Run views" onKeyDown={tabKeys}>
          {views.map(([id, name], index) => (
            <button key={id} id={'view-tab-' + id} type="button" role="tab" aria-selected={view === id} aria-controls="view-panel" tabIndex={view === id ? 0 : -1}
              title={`${name} (Alt+${index + 1})`} onClick={() => setView(id)}>
              {name}{id === 'changes' && <span className="count">{changes}</span>}
            </button>
          ))}
        </div>
        {view === 'steps' && (
          <div className="mode" role="group" aria-label="Steps layout">
            <button type="button" aria-pressed={stepsMode === 'lanes'} onClick={() => setStepsMode('lanes')}>Lanes</button>
            <button type="button" aria-pressed={stepsMode === 'list'} onClick={() => setStepsMode('list')}>List</button>
          </div>
        )}
        {view === 'steps' && setupLanes > 0 && (
          <button type="button" className="switch" aria-pressed={hideSetup} title="Hide components whose only events are values set during setup" onClick={() => setHideSetup(!hideSetup)}>
            Hide setup values <span className="count">{setupLanes}</span>
          </button>
        )}
        {view !== 'raw' && (
          <div className="filter">
            <input ref={filterField} type="search" placeholder={values ? 'Filter keys and values' : 'Filter keys'}
              aria-label={values ? 'Filter component keys and values' : 'Filter component keys'} value={filter} spellCheck={false} onChange={event => setFilter(event.target.value)} />
            <kbd aria-hidden="true">/</kbd>
          </div>
        )}
        {view !== 'raw' && (
          <button type="button" className="switch" aria-pressed={values} title="Also match the values components set" onClick={() => setValues(!values)}>In values</button>
        )}
      </div>
      <div id="view-panel" className="panel" role="tabpanel" aria-labelledby={'view-tab-' + view}>
        {view === 'steps' && <Steps trace={trace} filter={filter} values={values} hideSetup={hideSetup} mode={stepsMode} selected={selected} onSelect={setSelected} />}
        {view === 'changes' && <div className="view"><Changes run={run} filter={filter} values={values} onShow={showEvent} /></div>}
        {view === 'output' && <div className="view"><Output run={run} filter={filter} values={values} onShow={showKey} /></div>}
        {view === 'raw' && <div className="view"><Raw run={run} /></div>}
      </div>
      {view === 'steps' && stepsMode === 'lanes' && trace.events.length > 0 && <Legend />}
      {response.status === undefined && !trace.events.length && <Empty>No response came back, so there is nothing to show.</Empty>}
    </>
  );
}

// The slowest of the run's slow events, which the outcome line links to.
const slowest = (events: TraceEvent[]) => events.filter(event => event.slow).sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

function OutcomeLine({ run, onShow }: { run: Run; onShow: (id: string) => void }) {
  const { outcome, response, trace } = run;
  const failure = trace.events.find(event => event.kind === 'fail');
  const sets = trace.events.filter(event => event.kind === 'set').length;
  const parts: ReactNode[] = [];
  if (outcome.problem?.component) parts.push(<>Stopped at <b className="mono">{outcome.problem.component}</b></>);
  else if (outcome.validation.length) parts.push(`${outcome.validation.length} validation ${outcome.validation.length === 1 ? 'error' : 'errors'}`);
  else if (!outcome.ok) parts.push(outcome.problem?.message.split('. ')[0] || 'Failed');
  if (outcome.ranAs) parts.push(<>{parts.length ? 'ran' : 'Ran'} as <b>{outcome.ranAs}</b></>);
  if (response.status !== undefined) parts.push(duration(response.ms));
  if (trace.steps.length) parts.push(failure ? `step ${failure.step} of ${trace.steps.length}` : `${trace.steps.length} ${trace.steps.length === 1 ? 'step' : 'steps'}`);
  if (outcome.ok) parts.push(`${sets} ${sets === 1 ? 'value' : 'values'} set`);
  if (outcome.ok && !outcome.ranAs) parts.unshift('Ran');
  const slow = slowest(trace.events);
  if (slow.length) parts.push(<button type="button" className="link slow-link" title={`Show the slowest: ${slow[0].key}, ${duration(slow[0].ms)}`} onClick={() => onShow(slow[0].id)}>{slow.length} slow</button>);
  return (
    <p className="outcome" data-state={outcome.ok ? 'ok' : 'fail'} role="status" aria-live="polite">
      <span className="status">{response.status ?? 'No response'}</span>
      <span>{parts.map((part, index) => <span key={index}>{index > 0 && <span className="sep"> · </span>}{part}</span>)}</span>
    </p>
  );
}

function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <span><i className="glyph" data-kind="set" />Set a value</span>
      <span><i className="glyph" data-kind="ran" />Ran</span>
      <span><i className="glyph-wait" data-kind="wait" />Ran and waited</span>
      <span><i className="glyph" data-kind="queued" />Queued</span>
      <span><i className="glyph" data-kind="fail" />Failed</span>
      <span><i className="glyph" data-kind="other" />Other</span>
      <span><span className="slow">Slow</span>{`Run over ${duration(slowAfter.ran)}, wait over ${duration(slowAfter.wait)}`}</span>
    </div>
  );
}
