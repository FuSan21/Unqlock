import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { keptDays, keptRuns } from '@/lib/sse-history';
import { inputShapes, outcome as outcomeOf, parseInput, type IdentityMode, type InputShape, type SseContext, type SseRequest, type SseResponse } from '@/lib/sse-run';
import { buildTrace, duration } from '@/lib/sse-trace';
import { params } from '../runtime';
import { CopyId, RunResult, views, type ViewId } from './Result';
import { stamp, type Run } from './runs';
import type { StepsMode } from './Steps';
import { readContext, run as runModule, stop as stopRun, type TabEnvironment } from './tab';
import { useLocalState } from './useLocalState';
import { useRunHistory } from './useRunHistory';

const tab = Number(params().get('tab'));
const railKey = 'unqlock.sse.rail';
// The value search and setup switches, kept with the rail's width in this window's own storage.
const valuesKey = 'unqlock.sse.values';
const setupKey = 'unqlock.sse.hideSetup';
// Where the input goes, kept the same way.
const shapeKey = 'unqlock.sse.inputShape';
const railDefault = 340;

const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
// The environment's roles, keeping a chosen role the list lacks at the top, as Unqork's menu does.
const roleOptions = (roles: string[], current: string) => current && !roles.includes(current) ? [current, ...roles] : roles;
const clampRail = (width: number) => Math.round(Math.min(window.innerWidth * .6, Math.max(280, width)));

