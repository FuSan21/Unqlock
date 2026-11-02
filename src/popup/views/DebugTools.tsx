import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import * as DevOverlay from '@/lib/dev-overlay';
import * as SseDebugger from '@/lib/sse-debugger';
import { Segmented, Select, TextField, Toggle } from '../components/controls';
import { Tabs } from '../components/Tabs';
import { Unavailable } from '../components/Unavailable';
import { ActionRow, Button, Note, Page, SettingsHeading, Status } from '../components/layout';
import { promptWindow, requestAccess } from '../access';
import { useDebug, type FeedbackId, type ValueType } from '../debug';
import { usePageLeave, usePageOpen } from '../pages';

type TabId = 'inspect' | 'data' | 'execute';

function Feedback({ id }: { id: FeedbackId }) {
  const { feedback } = useDebug();
  return <p className="debug-feedback" role="status" aria-live="polite" data-state={feedback[id].state}>{feedback[id].text}</p>;
}

// A button that runs one quick action on the page.
function ActionButton({ action, feedback, primary, children }: { action: 'log' | 'set' | 'remove' | 'trigger'; feedback: FeedbackId; primary?: boolean; children: string }) {
  const debug = useDebug();
  const reason = action === 'log' ? '' : debug.productionReason;
  return (
    <Button className={primary ? 'debug-primary' : undefined} data-quick-action={action} reason={reason}
      onClick={event => debug.run(action, event.currentTarget, feedback)}>{children}</Button>
  );
}

// The two options for Unqork's own dev overlay, the drawer holding the SSE Debugger: Detach dev overlay and
// the Unqlock SSE debugger. Browser preferences rather than page actions: turning either on asks for access
// to Unqork's builder hosts, which they share, and the background registers the scripts only while one is on
// and that access is granted.
const overlayOptions = {
  detach:{
    key:DevOverlay.key, kind:'devOverlay', name:'dev-overlay-detach', id:'dev-overlay', label:'Detach dev overlay',
    on:'On. The Detach button is in the dev overlay.'
  },
  debugger:{
    key:SseDebugger.key, kind:'sseDebugger', name:'sse-debugger', id:'sse-debugger', label:'Unqlock SSE debugger',
    on:'On. The debugger button is in the dev overlay.'
  }
} as const;

// Under the Unqlock SSE debugger: hide Unqork's dev overlay and open Unqlock's debugger from Server-Side
// Execute instead. A plain preference, since the debugger already holds the access it needs.
function ReplaceOption() {
  const [on, setOn] = useState(false);
  const load = () => { api.storage.local.get(SseDebugger.replaceKey).then(stored => setOn(SseDebugger.enabled(stored[SseDebugger.replaceKey])), () => {}); };
  usePageOpen('quick-page', load);
  useEffect(load, []);
  const change = (value: boolean) => {
    setOn(value);
    api.storage.local.set({ [SseDebugger.replaceKey]:value }).catch(() => setOn(!value));
  };
  return (
    <Toggle name="sse-debugger-replace" label="Use instead of Unqork’s debugger" checked={on} aria-describedby="dev-overlay-help" onChange={change} />
  );
}

function OverlayOption({ option }: { option: keyof typeof overlayOptions }) {
  const settings = overlayOptions[option];
  const [on, setOn] = useState(false);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  // The background answers for the option and its access, since a floating menu frame may have no
  // permissions API to check or remove access with.
  const send = async (message: { type: 'devOverlay.state' } | { type: 'devOverlay.set'; on: boolean }) => {
    const result = await api.runtime.sendMessage(option === 'detach' ? message : { ...message, option });
    if (!result?.ok) throw new Error(result?.error || 'Could not reach Unqlock. Reopen the menu and try again.');
    setOn(result.on === true);
    return result as { on: boolean; needsAccess?: boolean };
  };
  const load = () => { send({ type:'devOverlay.state' }).catch(() => setOn(false)); };
  usePageOpen('quick-page', load);
  // The prompt window saves the option once access is granted there.
  useEffect(() => {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !changes[settings.key]) return;
      load();
      if (changes[settings.key].newValue === true) setStatus(settings.on);
    };
    api.storage.onChanged?.addListener(listener);
    return () => api.storage.onChanged?.removeListener(listener);
  }, []);
  async function change(value: boolean) {
    setPending(true);
    try {
      if (value) {
        // The other option may already hold the shared grant. Where access is asked in the prompt window, ask
        // the background first so a held grant opens no window. The browser's own prompt must be shown within
        // the click, before any await, and resolves at once for a grant already held, so it goes first.
        let result: { on: boolean; needsAccess?: boolean } = promptWindow() ? await send({ type:'devOverlay.set', on:true }) : { on:false, needsAccess:true };
        if (result.needsAccess) {
          const access = await requestAccess(settings.kind, DevOverlay.matches);
          if (access === 'window') { setStatus('Allow access in the Unqlock window.'); return; }
          if (access === 'denied') { setStatus('Access not granted, so it stays off.'); return; }
          result = await send({ type:'devOverlay.set', on:true });
        }
        setStatus(result.on ? settings.on : 'Access not granted, so it stays off.');
      } else {
        await send({ type:'devOverlay.set', on:false });
        setStatus('Off.');
      }
    } catch (error) { setStatus('Couldn’t save: ' + (error as Error).message); }
    finally { setPending(false); }
  }
  return (
    <>
      <Toggle name={settings.name} label={settings.label} checked={on} disabled={pending} aria-describedby="dev-overlay-help" onChange={change} />
      <Status id={settings.id + '-status'}>{status}</Status>
      {option === 'debugger' && on && <ReplaceOption />}
    </>
  );
}

