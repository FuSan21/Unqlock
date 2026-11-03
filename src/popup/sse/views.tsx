import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Stored } from '@/lib/api';
import { fetchSnippet } from '@/lib/sse-run';
import { duration, type TraceEvent } from '@/lib/sse-trace';
import type { Run } from './Debugger';

export const matches = (key: string, filter: string) => !filter || key.toLowerCase().includes(filter.trim().toLowerCase());

// The lowercase JSON a value search looks in, worked out once per event.
const texts = new WeakMap<TraceEvent, string>();
const text = (value: unknown) => { try { return (JSON.stringify(value) ?? String(value)).toLowerCase(); } catch { return String(value).toLowerCase(); } };
export function valueMatches(event: TraceEvent, filter: string) {
  if (!event.hasValue || !filter.trim()) return false;
  if (!texts.has(event)) texts.set(event, text(event.value));
  return texts.get(event)!.includes(filter.trim().toLowerCase());
}
const entryMatches = (key: string, value: unknown, filter: string, values: boolean) => matches(key, filter) || (values && Boolean(filter.trim()) && text(value).includes(filter.trim().toLowerCase()));

// One line of a value: "{ "status": 200, … }" or "\"ready\"".
export function preview(value: unknown, length = 160) {
  let text: string;
  try { text = value === undefined ? 'undefined' : JSON.stringify(value) ?? String(value); } catch { text = String(value); }
  return text.length > length ? text.slice(0, length - 1) + '…' : text;
}

// Copies text to the clipboard and is true for a moment after, for a "Copied" confirmation.
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    }, () => {});
  };
  return [copied, copy];
}

export function CopyButton({ text, label, id }: { text: () => string; label: string; id?: string }) {
  const [done, copy] = useCopy();
  return <button id={id} type="button" className="link" onClick={() => copy(text())}>{done ? 'Copied' : label}</button>;
}

// A collapsible JSON value. Objects and arrays open to `open` levels deep.
export function JsonTree({ value, open = 2, label }: { value: unknown; open?: number; label: string }) {
  return <ul className="json" aria-label={label}><JsonNode value={value} depth={0} open={open} /></ul>;
}

const limit = 500;

function JsonNode({ name, value, depth, open }: { name?: string; value: unknown; depth: number; open: number }) {
  const [expanded, setExpanded] = useState(depth < open);
  const key = name === undefined ? null : <span className="json-key">{name}</span>;
  if (value && typeof value === 'object') {
    const entries: [string, unknown][] = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
    const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    if (!entries.length) return <li className="json-leaf">{key}{key && ': '}<span className="json-empty">{Array.isArray(value) ? '[]' : '{}'}</span></li>;
    return (
      <li>
        <button type="button" className="json-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {key}<span className="json-summary">{summary}</span>
        </button>
        {expanded && (
          <ul>
            {entries.slice(0, limit).map(([child, item]) => <JsonNode key={child} name={child} value={item} depth={depth + 1} open={open} />)}
            {entries.length > limit && <li className="json-more">{entries.length - limit} more not shown. Copy the value to see all of it.</li>}
          </ul>
        )}
      </li>
    );
  }
  const type = value === null ? 'null' : typeof value;
  return <li className="json-leaf">{key}{key && ': '}<span className={'json-' + type}>{type === 'string' ? JSON.stringify(value) : String(value)}</span></li>;
}

export function Glyph({ event, small }: { event: Pick<TraceEvent, 'kind'>; small?: boolean }) {
  return <i className={(event.kind === 'wait' ? 'glyph-wait' : 'glyph') + (small ? ' small' : '')} data-kind={event.kind} aria-hidden="true" />;
}

