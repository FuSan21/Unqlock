import { useEffect, useState } from 'react';

// State this window remembers in its own localStorage, such as the rail's width and the view switches.
export function useLocalState<T>(key: string, read: (stored: string | null) => T, write: (value: T) => string = String) {
  const [value, setValue] = useState(() => read(localStorage.getItem(key)));
  useEffect(() => { localStorage.setItem(key, write(value)); }, [key, value]);
  return [value, setValue] as const;
}
