import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { send, type Message } from '@/lib/messages';
import * as Environment from '@/lib/environment';
import { getTargetTab, type TargetTab } from './runtime';
import { useStorageChange } from './storage';

export type EnvironmentMessage = Message<'environment.read' | 'environment.save' | 'environment.sync'>;

export interface EnvironmentResult { config: Environment.EnvironmentSettings; missingOrigins: string[] }

interface EnvironmentState {
  config: Environment.EnvironmentSettings | null;
  // Saved custom domains the browser has not granted site access to.
  missingOrigins: string[];
  // The page the popup acts on, when it is a web page.
  target: TargetTab | null;
  current: Environment.Detected | null;
  // Set when the environment could not be read.
  error: string;
  // Sends a configuration message to the background, which owns environment storage and
  // registers badges on custom domains, and adopts the configuration it returns.
  message: (message: EnvironmentMessage) => Promise<EnvironmentResult>;
  // Reads the target tab and the configuration again.
  reload: () => Promise<EnvironmentResult & { target: TargetTab | null }>;
}

const EnvironmentContext = createContext<EnvironmentState | null>(null);

export function useEnvironment() {
  const environment = useContext(EnvironmentContext);
  if (!environment) throw new Error('useEnvironment needs an EnvironmentProvider');
  return environment;
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Environment.EnvironmentSettings | null>(null);
  const [missingOrigins, setMissingOrigins] = useState<string[]>([]);
  const [target, setTarget] = useState<TargetTab | null>(null);
  const [error, setError] = useState('');

  const message = useCallback(async (request: EnvironmentMessage) => {
    const response = await send(request, 'Could not save environment settings. Reopen Unqlock to retry.');
    const result = { config:Environment.settings(response.config), missingOrigins:(response.missingOrigins || []) as string[] };
    setConfig(result.config);
    setMissingOrigins(result.missingOrigins);
    return result;
  }, []);
  const reload = useCallback(async () => {
    const [tab, result] = await Promise.all([getTargetTab(), message({ type:'environment.read' })]);
    const page = tab && /^https?:\/\//.test(tab.url) ? tab : null;
    setTarget(page);
    // A later successful reload, such as opening Environments, clears an earlier failure.
    setError('');
    return { ...result, target:page };
  }, [message]);

  useEffect(() => {
    reload().catch((reason: Error) => setError(reason.message || 'Could not identify this page.'));
  }, [reload]);
  // A change made elsewhere, such as auto-discovery in another tab or the prompt window's import, updates the
  // home strip at once. Environments loads its editor on opening, so an edit in progress stays as it is.
  useStorageChange(['environment'], changes => {
    try { setConfig(Environment.settings(changes.environment.newValue)); } catch { /* Environments reports an invalid configuration. */ }
  });

  const current = useMemo(() => config && target ? Environment.detect(target.url, config) : null, [config, target]);
  const value = useMemo(() => ({ config, missingOrigins, target, current, error, message, reload }), [config, missingOrigins, target, current, error, message, reload]);
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}