// Changes: the values each step set, in order.
export function Changes({ run, filter, values, onShow }: { run: Run; filter: string; values: boolean; onShow: (id: string) => void }) {
  const [open, setOpen] = useState<string>();
  const { trace, request } = run;
  const input = request.data;
  const sets = trace.events.filter(event => event.kind === 'set' && (matches(event.key, filter) || (values && valueMatches(event, filter))));
  // Grouped once, so a long run is not filtered again for every step.
  const byTick = new Map<number, TraceEvent[]>();
  for (const event of sets) { const group = byTick.get(event.tick); if (group) group.push(event); else byTick.set(event.tick, [event]); }
  if (!trace.events.length) return <Empty>Unqork returned no event log for this run, so there are no changes to show. The Raw view has the full response.</Empty>;
  if (!sets.length) return <Empty>{filter ? `No changed values match “${filter}”.` : 'This run set no values.'}</Empty>;
  return (
    <div className="changes">
      {trace.steps.map(step => {
        const rows = byTick.get(step.tick) || [];
        return (
          <section key={step.tick} aria-label={'Step ' + step.number}>
            <h3>Step {step.number} <span>{rows.length ? `${rows.length} ${rows.length === 1 ? 'value' : 'values'}${step.ms !== undefined ? ' · ' + duration(step.ms) : ''}` : 'no changes'}</span></h3>
            {rows.map(event => {
              const cause = event.cause ? trace.byId.get(event.cause) : undefined;
              const fromInput = Object.prototype.hasOwnProperty.call(input, event.key) && preview(input[event.key], 100000) !== preview(event.value, 100000);
              return (
                <div key={event.id} className="change" data-open={open === event.id || undefined}>
                  <button type="button" className="change-row" aria-expanded={open === event.id} onClick={() => setOpen(open === event.id ? undefined : event.id)}>
                    <Glyph event={event} small />
                    <span className="change-key">{event.key}</span>
                    <span className="change-by">{cause ? 'by ' + cause.key : event.causeKey === '__setup__' ? 'setup' : 'by ' + event.causeKey}</span>
                    <span className="change-preview">{event.hasValue ? preview(event.value) : '—'}</span>
                    {fromInput && <span className="change-flag" title="Differs from the value in the input">changed from input</span>}
                  </button>
                  {open === event.id && (
                    <div className="change-detail">
                      <div className="detail-actions">
                        <CopyButton text={() => JSON.stringify(event.value, null, 2) ?? ''} label="Copy value" />
                        <button type="button" className="link" onClick={() => onShow(event.id)}>Show in steps</button>
                      </div>
                      <JsonTree value={event.value} label={event.key + ' value'} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

// Output: the module's resolved data, which an API module returns to its caller.
export function Output({ run, filter, values, onShow }: { run: Run; filter: string; values: boolean; onShow: (key: string) => void }) {
  const body: Stored = run.response.body;
  const data = body?.data?.resolved ?? body?.data;
  const { validation } = run.outcome;
  const shown = data && typeof data === 'object' && !Array.isArray(data) && filter
    ? Object.fromEntries(Object.entries(data).filter(([key, value]) => entryMatches(key, value, filter, values))) : data;
  return (
    <div className="pad">
      {validation.length > 0 && (
        <section className="validation" aria-labelledby="validation-title">
          <h3 id="validation-title">{validation.length} validation {validation.length === 1 ? 'error' : 'errors'}</h3>
          <ul>
            {validation.map((item, index) => (
              <li key={index}>
                <button type="button" className="link mono" onClick={() => onShow(item.key)}>{item.key}</button>
                {item.label && item.label !== item.key && <span className="muted"> {item.label}</span>}
                <span> {item.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data === undefined ? <Empty>The response has no data. The Raw view has the full response.</Empty> : (
        <section aria-labelledby="output-title">
          <h3 id="output-title" className="section-head">Resolved data <CopyButton text={() => JSON.stringify(data, null, 2)} label="Copy output" /></h3>
          <JsonTree value={shown} label="Resolved data" />
        </section>
      )}
    </div>
  );
}

function Headers({ headers }: { headers: Record<string, string> }) {
  const names = Object.keys(headers);
  if (!names.length) return <p className="muted">None kept.</p>;
  return <dl className="headers">{names.map(name => [<dt key={name + ':'}>{name}</dt>, <dd key={name}>{headers[name] === '' ? '(empty)' : headers[name]}</dd>])}</dl>;
}

// Raw: what was sent and what came back, unchanged.
export function Raw({ run }: { run: Run }) {
  const { response } = run;
  const sent = response.sent;
  return (
    <div className="pad raw">
      <section aria-labelledby="raw-request">
        <h3 id="raw-request" className="section-head">Request {sent && <CopyButton text={() => fetchSnippet(sent)} label="Copy request as fetch" />}</h3>
        {sent ? (
          <>
            <p className="mono request-line"><b>{sent.method}</b> {sent.url}</p>
            <Headers headers={sent.headers} />
            <JsonTree value={sent.body} label="Request body" />
          </>
        ) : <p className="muted">The request was not sent.</p>}
      </section>
      <section aria-labelledby="raw-response">
        <h3 id="raw-response" className="section-head">Response <CopyButton text={() => response.text ?? JSON.stringify(response.body, null, 2)} label="Copy response" /></h3>
        <p className="mono request-line">{response.status !== undefined ? <><b>{response.status}</b> in {duration(response.ms)}</> : response.error}</p>
        <Headers headers={response.headers} />
        {response.text !== undefined ? <pre className="raw-text">{response.text}</pre> : response.body !== null && <JsonTree value={response.body} open={1} label="Response body" />}
      </section>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