function DevOverlayOptions() {
  return (
    <>
      <SettingsHeading>Unqork dev overlay</SettingsHeading>
      <OverlayOption option="detach" />
      <OverlayOption option="debugger" />
      <Note id="dev-overlay-help">Detach opens Unqork’s debugger in its own window. Unqlock SSE debugger runs a module and shows each step. Using it instead hides Unqork’s dev overlay, Shortcuts manager included, and Server-Side Execute opens Unqlock’s. Both need access to unqork.io sites.</Note>
    </>
  );
}

export function DebugTools() {
  const debug = useDebug();
  const { form, setForm, productionReason } = debug;
  const [tab, setTab] = useState<TabId>('inspect');
  usePageOpen('quick-page', () => { debug.checkPage(); });
  usePageLeave('quick-page', ({ escape }) => {
    if (escape && debug.pending) {
      debug.cancel(true);
      return false;
    }
    debug.cancel();
  });
  const tabs = [
    { id:'inspect' as const, label:'Inspect', panel:(
      <>
        <Note>Log submission and cache data to the page’s DevTools Console. Output may contain sensitive information.</Note>
        <Select id="log-style" label="Console output" options={[['grouped', 'Grouped'], ['object', 'Single object']] as const} value={form.logStyle} onChange={logStyle => setForm({ logStyle })} />
        <ActionButton action="log" feedback="inspect" primary>Log page data</ActionButton>
        <Feedback id="inspect" />
      </>
    ) },
    { id:'data' as const, label:'Data', panel:(
      <>
        <Note>Edit in-memory submission data. Changes are not saved by Unqlock.</Note>
        <TextField id="property-key" label="Property name (exact key)" placeholder="customerId" value={form.propertyKey} reason={productionReason} onChange={event => setForm({ propertyKey:event.target.value })} />
        <Segmented<ValueType> className="value-types" name="value-type" legend="Value type" label="Value type" optionLabel={(_value, text) => text} options={[['text', 'Text'], ['number', 'Number'], ['object', 'JSON']]}
          value={form.valueType} reason={productionReason} onChange={valueType => setForm({ valueType })} />
        <label htmlFor="property-value">Value</label>
        <Unavailable reason={productionReason} label="Value">
          <textarea id="property-value" rows={3} spellCheck={false} placeholder="Enter a value" value={form.value} disabled={Boolean(productionReason)} onChange={event => setForm({ value:event.target.value })} />
        </Unavailable>
        <ActionRow>
          <ActionButton action="set" feedback="data" primary>Update property</ActionButton>
          <ActionButton action="remove" feedback="data">Remove property</ActionButton>
        </ActionRow>
        <Feedback id="data" />
      </>
    ) },
    { id:'execute' as const, label:'Execute', panel:(
      <>
        <Note>Run a component by its exact key. This may save data or call external integrations.</Note>
        <TextField id="component-key" label="Component key" placeholder="calculatePremium" value={form.componentKey} reason={productionReason} onChange={event => setForm({ componentKey:event.target.value })} />
        <ActionButton action="trigger" feedback="execute" primary>Run component</ActionButton>
        <Feedback id="execute" />
      </>
    ) }
  ];
  return (
    <Page id="quick-page" title="Debug tools" titleId="quick-title">
      <p className="debug-subtitle">Inspect data and test component behavior.</p>
      <button id="quick-access" type="button" hidden={!debug.accessOrigin} title={debug.accessOrigin || undefined} disabled={debug.accessPending} onClick={debug.requestAccess}>Enable debug tools on this site</button>
      <fieldset id="quick-controls" disabled={debug.controlsDisabled}>
        <Tabs label="Debug tools" tabs={tabs} selected={tab} onSelect={id => { debug.cancel(); setTab(id); }} />
        <div id="debug-confirmation" className="debug-confirmation" hidden={!debug.pending} data-production={debug.pending ? String(debug.pending.production) : undefined}>
          <p id="confirmation-text">{debug.pending?.text}</p>
          <ActionRow>
            <button id="confirm-action" type="button" onClick={debug.confirm}>{debug.pending?.confirm || 'Confirm'}</button>
            <button id="cancel-action" type="button" onClick={() => debug.cancel(true)}>Cancel</button>
          </ActionRow>
        </div>
      </fieldset>
      <Status id="quick-status">{debug.status}</Status>
      <DevOverlayOptions />
    </Page>
  );
}
