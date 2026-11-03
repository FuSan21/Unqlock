import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import * as SseDebugger from '@/lib/sse-debugger';
import { clearRuns, historyKey, keptRuns, readRuns, writeRuns } from '@/lib/sse-history';
import { store, synced, type Run } from './runs';

// The window's runs. Keep past runs, under the debugger in Debug tools, decides whether they outlast the window.
// While it is on, opening a window or turning it on drops runs past 30 days and saves the ones this window holds,
// and the list follows runs and Clear in other debugger windows. Turning it off deletes them, as the popup also does.
export function useRunHistory() {
  const [runs, setRuns] = useState<Run[]>([]);
  // Changes to the list read and write localStorage, which a state updater must not do, so they work from a ref
  // that always holds the latest list.
  const latest = useRef(runs);
  const update = (change: (list: Run[]) => Run[]) => { latest.current = change(latest.current); setRuns(latest.current); };
  const keep = useRef(false);
  const [keeping, setKeeping] = useState(false);

  useEffect(() => {
    const apply = (on: boolean) => {
      keep.current = on;
      setKeeping(on);
      if (!on) { clearRuns(localStorage); return; }
      update(list => {
        const stored = writeRuns(localStorage, [...list.map(store), ...readRuns(localStorage)]);
        // A run too large to store stays in this window.
        return synced(list.map(run => stored.some(each => each.id === run.id) ? run : { ...run, saved:'none' as const }), stored);
      });
    };
    api.storage?.local?.get(SseDebugger.keepRunsKey).then(stored => apply(SseDebugger.enabled(stored?.[SseDebugger.keepRunsKey])), () => apply(false));
    const option = (changes: Record<string, { newValue?: unknown }>, area: string) => { if (area === 'local' && changes[SseDebugger.keepRunsKey]) apply(SseDebugger.enabled(changes[SseDebugger.keepRunsKey].newValue)); };
    const changed = (event: StorageEvent) => { if (keep.current && (event.key === historyKey || event.key === null)) update(list => synced(list, readRuns(localStorage))); };
    api.storage?.onChanged?.addListener(option);
    window.addEventListener('storage', changed);
    return () => { api.storage?.onChanged?.removeListener(option); window.removeEventListener('storage', changed); };
  }, []);

  // Adds a finished run, saving it first while runs are kept.
  function add(entry: Run) {
    if (keep.current) {
      // Read again before writing, so a run another window saved meanwhile is kept.
      const stored = writeRuns(localStorage, [store(entry), ...readRuns(localStorage)]);
      const own = stored.find(each => each.id === entry.id);
      const held: Run = { ...entry, saved:!own ? 'none' : own.trimmed ? 'trimmed' : undefined };
      update(list => synced([held, ...list.filter(run => run.id !== entry.id)], stored));
    } else update(list => [entry, ...list].slice(0, keptRuns));
  }
  function clear() {
    clearRuns(localStorage);
    update(() => []);
  }
  return { runs, keeping, add, clear };
}
