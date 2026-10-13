import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import * as WhatsNew from '@/lib/whats-new';

interface WhatsNewState {
  current: string;
  // Versions that were unread when the popup opened; they stay marked New while it is open.
  fresh: string[];
  // True until the notes are read or the notice dismissed.
  notice: boolean;
  dismiss: () => void;
}

const WhatsNewContext = createContext<WhatsNewState | null>(null);

export function useWhatsNew() {
  const state = useContext(WhatsNewContext);
  if (!state) throw new Error('useWhatsNew needs a WhatsNewProvider');
  return state;
}

// Opening the popup clears the toolbar's NEW; the home notice stays until the notes are read or dismissed.
// Without a stored version, as before the background has run once, nothing counts as unread.
export function WhatsNewProvider({ children }: { children: ReactNode }) {
  const current = api.runtime?.getManifest?.().version || '0.0.0';
  const [fresh, setFresh] = useState<string[]>([]);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = WhatsNew.state((await api.storage.local.get(WhatsNew.key))[WhatsNew.key]);
      setFresh(WhatsNew.unseen(stored.seen, current).map(release => release.version));
      setNotice(WhatsNew.notify(stored.seen, current));
      if (stored.badge) {
        await api.storage.local.set({ [WhatsNew.key]:{ ...stored, badge:false } });
        await api.action?.setBadgeText({ text:'' });
      }
    })().catch(() => {});
  }, [current]);

  const dismiss = useCallback(() => {
    setNotice(false);
    api.storage.local.set({ [WhatsNew.key]:{ seen:current, badge:false } }).catch(() => {});
    api.action?.setBadgeText({ text:'' })?.catch?.(() => {});
  }, [current]);

  const value = useMemo(() => ({ current, fresh, notice, dismiss }), [current, fresh, notice, dismiss]);
  return <WhatsNewContext.Provider value={value}>{children}</WhatsNewContext.Provider>;
}