export function Debugger() {
  const [context, setContext] = useState<SseContext>();
  const [environment, setEnvironment] = useState<TabEnvironment>();
  const [unavailable, setUnavailable] = useState<string>();
  const [input, setInput] = useState('');
  const [shape, setShape] = useLocalState<InputShape>(shapeKey, stored => inputShapes.find(each => each.id === stored)?.id ?? 'data', value => value);
  const [submissionId, setSubmissionId] = useState('');
  const [validate, setValidate] = useState(false);
  const [hydrate, setHydrate] = useState(false);
  const [save, setSave] = useState(false);
  const [mode, setMode] = useState<IdentityMode>('designer');
  const [role, setRole] = useState('');
  const identityChosen = useRef(false);
  const history = useRunHistory();
  const { runs, keeping } = history;
  const [current, setCurrent] = useState<string>();
  const [running, setRunning] = useState(false);
  // The run in flight, which Stop ends the wait for.
  const active = useRef<string | undefined>(undefined);
  const [stopping, setStopping] = useState(false);
  const [confirm, setConfirm] = useState<{ text: ReactNode; action: string }>();
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<ViewId>('steps');
  const [stepsMode, setStepsMode] = useState<StepsMode>('lanes');
  const [filter, setFilter] = useState('');
  const [values, setValues] = useLocalState(valuesKey, stored => stored === 'true');
  const [hideSetup, setHideSetup] = useLocalState(setupKey, stored => stored === 'true');
  const [rerun, setRerun] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [rail, setRail] = useLocalState(railKey, stored => clampRail(Number(stored) || railDefault));
  const [railOpen, setRailOpen] = useState(false);
  const inputField = useRef<HTMLTextAreaElement>(null);
  const filterField = useRef<HTMLInputElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);

  const parsed = useMemo(() => parseInput(input), [input]);
  // The input is indented two spaces past the key it sits under.
  const wrapper = useMemo(() => {
    const chosen = inputShapes.find(each => each.id === shape)!;
    return { ...chosen, indent:/^ */.exec(chosen.before.split('\n').pop()!)![0].length + 2 };
  }, [shape]);
  const run = runs.find(entry => entry.id === current);

  // One navigation reports a new address and then a finished load, so loads can overlap; only the latest one
  // counts. Roles are fetched once per host.
  const loads = useRef(0);
  const roles = useRef<{ host: string; list: string[] } | undefined>(undefined);
  const load = useCallback(async () => {
    if (!Number.isInteger(tab) || tab <= 0) { setUnavailable('This window was opened without a builder tab. Open it from the Unqlock debugger button in Unqork’s dev overlay.'); return; }
    const id = ++loads.current;
    const known = roles.current?.host;
    const result = await readContext(tab, known);
    if (id !== loads.current) return;
    if (!result.ok) { setUnavailable(result.error); return; }
    const { host } = result.context;
    // A list that failed to load is asked for again next time.
    if (host !== known) roles.current = result.context.roles ? { host, list:result.context.roles } : undefined;
    setUnavailable(undefined);
    setContext({ ...result.context, roles:roles.current?.list });
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
    // Environments decides what is production and whether it may run, so its changes apply at once.
    const stored = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && changes.environment) load(); };
    api.tabs?.onUpdated?.addListener(updated);
    api.tabs?.onRemoved?.addListener(removed);
    api.storage?.onChanged?.addListener(stored);
    return () => { api.tabs?.onUpdated?.removeListener(updated); api.tabs?.onRemoved?.removeListener(removed); api.storage?.onChanged?.removeListener(stored); };
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
  // The input is as tall as its text, plus a horizontal scrollbar when a long line needs one, so the fixed
  // closing lines sit right under its last line rather than at the bottom of the box.
  useLayoutEffect(() => {
    const field = inputField.current;
    if (!field) return;
    field.style.height = '0';
    field.style.height = field.scrollHeight + (field.offsetHeight - field.clientHeight) + 'px';
  }, [input, wrapper, rail, railOpen]);
  // A narrower window keeps the rail within its share, and Expand and Collapse follow the new width.
  useEffect(() => {
    const resized = () => setRail(width => clampRail(width));
    window.addEventListener('resize', resized);
    return () => window.removeEventListener('resize', resized);
  }, []);
  // A confirmation approves only what it described: a new module, environment or save choice withdraws it.
  // A reload that finds the same module and environment leaves it be.
  useEffect(() => { setConfirm(undefined); }, [context?.moduleId, context?.host, environment?.kind, environment?.blocked, save, submissionId]);

  // Rerun puts a past run's input and options back in the rail, then runs once they are in place, after the
  // effect above, so a confirmation it asks for is not withdrawn at once.
  useEffect(() => { if (rerun) execute(); }, [rerun]);
  // A past run's input and the shape it went in, put back in the rail; opening a run does this, and Rerun
  // also restores its options and runs it.
  function restoreInput(request: SseRequest) {
    setInput(Object.keys(request.data).length ? JSON.stringify(request.data, null, 2) : '');
    setShape(inputShapes.some(each => each.id === request.shape) ? request.shape : 'data');
    setNotice('');
  }
  function runAgain(entry: Run) {
    const { request } = entry;
    restoreInput(request);
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
    const request: SseRequest = { url:context.url, moduleId:context.moduleId, data:parsed.data, shape, submissionId:submissionId.trim() || undefined, validate, hydrate, save, mode, role:role.trim() };
    const id = crypto.randomUUID();
    active.current = id;
    const result = await runModule(tab, request, production && confirmed, id);
    active.current = undefined;
    setStopping(false);
    const response: SseResponse = result.ok ? result.response : { ok:false, ms:0, headers:{}, body:null, error:result.error };
    const outcome = outcomeOf(response);
    const trace = buildTrace(response.body?.eventLog, outcome.problem);
    const entry: Run = { id, at:new Date(), title:context.title, moduleId:context.moduleId, request, response, outcome, trace };
    history.add(entry);
    setCurrent(entry.id);
    setSelected(trace.failure?.id);
    setRunning(false);
  }

  // Ends the wait for the run in flight; it comes back as a run that stopped, and Run module is focused again.
  async function stop() {
    const id = active.current;
    if (!id || stopping) return;
    setStopping(true);
    if (!await stopRun(tab, id) && active.current === id) {
      setStopping(false);
      setNotice('Couldn’t stop the run. The builder tab may have moved or closed; its run ends with it.');
    }
  }
  // Run module replaces Stop when the run ends; focus left with Stop moves to it rather than to the page.
  const ran = useRef(false);
  useEffect(() => {
    if (running) { ran.current = true; return; }
    if (ran.current && (!document.activeElement || document.activeElement === document.body)) runButton.current?.focus({ preventScroll:true });
    ran.current = false;
  }, [running]);

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
      // A held key repeats; only a fresh press may approve a confirmation.
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); if (event.repeat) return; if (confirm) execute(true); else execute(); return; }
      if (event.key === '/' && !typing(event.target)) { event.preventDefault(); filterField.current?.focus(); return; }
      if (event.altKey && /^[1-4]$/.test(event.key)) { event.preventDefault(); setView(views[Number(event.key) - 1][0]); return; }
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (running) { event.preventDefault(); stop(); }
        else if (confirm) { event.preventDefault(); cancelConfirm(); }
        else if (railOpen) { event.preventDefault(); setRailOpen(false); }
        else if (selected) { event.preventDefault(); setSelected(undefined); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  });

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

  const changes = run?.trace.sets ?? 0;

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
        {running ? (
          <button id="stop-run" type="button" className="run stop" disabled={stopping} title="Stop waiting for this run. Unqork may still finish it on the server." onClick={stop}>
            {stopping ? 'Stopping…' : 'Stop'} <kbd>Esc</kbd>
          </button>
        ) : (
          <button ref={runButton} id="run-module" type="button" className="run" disabled={!context || Boolean(unavailable) || Boolean(blockReason)} title={blockReason || undefined} onClick={() => execute()}>
            {save ? 'Run and save' : 'Run module'} <kbd>Ctrl ↵</kbd>
          </button>
        )}
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
          {/* The wrapper the input goes in is fixed and follows the shape; only its inside is edited, and it is kept across shapes. */}
          <div className="input-shape" role="group" aria-label="Input goes in">
            {inputShapes.map(each => <button key={each.id} type="button" aria-pressed={shape === each.id} onClick={() => setShape(each.id)}>{each.label}</button>)}
          </div>
          <div className="code-wrap" data-invalid={!parsed.ok || undefined} onClick={event => { if (event.target === event.currentTarget) inputField.current?.focus(); }}>
            <code className="code-fixed" aria-hidden="true" title="Always sent around the input">{wrapper.before}</code>
            <textarea ref={inputField} id="sse-input" className="code-input" wrap="off" spellCheck={false} aria-invalid={!parsed.ok} aria-describedby="sse-input-meta"
              style={{ paddingLeft:`calc(10px + ${wrapper.indent}ch)` }}
              placeholder={'{\n  "key": "value"\n}'} value={input} onChange={event => { setInput(event.target.value); setNotice(''); }} />
            <code className="code-fixed" aria-hidden="true">{wrapper.after}</code>
          </div>
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
          <div className="rail-head"><h2 id="runs-title">Runs</h2>{runs.length > 0 && <button type="button" className="link" title={keeping ? 'Remove every saved run' : undefined} onClick={() => { history.clear(); setCurrent(undefined); setSelected(undefined); }}>Clear</button>}</div>
          {runs.length ? (
            <ol>
              {runs.map(entry => (
                <li key={entry.id}>
                  <button type="button" className="run-entry" aria-current={entry.id === current} onClick={() => { setCurrent(entry.id); setSelected(entry.trace.failure?.id); restoreInput(entry.request); }}>
                    <span className="dot" aria-hidden="true" />
                    <span className="mono muted">{stamp(entry.at)}</span>
                    <span className="mono" data-state={entry.outcome.ok ? 'ok' : 'fail'}>{entry.response.status ?? '—'}</span>
                    <span className="mono muted">{duration(entry.response.ms)}</span>
                    {entry.moduleId !== context?.moduleId && <span className="other">{entry.title}</span>}
                  </button>
                  <button type="button" className="link rerun" disabled={!context || running || Boolean(unavailable) || Boolean(blockReason)}
                    aria-label={`Run again with the input from ${stamp(entry.at)}`} title="Run again with this run’s input and options" onClick={() => runAgain(entry)}>Rerun</button>
                </li>
              ))}
            </ol>
          ) : <p className="muted">{keeping ? `Your last ${keptRuns} runs appear here, kept for ${keptDays} days or until you clear them.` : 'Runs from this window appear here. They are kept only while it is open.'}</p>}
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
        {!unavailable && (run ? <RunResult run={run} view={view} setView={setView} stepsMode={stepsMode} setStepsMode={setStepsMode}
          filter={filter} setFilter={setFilter} values={values} setValues={setValues} hideSetup={hideSetup} setHideSetup={setHideSetup} filterField={filterField} selected={selected} setSelected={setSelected} changes={changes}
          showKey={showKey} showEvent={showEvent} current={context?.moduleId}
          onRerun={!context || running || unavailable || blockReason ? undefined : () => runAgain(run)} /> : context && !confirm && (
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
