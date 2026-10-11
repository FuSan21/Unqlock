import { useEffect, useState } from 'react';
import * as Access from '@/lib/access';
import { params } from '../runtime';
import { AccessRequest } from './AccessRequest';
import { ImportFile } from './ImportFile';

// The prompt window opened by the background. Its address names only the kind of request; the
// background says what to ask for, so a crafted address cannot widen it.
export function Prompt() {
  const kind = params().get('kind');
  const tab = params().get('tab') ?? undefined;
  const [busy, setBusy] = useState(false);
  const access = Access.isAccessKind(kind);

  // Escape closes the window, as it would a dialog, unless something is being saved.
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !event.defaultPrevented) window.close();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [busy]);

  return (
    <div className="prompt">
      <header className="prompt-header">
        <img src="/icons/icon-48.png" width="40" height="40" alt="" />
        <div>
          <p className="prompt-eyebrow">Unqlock</p>
          <p className="prompt-kicker">{kind === 'import' ? 'Import settings' : 'Site access'}</p>
        </div>
      </header>
      <main className="prompt-body">
        {access && <AccessRequest kind={kind} tab={tab} onBusy={setBusy} />}
        {kind === 'import' && <ImportFile onBusy={setBusy} />}
        {!access && kind !== 'import' && <p role="alert">This window was opened without a request. Close it and try again from Unqlock.</p>}
      </main>
    </div>
  );
}
