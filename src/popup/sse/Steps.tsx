import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { chain, describe, duration, path, type Trace, type TraceEvent } from '@/lib/sse-trace';
import { CopyButton, Empty, Glyph, JsonTree, matches } from './views';

export type StepsMode = 'lanes' | 'list';

interface StepsProps {
  trace: Trace;
  filter: string;
  mode: StepsMode;
  selected?: string;
  onSelect: (id?: string) => void;
}

// Steps: the event log as lanes (one per component, one column per step) or as a list, with the
// inspector for the selected event.
export function Steps({ trace, filter, mode, selected, onSelect }: StepsProps) {
  const event = selected ? trace.byId.get(selected) : undefined;
  if (!trace.events.length) return <Empty>Unqork returned no event log for this run. The Raw view has the full response.</Empty>;
  return (
    <div className="work" data-inspector={event ? 'open' : 'closed'}>
      <div className="view" id="steps-view">
        {mode === 'lanes' ? <Lanes trace={trace} filter={filter} selected={selected} onSelect={onSelect} /> : <List trace={trace} filter={filter} selected={selected} onSelect={onSelect} />}
      </div>
      {event && <Inspector trace={trace} event={event} onSelect={onSelect} />}
    </div>
  );
}

const label = (event: TraceEvent) => `${event.key} ${describe(event)} in step ${event.step}`;

function Mark({ event, lane, selected, related, focusable, onSelect }: { event: TraceEvent; lane: number; selected: boolean; related: boolean; focusable: boolean; onSelect: (id: string) => void }) {
  const wait = event.kind === 'wait';
  return (
    <button type="button" className={wait ? 'wait' : 'mark'} data-kind={event.kind} data-event={event.id} data-lane={lane} data-step={event.step}
      data-failed={wait && event.open ? '' : undefined} data-related={related ? '' : undefined} aria-pressed={selected} aria-label={label(event)} title={label(event)}
      tabIndex={focusable ? 0 : -1} onClick={() => onSelect(event.id)}>
      {wait && <span>{event.open ? 'no finish' : duration(event.ms)}</span>}
    </button>
  );
}

