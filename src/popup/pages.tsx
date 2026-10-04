import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

export type PageId = 'style-page' | 'layout-page' | 'panels-page' | 'quick-page' | 'environment-page' | 'launcher-page' | 'transfer-page';
interface LeaveOptions { escape?: boolean }
// A leave hook can keep its page open by returning false, such as Escape dismissing a pending confirmation.
type LeaveHook = (options: LeaveOptions) => boolean | void;

interface Pages {
  current: PageId | null;
  // Counts openings, so a page reloads its settings every time it opens.
  visit: number;
  open: (id: PageId, origin?: HTMLElement | null) => void;
  back: (options?: LeaveOptions) => void;
  setLeaveHook: (id: PageId, hook: LeaveHook | null) => void;
}

const PagesContext = createContext<Pages | null>(null);

export function usePages() {
  const pages = useContext(PagesContext);
  if (!pages) throw new Error('usePages needs a PagesProvider');
  return pages;
}

// One page is shown at a time. Opening focuses its title; returning focuses the control that opened it.
// Escape returns home, or, on the home menu of the floating launcher, closes the menu.
export function PagesProvider({ children, onEscapeHome }: { children: ReactNode; onEscapeHome?: () => void }) {
  const [current, setCurrent] = useState<PageId | null>(null);
  const [visit, setVisit] = useState(0);
  const origin = useRef<HTMLElement | null>(null);
  const leaveHooks = useRef(new Map<PageId, LeaveHook>());
  const currentRef = useRef(current);
  currentRef.current = current;

  const open = useCallback((id: PageId, from?: HTMLElement | null) => {
    origin.current = from || document.querySelector<HTMLElement>('#feature-menu [data-page="' + id + '"]');
    setCurrent(id);
    setVisit(count => count + 1);
  }, []);
  const back = useCallback((options: LeaveOptions = {}) => {
    const page = currentRef.current;
    if (!page) return;
    if (leaveHooks.current.get(page)?.(options) === false) return;
    // Show the home menu before focusing the control that opened the page.
    flushSync(() => setCurrent(null));
    origin.current?.focus();
  }, []);
  const setLeaveHook = useCallback((id: PageId, hook: LeaveHook | null) => {
    if (hook) leaveHooks.current.set(id, hook); else leaveHooks.current.delete(id);
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (currentRef.current) {
        event.preventDefault();
        back({ escape:true });
      } else if (onEscapeHome) onEscapeHome();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [back, onEscapeHome]);

  const value = useMemo(() => ({ current, visit, open, back, setLeaveHook }), [current, visit, open, back, setLeaveHook]);
  return <PagesContext.Provider value={value}>{children}</PagesContext.Provider>;
}

// Runs `hook` each time the page opens.
export function usePageOpen(id: PageId, hook: () => void) {
  const { current, visit } = usePages();
  const latest = useRef(hook);
  latest.current = hook;
  useEffect(() => {
    if (current === id) latest.current();
  }, [current, visit, id]);
}

// Runs `hook` before the page closes; returning false keeps it open.
export function usePageLeave(id: PageId, hook: LeaveHook) {
  const { setLeaveHook } = usePages();
  const latest = useRef(hook);
  latest.current = hook;
  useEffect(() => {
    setLeaveHook(id, options => latest.current(options));
    return () => setLeaveHook(id, null);
  }, [id, setLeaveHook]);
}
