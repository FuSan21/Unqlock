import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

export type StorageChanges = Record<string, { newValue?: unknown }>;

// Calls back with the changed keys whenever extension storage changes any of them, whoever wrote it: another
// copy of the popup (the toolbar and a floating menu can be open together), the prompt window or an import.
export function useStorageChange(keys: readonly string[], callback: (changes: StorageChanges) => void) {
  const latest = useRef(callback);
  latest.current = callback;
  const watched = keys.join('\n');
  useEffect(() => {
    const names = watched.split('\n');
    const listener = (changes: StorageChanges, area: string) => {
      if (area !== 'local') return;
      const relevant = Object.fromEntries(Object.entries(changes).filter(([key]) => names.includes(key)));
      if (Object.keys(relevant).length) latest.current(relevant);
    };
    api.storage.onChanged?.addListener(listener);
    return () => api.storage.onChanged?.removeListener(listener);
  }, [watched]);
}

// The new values of a set of changes, as a storage read would return them.
export const newValues = (changes: StorageChanges) => Object.fromEntries(Object.entries(changes).map(([key, change]) => [key, change.newValue]));