function Lanes({ trace, filter, selected, onSelect }: Omit<StepsProps, 'mode'>) {
  const grid = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<string[]>([]);
  const [size, setSize] = useState({ width:0, height:0 });
  const lanes = trace.lanes.filter(lane => matches(lane.key, filter));
  // Each lane's occupied steps only: a big module renders one node per event, not one per lane and step.
  const cells = useMemo(() => {
    const map = new Map<string, Map<number, TraceEvent[]>>();
    for (const event of trace.events) {
      const row = map.get(event.key) || new Map<number, TraceEvent[]>();
      row.set(event.step, [...(row.get(event.step) || []), event]);
      map.set(event.key, row);
    }
    return new Map([...map].map(([key, row]) => [key, [...row].sort(([a], [b]) => a - b).map(([step, events]) => ({ step, events }))]));
  }, [trace]);
  const related = useMemo(() => selected ? chain(trace, selected) : undefined, [trace, selected]);
  const relatedLanes = useMemo(() => new Set(related ? [...related].map(id => trace.byId.get(id)!.key) : []), [trace, related]);
  const focusable = selected && trace.byId.has(selected) ? selected : lanes.length ? cells.get(lanes[0].key)?.[0]?.events[0]?.id : undefined;

  // Cause threads: a line from each event in the selected chain to the event that follows from it.
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const draw = () => {
      setSize({ width:element.scrollWidth, height:element.scrollHeight });
      if (!related) { setThreads([]); return; }
      const box = element.getBoundingClientRect();
      const rect = (id: string) => element.querySelector(`[data-event="${id}"]`)?.getBoundingClientRect();
      const lines: string[] = [];
      for (const id of related) {
        const event = trace.byId.get(id);
        if (!event?.cause || !related.has(event.cause)) continue;
        const from = rect(event.cause), to = rect(id);
        if (!from || !to) continue;
        const y1 = from.top - box.top + from.height / 2, y2 = to.top - box.top + to.height / 2;
        if (Math.abs(y1 - y2) < 2) {
          // The same lane: a straight line across steps; marks side by side in one cell need none.
          const x1 = from.right - box.left, x2 = to.left - box.left;
          if (x2 - x1 > 12) lines.push(`M${x1} ${y1} L ${x2} ${y2}`);
          continue;
        }
        if (Math.abs(from.left - to.left) < 12) {
          // Same step: bow out to the right rather than through the marks.
          const x1 = from.right - box.left, x2 = to.right - box.left, bulge = Math.max(x1, x2) + 16;
          lines.push(`M${x1} ${y1} C ${bulge} ${y1}, ${bulge} ${y2}, ${x2} ${y2}`);
        } else {
          const x1 = from.right - box.left - 2, x2 = to.left - box.left + 2, mid = Math.max(24, (x2 - x1) / 2);
          lines.push(`M${x1} ${y1} C ${x1 + mid} ${y1}, ${x2 - mid} ${y2}, ${x2} ${y2}`);
        }
      }
      setThreads(lines);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [trace, related, filter]);

  // Keeps the selected mark in view, vertically only: sideways would slide it under the component column.
  useEffect(() => {
    const view = grid.current?.parentElement;
    const mark = selected ? grid.current?.querySelector(`[data-event="${selected}"]`) : null;
    if (!view || !mark) return;
    const r = mark.getBoundingClientRect(), v = view.getBoundingClientRect();
    if (r.bottom > v.bottom || r.top < v.top + 60) view.scrollTop += r.top - v.top - v.height / 2;
  }, [selected]);

  // Arrow keys move between marks: left and right in reading order, up and down to the nearest mark in
  // the lane above or below.
  function key(event: KeyboardEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-event]');
    if (!target || !grid.current) return;
    const marks = [...grid.current.querySelectorAll<HTMLElement>('[data-event]')];
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = marks[marks.indexOf(target) + (event.key === 'ArrowRight' ? 1 : -1)];
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const lane = Number(target.dataset.lane), at = Number(target.dataset.step), step = event.key === 'ArrowDown' ? 1 : -1;
      for (let row = lane + step; row >= 0 && row < lanes.length && !next; row += step) {
        const candidates = marks.filter(mark => Number(mark.dataset.lane) === row);
        next = candidates.sort((a, b) => Math.abs(Number(a.dataset.step) - at) - Math.abs(Number(b.dataset.step) - at))[0];
      }
    } else if (event.key === 'Escape' && selected) { event.preventDefault(); event.stopPropagation(); onSelect(undefined); return; }
    else return;
    event.preventDefault();
    if (!next) return;
    marks.forEach(mark => { mark.tabIndex = mark === next ? 0 : -1; });
    next.focus();
  }

  if (!lanes.length) return <Empty>No components match “{filter}”.</Empty>;
  return (
    <div ref={grid} className="lanes" data-focused={related ? '' : undefined} role="grid" aria-label="Steps by component" aria-rowcount={lanes.length + 1}
      style={{ ['--steps' as string]:trace.steps.length }} onKeyDown={key}>
      <div className="lanes-row lanes-head" role="row">
        <div className="lane-head" role="columnheader">Component</div>
        {trace.steps.map(step => (
          <div key={step.tick} role="columnheader" title={`${step.events} events, ${step.changes} values set (Unqork tick ${step.tick})`}>
            <span className="step-name">Step {step.number}</span><span className="step-meta">{step.ms === undefined ? '' : duration(step.ms)}</span>
          </div>
        ))}
      </div>
      {/* The step columns' lines, drawn once for every lane. */}
      <div className="lanes-columns" aria-hidden="true">{trace.steps.map(step => <div key={step.tick} style={{ gridColumn:step.number + 1 }} />)}</div>
      {lanes.map((lane, index) => (
        <div key={lane.key} className="lanes-row lane" role="row" data-key={lane.key} data-related={relatedLanes.has(lane.key) ? '' : undefined}>
          <div className="lane-label" role="rowheader"><span className="lane-key" title={lane.key}>{lane.key}</span>{lane.type && <span className="chip">{lane.type}</span>}</div>
          {(cells.get(lane.key) || []).map(cell => (
            <div key={cell.step} className="cell" role="gridcell" aria-colindex={cell.step + 1} style={{ gridColumn:cell.step + 1, gridRow:1 }}>
              {cell.events.map(event => (
                <Mark key={event.id} event={event} lane={index} selected={event.id === selected} related={related?.has(event.id) === true} focusable={event.id === focusable}
                  onSelect={id => onSelect(id === selected ? undefined : id)} />
              ))}
            </div>
          ))}
        </div>
      ))}
      <svg className="threads" width={size.width} height={size.height} aria-hidden="true">{threads.map(line => <path key={line} d={line} />)}</svg>
    </div>
  );
}

