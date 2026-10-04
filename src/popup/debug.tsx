import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import * as Environment from '@/lib/environment';
import { runQuickAction, type QuickRequest, type QuickResult } from '@/lib/quick-actions';
import { usePages } from './pages';
import { detached, embedded, getTargetTab, params, type TargetTab } from './runtime';

export type FeedbackId = 'inspect' | 'data' | 'execute' | 'home';
export interface Feedback { text: string; state?: 'pending' | 'success' | 'error' }
export type ValueType = 'text' | 'number' | 'object';
export interface DebugForm { logStyle: 'grouped' | 'object'; propertyKey: string; value: string; valueType: ValueType; componentKey: string }
interface Pending { request: QuickRequest; button: HTMLElement; feedback: FeedbackId; text: string; confirm: string; production: boolean }

interface Debug {
  form: DebugForm;
  setForm: (patch: Partial<DebugForm>) => void;
  // Set while the active tab and site access are checked, or an action runs.
  controlsDisabled: boolean;
  busy: boolean;
  status: string;
  // The origin to request when Debug tools need one-time site access.
  accessOrigin: string | null;
  accessPending: boolean;
  // Why Data and Execute are unavailable on this page.
  productionReason: string;
  feedback: Record<FeedbackId, Feedback>;
  pending: Pending | null;
  checkPage: () => Promise<void>;
  requestAccess: () => Promise<void>;
  run: (action: QuickRequest['action'], button: HTMLElement, feedback: FeedbackId) => void;
  confirm: () => void;
  cancel: (focus?: boolean) => void;
  logFromHome: (button: HTMLElement) => Promise<void>;
}

const DebugContext = createContext<Debug | null>(null);

export function useDebug() {
  const debug = useContext(DebugContext);
  if (!debug) throw new Error('useDebug needs a DebugProvider');
  return debug;
}

const reserved = ['__proto__', 'constructor', 'prototype'];

