// The result of a run: its outcome line, the problem callout and the four views of what it did.
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { duration, slowAfter, type TraceEvent } from '@/lib/sse-trace';
import { failedStep, firstFailure, type Run } from './runs';
import { Steps, type StepsMode } from './Steps';
import { Changes, Empty, Output, Raw, useCopy } from './views';

export type ViewId = 'steps' | 'changes' | 'output' | 'raw';
export const views: [ViewId, string][] = [['steps', 'Steps'], ['changes', 'Changes'], ['output', 'Output'], ['raw', 'Raw']];

// The full module ID, which copies on click; the confirmation appears beside it, so the ID stays in view.
export function CopyId({ id }: { id: string }) {
  const [copied, copy] = useCopy();
  return (
    <>
      <button type="button" className="module-id mono" title="Copy module ID" onClick={() => copy(id)}>{id}</button>
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
  filterField: RefObject<HTMLInputElement | null>;
  selected?: string;
  setSelected: (id?: string) => void;
  changes: number;
  showKey: (key: string) => void;
  showEvent: (id: string) => void;
  current?: string;
  // Absent while a run cannot start.
  onRerun?: () => void;
}

export function RunResult({ run, view, setView, tabKeys, stepsMode, setStepsMode, filter, setFilter, values, setValues, hideSetup, setHideSetup, filterField, selected, setSelected, changes, showKey, showEvent, current, onRerun }: ResultProps) {
  const { outcome, response, trace } = run;
  // A trimmed run's views give way to a note, so it has no step to show.
  const failure = run.summary ? undefined : firstFailure(trace);
  const step = failedStep(run);
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
                {outcome.problem.component ? <><strong className="mono">{outcome.problem.component}</strong> stopped the run{step ? ` in step ${step}` : ''}.</> : <strong>The run failed.</strong>}
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
      {run.saved === 'trimmed' && <p className="notice">This run is too large to save in full. Once this window closes, only its input, options and result are kept.</p>}
      {run.saved === 'none' && <p className="notice">This run is too large to save, so it is gone once this window closes.</p>}
      {run.trimmed ? (
        <div className="state trimmed">
          <p><b>Steps, changes, output and the raw response weren’t saved for this run.</b> They were too large for the browser’s storage, so only its input, options and result were kept. Rerun it to see them again.</p>
          <button type="button" className="run" disabled={!onRerun} onClick={onRerun}>Rerun</button>
        </div>
      ) : <>
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
      </>}
    </>
  );
}

// The slowest of the run's slow events, which the outcome line links to.
const slowest = (events: TraceEvent[]) => events.filter(event => event.slow).sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0));

function OutcomeLine({ run, onShow }: { run: Run; onShow: (id: string) => void }) {
  const { outcome, response, trace } = run;
  const failed = failedStep(run);
  const steps = run.summary?.steps ?? trace.steps.length;
  const sets = run.summary?.sets ?? trace.events.filter(event => event.kind === 'set').length;
  const parts: ReactNode[] = [];
  if (outcome.problem?.component) parts.push(<>Stopped at <b className="mono">{outcome.problem.component}</b></>);
  else if (outcome.validation.length) parts.push(`${outcome.validation.length} validation ${outcome.validation.length === 1 ? 'error' : 'errors'}`);
  else if (!outcome.ok) parts.push(outcome.problem?.message.split('. ')[0] || 'Failed');
  if (outcome.ranAs) parts.push(<>{parts.length ? 'ran' : 'Ran'} as <b>{outcome.ranAs}</b></>);
  if (response.status !== undefined) parts.push(duration(response.ms));
  if (steps) parts.push(failed ? `step ${failed} of ${steps}` : `${steps} ${steps === 1 ? 'step' : 'steps'}`);
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