// The log in the order Unqork wrote it, for reading it as Unqork's Event Log shows it.
function List({ trace, filter, selected, onSelect }: Omit<StepsProps, 'mode'>) {
  const first = trace.events.find(event => event.at !== undefined)?.at;
  const rows = trace.events.filter(event => matches(event.key, filter));
  if (!rows.length) return <Empty>No events match “{filter}”.</Empty>;
  return (
    <table className="event-list">
      <thead><tr><th scope="col">Step</th><th scope="col"><span className="visually-hidden">Kind</span></th><th scope="col">Component</th><th scope="col">Event</th><th scope="col">Caused by</th><th scope="col">Time</th></tr></thead>
      <tbody>
        {rows.map(event => (
          <tr key={event.id} aria-selected={event.id === selected} onClick={() => onSelect(event.id === selected ? undefined : event.id)}>
            <td className="mono">{event.step}</td>
            <td><Glyph event={event} small /></td>
            <td><button type="button" className="row-button mono" onClick={click => { click.stopPropagation(); onSelect(event.id === selected ? undefined : event.id); }}>{event.key}</button> <span className="chip">{event.type}</span></td>
            <td>{describe(event)}</td>
            <td className="mono muted">{event.causeKey === '__setup__' ? 'setup' : event.causeKey}</td>
            <td className="mono muted">{first !== undefined && event.at !== undefined ? '+' + duration(event.at - first) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Consecutive events of one component read as one line: "Step 2: was queued · Step 3: ran".
function groups(events: TraceEvent[]) {
  const out: { key: string; events: TraceEvent[] }[] = [];
  for (const event of events) {
    const last = out[out.length - 1];
    if (last && last.key === event.key) last.events.push(event);
    else out.push({ key:event.key, events:[event] });
  }
  return out;
}

function steps(events: TraceEvent[]) {
  const byStep = new Map<number, string[]>();
  for (const event of events) byStep.set(event.step, [...(byStep.get(event.step) || []), describe(event)]);
  return [...byStep].map(([step, words]) => `Step ${step}: ${words.join(', ')}`);
}

function Inspector({ trace, event, onSelect }: { trace: Trace; event: TraceEvent; onSelect: (id?: string) => void }) {
  const cause = event.cause ? trace.byId.get(event.cause) : undefined;
  const caused = trace.events.filter(other => other.cause === event.id);
  const verb = describe(event);
  const when = `${verb[0].toUpperCase() + verb.slice(1)} in step ${event.step}`;
  return (
    <aside className="inspector" aria-labelledby="inspector-title">
      <header>
        <h2 id="inspector-title">{event.key}</h2>
        {event.type && <span className="chip">{event.type}</span>}
        <button type="button" className="close" aria-label="Close inspector" onClick={() => onSelect(undefined)}>×</button>
      </header>
      <p className="lead">
        {event.kind === 'fail' ? `Failed in step ${event.step}.`
          : event.causeKey === '__setup__' || event.causeKey === event.key ? `${when}${event.causeKey === '__setup__' ? ', during setup' : ''}.`
          : <>{when}, caused by <b className="mono">{cause?.key ?? event.causeKey}</b>.</>}
      </p>
      {event.kind === 'fail' && <section><h3>Error</h3><pre className="error-text">{event.message || 'Unqork logged a failure without a message.'}</pre></section>}
      {event.hasValue && (
        <section>
          <h3 className="section-head">Value <CopyButton text={() => JSON.stringify(event.value, null, 2) ?? ''} label="Copy value" /></h3>
          <JsonTree value={event.value} label={event.key + ' value'} />
        </section>
      )}
      {event.kind === 'other' && Object.keys(event.attributes).length > 0 && (
        <section><h3>Attributes</h3><JsonTree value={event.attributes} label="Event attributes" /></section>
      )}
      <section>
        <h3>How it got here</h3>
        <ol className="path">
          {groups(path(trace, event.id)).map(group => {
            const last = group.events[group.events.length - 1];
            const here = group.events.includes(event);
            return (
              <li key={last.id}>
                <Glyph event={last} small />
                {here ? <span className="here mono">{group.key}</span> : <button type="button" className="link mono" onClick={() => onSelect(last.id)}>{group.key}</button>}
                <span className="when">{steps(group.events).join(' · ')}</span>
              </li>
            );
          })}
        </ol>
      </section>
      {caused.length > 0 && (
        <section>
          <h3>Led to</h3>
          <ul className="caused">
            {caused.map(other => <li key={other.id}><Glyph event={other} small /><button type="button" className="link mono" onClick={() => onSelect(other.id)}>{other.key}</button><span className="when">{describe(other)}</span></li>)}
          </ul>
        </section>
      )}
      <section>
        <h3>In this run</h3>
        <p className="when">{steps(trace.events.filter(other => other.key === event.key)).map(line => <span key={line}>{line}<br /></span>)}</p>
      </section>
    </aside>
  );
}
