import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Stored } from '@/lib/api';
import * as Panels from '@/lib/panel-settings';
import { Segmented } from '../components/controls';
import { Unavailable } from '../components/Unavailable';
import { ActionRow, Button, Card, Note, Page, Status } from '../components/layout';
import { usePageOpen, usePages } from '../pages';
import { getTargetTab, type TargetTab } from '../runtime';

type PanelId = Panels.PanelId;
const visibilityOptions = [['native', 'Default'], ['start', 'Start collapsed'], ['always', 'Always collapsed']] as const;
const sizingOptions = [['native', 'Default'], ['custom', 'Custom'], ['remember', 'Remember last']] as const;
const lockedReason = 'Choose another visibility option to change this panel’s size.';
const builderUrl = /^https:\/\/[^/]+\/ide\/builder\/workspaces\/[^/]+\/modules\//;

interface WidthProps { id: PanelId; label: string; value: number | null; reason: string; onCommit: (width: number) => void; onInvalid: () => void }

// The default width. It saves when the value is committed, on blur or Enter, rather than on every
// keystroke, and shows the saved value whenever it is not being edited.
function WidthField({ id, label, value, reason, onCommit, onInvalid }: WidthProps) {
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ onCommit, onInvalid, value });
  latest.current = { onCommit, onInvalid, value };
  // Show a newly saved width, unless the field is being edited.
  useEffect(() => {
    const element = input.current!;
    if (document.activeElement === element) return;
    element.value = value === null ? '' : String(value);
    element.removeAttribute('aria-invalid');
  }, [value]);
  // A ref callback follows the element if the field is remounted, such as when it is first disabled.
  const attach = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    if (!element) return;
    if (document.activeElement !== element) element.value = latest.current.value === null ? '' : String(latest.current.value);
    const listener = () => {
      if (!element.checkValidity() || Panels.width(element.valueAsNumber) === null) {
        element.setAttribute('aria-invalid', 'true');
        latest.current.onInvalid();
        return;
      }
      element.removeAttribute('aria-invalid');
      latest.current.onCommit(element.valueAsNumber);
    };
    element.addEventListener('change', listener);
    return () => element.removeEventListener('change', listener);
  }, []);
  return (
    <>
      <label htmlFor={id + '-width'}>Default width (px)</label>
      <Unavailable reason={reason} label={label + ' default width (px)'}>
        <input ref={attach} id={id + '-width'} type="number" min="120" max="1600" step="1" placeholder="120–1600" aria-label={label + ' default width (px)'} disabled={Boolean(reason)} />
      </Unavailable>
    </>
  );
}

