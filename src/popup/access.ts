import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { embedded, firefox } from './runtime';

// Firefox closes its toolbar popup when a permission prompt opens, and a frame without permissions.request
// cannot show one, so those ask in the prompt window instead (src/lib/access.ts).
export const promptWindow = () => firefox() || !api.permissions?.request;

// Asks for site access. Where this popup can show the browser's prompt it does, called before any await so
// Firefox still sees the click; otherwise the background opens the prompt window, which finishes the job.
export async function requestAccess(kind: 'devOverlay' | 'badges', origins: string[]): Promise<'granted' | 'denied' | 'window'> {
  if (!promptWindow()) return await api.permissions.request({ origins }) ? 'granted' : 'denied';
  const result = await api.runtime.sendMessage({ type:'prompt.open', kind });
  if (!result?.ok) throw new Error(result?.error || 'Could not open the Unqlock window.');
  return result.granted ? 'granted' : 'window';
}

// Calls back when site access is granted elsewhere: in the prompt window, which tells a floating menu
// through its page, or in the browser's own settings.
export function useAccessChanged(callback: () => void) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const message = (event: MessageEvent) => {
      if (embedded() && event.source === parent && event.data?.type === 'unqlock.accessChanged') latest.current();
    };
    const added = () => latest.current();
    window.addEventListener('message', message);
    api.permissions?.onAdded?.addListener(added);
    return () => {
      window.removeEventListener('message', message);
      api.permissions?.onAdded?.removeListener(added);
    };
  }, []);
}
