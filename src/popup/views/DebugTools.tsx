import { useState } from 'react';
import { Segmented, Select, TextField } from '../components/controls';
import { Tabs } from '../components/Tabs';
import { Unavailable } from '../components/Unavailable';
import { ActionRow, Button, Note, Page, Status } from '../components/layout';
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
    </Page>
  );
}