export function DebugProvider({ children }: { children: ReactNode }) {
  const pages = usePages();
  const [form, setFormState] = useState<DebugForm>({ logStyle:'grouped', propertyKey:'', value:'', valueType:'text', componentKey:'' });
  const [controlsDisabled, setControlsDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [accessOrigin, setAccessOrigin] = useState<string | null>(null);
  const [accessPending, setAccessPending] = useState(false);
  const [environment, setEnvironment] = useState<{ current: Environment.Detected; settings: Environment.EnvironmentSettings } | null>(null);
  const [feedback, setFeedback] = useState<Record<FeedbackId, Feedback>>({ inspect:{ text:'' }, data:{ text:'' }, execute:{ text:'' }, home:{ text:'' } });
  const [pending, setPending] = useState<Pending | null>(null);
  const target = useRef<TargetTab | undefined>(undefined);
  const busyRef = useRef(false);
  const formRef = useRef(form);
  formRef.current = form;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const blocked = environment?.current.kind === 'production' && environment.settings.blockProduction;
  const productionReason = blocked ? 'Disabled by Environments → Disable Data and Execute in production.' : '';
  const say = (id: FeedbackId, text: string, state?: Feedback['state']) => setFeedback(previous => ({ ...previous, [id]:{ text, state } }));

  const describe = useCallback((value: { current: Environment.Detected; settings: Environment.EnvironmentSettings } | null) => {
    const production = value?.current.kind === 'production' && value.settings.blockProduction;
    setStatus((value?.current.label || 'UNKNOWN') + (production ? ' · Data and Execute tools are disabled in production.' : ' · For Angular Unqork application pages.'));
  }, []);

  const cancel = useCallback((focus = false) => {
    const button = pendingRef.current?.button;
    setPending(null);
    if (focus) button?.focus();
  }, []);

  const pageOrigin = () => new URL(target.current!.url).origin + '/*';

  async function hasPageAccess() {
    // The toolbar spends an activeTab grant on click; an embedded menu has no gesture to spend.
    if (!embedded() && !detached()) return true;
    const result = await api.runtime.sendMessage({ type:'debug.access' });
    if (!result?.ok) throw new Error(result?.error || 'Could not check site access.');
    return result.granted === true;
  }

  function enableControls(value = environment) {
    setAccessOrigin(null);
    setControlsDisabled(false);
    describe(value);
  }

  // Resolves the target tab, its environment and whether this popup may run scripts there.
  async function prepare() {
    target.current = undefined;
    const tab = await getTargetTab();
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Unsupported tab');
    target.current = { id:tab.id, url:tab.url };
    const settings = Environment.settings((await api.storage.local.get('environment')).environment);
    const value = { current:Environment.detect(tab.url, settings), settings };
    setEnvironment(value);
    return { granted:await hasPageAccess(), value };
  }

  async function checkPage() {
    if (busyRef.current) return;
    cancel();
    setControlsDisabled(true);
    setAccessOrigin(null);
    setStatus('Checking active tab…');
    try {
      const { granted, value } = await prepare();
      if (granted) enableControls(value);
      else {
        setAccessOrigin(pageOrigin());
        setStatus((value.current.label || 'UNKNOWN') + ' · Debug tools need one-time access to this site.');
      }
    } catch {
      setStatus('Open Unqork, then open Unqlock from the browser toolbar.');
    }
  }

  async function requestAccess() {
    if (!target.current) return;
    setAccessPending(true);
    try {
      if (!api.permissions?.request) {
        const result = await api.runtime.sendMessage({ type:'debug.permission' });
        if (!result?.ok) throw new Error(result?.error || 'Could not open the site access window.');
        if (result.granted) enableControls();
        else setStatus('Approve site access in the Unqlock window, then continue here.');
        return;
      }
      // Call directly from the gesture, before awaits (required by Firefox).
      const granted = await api.permissions.request({ origins:[pageOrigin()] });
      if (granted) {
        enableControls();
        if (params().get('permission') === 'debug') {
          const result = await api.runtime.sendMessage({ type:'debug.granted' });
          if (result?.ok) window.close();
        }
      }
      else setStatus('Site access was not granted. Open Unqlock from the browser toolbar to use debug tools once.');
    } catch (error) { setStatus('Could not request site access: ' + ((error as Error).message || 'open Unqlock from the browser toolbar instead.')); }
    finally { setAccessPending(false); }
  }

  async function execute(request: QuickRequest, button: HTMLElement, id: FeedbackId) {
    cancel();
    busyRef.current = true;
    setBusy(true);
    setControlsDisabled(true);
    say(id, 'Running…', 'pending');
    try {
      const config = Environment.settings((await api.storage.local.get('environment')).environment);
      const current = Environment.detect(request.url, config);
      if (request.action !== 'log') {
        if (current.kind === 'production' && config.blockProduction) throw new Error('Production actions are disabled.');
        if (current.kind === 'production' && request.productionConfirmed !== true) throw new Error('Environment settings changed. Review and confirm the action again.');
      }
      request.production = current.kind === 'production';
      request.blockProduction = config.blockProduction;
      let result: QuickResult | undefined;
      if (embedded()) {
        const response = await api.runtime.sendMessage({ type:'debug.execute', request });
        if (!response?.ok) throw new Error(response?.error || 'Could not access the page.');
        result = response.result;
      } else {
        const results = await api.scripting.executeScript({ target:{ tabId:target.current!.id }, world:'MAIN', func:runQuickAction, args:[request] });
        result = results[0]?.result as QuickResult | undefined;
      }
      say(id, result?.message || 'No result returned. Check the page before retrying.', result?.ok ? 'success' : 'error');
    } catch (error) {
      say(id, (error as Error).message || 'Could not access the page. Reopen from the toolbar; check the page before retrying.', 'error');
    } finally {
      busyRef.current = false;
      flushSync(() => { setBusy(false); setControlsDisabled(false); });
      if (!button.closest('[hidden]')) button.focus();
    }
  }

  function run(action: QuickRequest['action'], button: HTMLElement, id: FeedbackId) {
    if (!target.current || busyRef.current) return;
    const values = formRef.current;
    const production = environment?.current.kind === 'production';
    const request: QuickRequest = {
      action, confirmed:action !== 'log', url:target.current.url, productionConfirmed:production,
      key:action === 'trigger' ? values.componentKey : values.propertyKey,
      value:values.value, type:values.valueType, style:values.logStyle
    };
    if (action === 'log') { execute(request, button, id); return; }
    if (!request.key!.trim() || reserved.includes(request.key!)) {
      cancel();
      say(id, 'Enter a valid, non-reserved property or component key.', 'error');
      return;
    }
    say(id, '');
    let text = action === 'trigger'
      ? 'Run “' + request.key + '”? This may save data or call integrations.'
      : (action === 'remove' ? 'Remove' : 'Update') + ' “' + request.key + '” in this page’s in-memory data?';
    let confirm = action === 'trigger' ? 'Confirm run' : action === 'remove' ? 'Confirm removal' : 'Confirm update';
    if (production) {
      text = '⚠ PRODUCTION ENVIRONMENT\nThis action can trigger integrations or save data.\n' + text;
      confirm = action === 'trigger' ? 'Run anyway' : 'Change anyway';
    }
    flushSync(() => setPending({ request, button, feedback:id, text, confirm, production }));
    document.getElementById(production ? 'cancel-action' : 'confirm-action')?.focus();
  }

  function confirm() {
    const value = pendingRef.current;
    if (value && !busyRef.current) execute(value.request, value.button, value.feedback);
  }

  // Home runs the log directly when it can, and otherwise hands over to Debug tools to explain or request access.
  async function logFromHome(button: HTMLElement) {
    if (busyRef.current) return;
    say('home', 'Checking active tab…');
    let ready = false;
    try { ready = (await prepare()).granted; } catch { /* Debug tools explains unsupported pages. */ }
    if (!ready) {
      say('home', '');
      pages.open('quick-page', button);
      return;
    }
    execute({ action:'log', confirmed:false, url:target.current!.url, productionConfirmed:false, style:formRef.current.logStyle }, button, 'home');
  }

  const setForm = useCallback((patch: Partial<DebugForm>) => {
    // Editing a value withdraws a pending confirmation.
    cancel();
    setFormState(previous => ({ ...previous, ...patch }));
  }, [cancel]);

  // Environment changes, such as the production guard, apply to an open Debug tools page at once.
  useEffect(() => {
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local' || !changes.environment || !target.current) return;
      cancel();
      try {
        const settings = Environment.settings(changes.environment.newValue);
        const value = { current:Environment.detect(target.current.url, settings), settings };
        setEnvironment(value);
        describe(value);
      } catch { setControlsDisabled(true); }
    };
    api.storage.onChanged?.addListener(listener);
    return () => api.storage.onChanged?.removeListener(listener);
  }, [cancel, describe]);

  // The floating menu learns from its page when site access was granted in another window.
  const recheck = useRef<() => void>(() => {});
  recheck.current = async () => {
    try { if (await hasPageAccess()) enableControls(); }
    catch { setStatus('Reopen Debug tools to check site access.'); }
  };
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!embedded() || event.source !== parent || event.data?.type !== 'unqlock.debugAccessChanged' || !target.current) return;
      recheck.current();
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const value: Debug = {
    form, setForm, controlsDisabled, busy, status, accessOrigin, accessPending, productionReason, feedback, pending,
    checkPage, requestAccess, run, confirm, cancel, logFromHome
  };
  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}
