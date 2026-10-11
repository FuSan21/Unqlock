import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { originLabel, type AccessKind } from '@/lib/access';

interface Copy { title: (host?: string) => string; lead: string; uses: string[]; done: string }

const copy: Record<AccessKind, Copy> = {
  debug: {
    title:host => 'Allow Debug tools on ' + (host || 'this site') + '?',
    lead:'Debug tools opened from the floating launcher have no toolbar click to borrow access from, so they need this site’s permission once.',
    uses:['Log submission and cache data to the page’s DevTools Console', 'Edit in-memory properties and run components, after you confirm each one'],
    done:'Debug tools are ready in the Unqlock menu on that page.'
  },
  devOverlay: {
    title:() => 'Allow Detach dev overlay on Unqork?',
    lead:'Detach dev overlay adds a button to Unqork’s SSE Debugger drawer, so Unqlock needs access to Unqork’s builder sites.',
    uses:['Add the Detach button to the dev overlay in builder tabs', 'Keep the detached window from saving over your open tabs'],
    done:'Detach dev overlay is on. Open builder tabs show the button now.'
  },
  badges: {
    title:() => 'Allow automatic badges on your domains?',
    lead:'Your saved custom domains need site access before Unqlock can show its environment badge on them.',
    uses:['Show the environment badge and floating launcher on these domains'],
    done:'Automatic badges are on. Open tabs on these domains show the badge now.'
  }
};

type Phase = 'loading' | 'ask' | 'pending' | 'granted' | 'denied' | 'error';

export function AccessRequest({ kind, tab, onBusy }: { kind: AccessKind; tab?: string; onBusy: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [origins, setOrigins] = useState<string[]>([]);
  const [host, setHost] = useState<string | undefined>();
  const [error, setError] = useState('');
  const focus = useRef<HTMLButtonElement>(null);
  const text = copy[kind];

  // Tells the background, which finishes the request: it turns the option on, registers badges or
  // tells the page's floating menu.
  async function finish() {
    const result = await api.runtime.sendMessage({ type:'prompt.granted', kind, tab });
    if (!result?.ok) throw new Error(result?.error || 'Could not finish the request.');
    setPhase('granted');
  }

  useEffect(() => {
    api.runtime.sendMessage({ type:'prompt.describe', kind, tab }).then(async result => {
      if (!result?.ok) throw new Error(result?.error || 'Could not read the request.');
      setOrigins(result.origins);
      setHost(result.host);
      // Nothing left to ask for, such as badges granted in the meantime.
      if (!result.origins.length) await finish();
      else setPhase('ask');
    }).catch((reason: Error) => { setError(reason.message); setPhase('error'); });
  }, [kind, tab]);

  useEffect(() => {
    if (phase !== 'loading' && phase !== 'pending') focus.current?.focus();
  }, [phase]);

  async function allow() {
    setPhase('pending');
    onBusy(true);
    try {
      // The browser's prompt, called before any await so it still counts as this click.
      if (!await api.permissions.request({ origins })) { setPhase('denied'); return; }
      await finish();
    } catch (reason) { setError((reason as Error).message || 'Could not request site access.'); setPhase('error'); }
    finally { onBusy(false); }
  }

  if (phase === 'loading') return <p className="prompt-lead" role="status">Checking the request…</p>;
  if (phase === 'error') return (
    <section className="prompt-result" data-state="error" aria-labelledby="prompt-title">
      <span className="prompt-mark" aria-hidden="true">!</span>
      <h1 id="prompt-title">Access was not changed</h1>
      <p role="alert">{error} Close this window and try again from Unqlock.</p>
      <div className="prompt-actions"><button ref={focus} id="prompt-close" type="button" onClick={() => window.close()}>Close</button></div>
    </section>
  );
  if (phase === 'granted') return (
    <section className="prompt-result" data-state="success" aria-labelledby="prompt-title">
      <span className="prompt-mark" aria-hidden="true">✓</span>
      <h1 id="prompt-title">Access allowed</h1>
      <p role="status">{text.done}</p>
      <div className="prompt-actions"><button ref={focus} id="prompt-close" className="primary" type="button" onClick={() => window.close()}>Done</button></div>
    </section>
  );
  return (
    <section className="prompt-request" aria-labelledby="prompt-title" aria-busy={phase === 'pending'}>
      <h1 id="prompt-title">{text.title(host)}</h1>
      <p className="prompt-lead">{text.lead}</p>
      <div className="prompt-card">
        <h2>{origins.length === 1 ? 'Site' : 'Sites'}</h2>
        <ul className="prompt-sites">{origins.map(origin => <li key={origin} title={origin}>{originLabel(origin)}</li>)}</ul>
        <h2>Unqlock will</h2>
        <ul className="prompt-uses">{text.uses.map(use => <li key={use}>{use}</li>)}</ul>
      </div>
      <p className="prompt-fine">Unqlock never sends page data anywhere. You can remove this access at any time in your browser’s extension settings.</p>
      {phase === 'denied' && <p className="prompt-notice" role="alert">Access was not granted. Nothing changed.</p>}
      <div className="prompt-actions">
        <button id="prompt-cancel" type="button" disabled={phase === 'pending'} onClick={() => window.close()}>Not now</button>
        <button ref={focus} id="prompt-allow" className="primary" type="button" disabled={phase === 'pending'} onClick={allow}>{phase === 'denied' ? 'Try again' : 'Allow access'}</button>
      </div>
    </section>
  );
}
