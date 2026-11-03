import { api } from './api';

export type StoredValues = Record<string, unknown>;

// Reads `keys` from extension storage and calls `apply` with every one of them, missing keys as undefined,
// then again with only the keys each later change touches. A failed read calls `failed`, by default `apply`
// with every key undefined so the defaults apply. Returns a function that stops following changes.
export function watchLocal(keys: readonly string[], apply: (values: StoredValues) => void, failed = () => apply(Object.fromEntries(keys.map(key => [key, undefined])))) {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== 'local') return;
    const changed = keys.filter(key => changes[key]);
    if (changed.length) apply(Object.fromEntries(changed.map(key => [key, changes[key].newValue])));
  };
  api.storage.onChanged.addListener(listener);
  api.storage.local.get([...keys]).then(stored => apply(Object.fromEntries(keys.map(key => [key, stored[key]])))).catch(failed);
  return () => api.storage.onChanged.removeListener?.(listener);
}