export function BuilderPanels() {
  const { current } = usePages();
  const [config, setConfig] = useState(() => Panels.settings());
  const [widths, setWidths] = useState<Partial<Record<PanelId, number | null>>>({});
  const [sizingErrors, setSizingErrors] = useState<Partial<Record<PanelId, string>>>({});
  const [remembered, setRemembered] = useState<Stored>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const target = useRef<TargetTab | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const refreshing = useRef(false);

  // Measures the open panels in the active module. Only a builder module that is still the page this
  // visit started on is measured; anything else has no widths.
  async function measure() {
    let measured: { widths?: Partial<Record<PanelId, number | null>>; errors?: Partial<Record<PanelId, string>> } = {};
    try {
      const active = await getTargetTab();
      if (active?.id && builderUrl.test(active.url || '') && (!target.current || (target.current.id === active.id && target.current.url === active.url))) {
        target.current = { id:active.id, url:active.url };
        measured = await api.tabs.sendMessage(active.id, { type:'panels.measure' }) || {};
      }
    } finally {
      setWidths(measured.widths || {});
      setSizingErrors(measured.errors || {});
    }
    return measured.widths || {};
  }

  async function persist(id: PanelId | null, patch: Partial<Panels.PanelPreference> | null, reset: boolean) {
    try {
      const latest = Panels.settings((await api.storage.local.get('builderPanels')).builderPanels);
      const next = id ? { ...latest, [id]:{ ...latest[id], ...patch } } : Panels.settings();
      const update: Record<string, unknown> = { builderPanels:next };
      const cleared = id ? [id] : Panels.panelIds;
      if (reset) for (const key of cleared) update[Panels.rememberedKey(key)] = null;
      await api.storage.local.set(update);
      if (reset) setRemembered((previous: Stored) => ({ ...previous, ...Object.fromEntries(cleared.map(key => [Panels.rememberedKey(key), null])) }));
      if (pendingSaves.current === 1) {
        setConfig(next);
        setStatus('Saved. Start collapsed applies on the next module visit. Widths fit the available space.');
      }
    } catch { setStatus('Could not save. Try again.'); }
    finally {
      pendingSaves.current--;
      setBusy(pendingSaves.current > 0);
    }
  }

  // Keep keyboard focus and serialize every change, including reset requests.
  function save(id: PanelId | null, patch: Partial<Panels.PanelPreference> | null, reset = false) {
    setConfig(previous => id ? { ...previous, [id]:{ ...previous[id], ...patch } } : Panels.settings());
    pendingSaves.current++;
    setBusy(true);
    setStatus('Saving…');
    saveQueue.current = saveQueue.current.then(() => persist(id, patch, reset));
    return saveQueue.current;
  }

  usePageOpen('panels-page', async () => {
    setLoading(true);
    setStatus('Loading panel settings…');
    target.current = null;
    try {
      const result = await api.storage.local.get(['builderPanels', ...Panels.panelIds.map(Panels.rememberedKey)]);
      setConfig(Panels.settings(result.builderPanels));
      setRemembered(result);
      try { await measure(); } catch { setWidths({}); }
      setLoading(false);
      setStatus('');
    } catch { setStatus('Could not load panel settings. Reopen Unqlock to retry.'); }
  });

  // The floating settings can stay open while panels change behind it.
  const refresh = useRef<() => void>(() => {});
  refresh.current = async () => {
    if (refreshing.current || pendingSaves.current > 0 || current !== 'panels-page' || loading) return;
    refreshing.current = true;
    try { await measure(); } catch { /* A closed or navigating module will be measured again on the next refresh. */ }
    finally { refreshing.current = false; }
  };
  useEffect(() => {
    const tick = () => refresh.current();
    const timer = setInterval(tick, 1000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);

  return (
    <Page id="panels-page" title="Builder panels" titleId="panels-title">
      <Note>Start collapsed applies once each time you enter a module or reload. Always collapsed also prevents reopening. Widths adapt to the available space.</Note>
      <form id="panels-form" aria-busy={busy} onSubmit={event => event.preventDefault()}>
        <fieldset id="panels-fields" disabled={loading}>
          {Panels.panelIds.map(id => {
            const meta = Panels.panels[id];
            const pref = config[id];
            const locked = pref.visibility === 'always' ? lockedReason : '';
            const width = widths[id];
            const rememberedWidth = remembered[Panels.rememberedKey(id)];
            let note = pref.sizing === 'remember'
              ? (rememberedWidth ? 'Last saved: ' + rememberedWidth + ' px. Drag the handle to update it.' : 'Drag the panel’s handle to save its width.')
              : pref.sizing === 'custom' ? 'Applied when a module opens. You can still drag to resize during that visit.' : 'Unqork manages this panel’s width.';
            if (pref.sizing !== 'native' && sizingErrors[id]) note = sizingErrors[id]!;
            return (
              <Card key={id} title={meta.label}>
                <Segmented name={id + '-visibility'} legend="Visibility" label={meta.label + ' visibility'} options={visibilityOptions} value={pref.visibility}
                  onChange={visibility => save(id, { visibility })} />
                <Segmented name={id + '-sizing'} legend="Width" label={meta.label + ' width'} options={sizingOptions} value={pref.sizing} reason={locked}
                  onChange={sizing => save(id, {
                    sizing,
                    ...(sizing === 'custom' && configRef.current[id].width === null ? { width:Panels.width(widths[id]) || 300 } : {})
                  })} />
                <WidthField id={id} label={meta.label} value={pref.width} reason={locked || (pref.sizing !== 'custom' ? 'Choose a Custom width to enter one.' : '')}
                  onCommit={value => save(id, { width:value })}
                  onInvalid={() => setStatus('Enter a whole-number width from 120 to 1600 pixels. The saved width has not changed.')} />
                <Note>{note}</Note>
                <ActionRow>
                  <Button aria-label={'Use current ' + meta.label + ' width'} reason={locked || (!width ? 'Open this panel in the active module to use its current width.' : '')}
                    onClick={async () => {
                      try {
                        const measured = await measure();
                        if (Panels.width(measured[id]) === null) throw new Error();
                        await save(id, { width:measured[id]!, sizing:'custom' });
                      } catch { setStatus('Open this panel in the active module, then try again.'); }
                    }}>Use current width</Button>
                  <Button aria-label={'Reset ' + meta.label} onClick={() => save(id, Panels.settings()[id], true)}>Reset</Button>
                </ActionRow>
              </Card>
            );
          })}
        </fieldset>
        <button id="panels-reset" type="button" onClick={() => save(null, null, true)}>Reset all builder panels</button>
      </form>
      <Status id="panels-status">{status}</Status>
    </Page>
  );
}
