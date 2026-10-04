import { useEffect, useRef, useState, type RefObject } from 'react';
import { api } from '@/lib/api';
import { DebugProvider } from './debug';
import { EnvironmentProvider } from './environment';
import { PagesProvider, usePages } from './pages';
import { embedded, params } from './runtime';
import { SettingsProvider } from './settings';
import { BuilderPanels } from './views/BuilderPanels';
import { CanvasLayout } from './views/CanvasLayout';
import { ComponentStyle } from './views/ComponentStyle';
import { DebugTools } from './views/DebugTools';
import { Environments } from './views/Environments';
import { FloatingLauncher } from './views/FloatingLauncher';
import { Home } from './views/Home';
import { ImportExport } from './views/ImportExport';

// Opens the page a URL asks for and sets the starting focus.
function Startup({ main }: { main: RefObject<HTMLElement | null> }) {
  const { open } = usePages();
  useEffect(() => {
    // Firefox opens import in a tab, since its toolbar popup closes when the file picker appears.
    if (params().get('page') === 'transfer-page') open('transfer-page');
    // The site-access window for Debug tools opens straight on its page.
    else if (params().get('permission') === 'debug') open('quick-page');
    else if (embedded()) {
      if (params().get('input') === 'keyboard') document.getElementById('environment-manage')?.focus();
      // Keep keyboard input inside the popup without selecting a menu item.
      else main.current?.focus();
    }
    document.body.classList.add('ready');
  }, [open, main]);
  return null;
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; closeOrigin: string | null };

export function App() {
  const [state, setState] = useState<State>({ status:'loading' });
  const main = useRef<HTMLElement>(null);
  const version = api.runtime?.getManifest?.().version;

  useEffect(() => {
    if (!embedded()) { setState({ status:'ready', closeOrigin:null }); return; }
    // Resolve the containing tab through the browser, never a page-supplied ID.
    api.runtime.sendMessage({ type:'floating.target' }).then(result => {
      if (!result?.ok) throw new Error('This page is not configured for Unqlock.');
      document.body.classList.add('embedded');
      setState({ status:'ready', closeOrigin:new URL(result.tab.url).origin });
    }).catch(() => setState({ status:'error' }));
  }, []);

  const closeOrigin = state.status === 'ready' ? state.closeOrigin : null;
  const close = closeOrigin ? () => parent.postMessage({ type:'unqlock.close' }, closeOrigin) : undefined;
  return (
    <>
      <button id="floating-close" type="button" aria-label="Close Unqlock menu" hidden={!close} onClick={close}>×</button>
      <header>
        <img src="/icons/icon-48.png" width="40" height="40" alt="" />
        <div><h1>Unqlock <span id="version" className="version">{version ? 'v' + version : ''}</span></h1><p>Your Unqork toolkit.</p></div>
      </header>
      <main ref={main} tabIndex={embedded() && params().get('input') !== 'keyboard' ? -1 : undefined} className={embedded() && params().get('input') !== 'keyboard' ? 'initial-focus' : undefined}>
        {state.status === 'error' && 'Could not open Unqlock on this page. Reload the page and try again.'}
        {state.status === 'ready' && (
          <PagesProvider onEscapeHome={close}>
            <SettingsProvider>
              <EnvironmentProvider>
                <DebugProvider>
                  <Home />
                  <ComponentStyle />
                  <CanvasLayout />
                  <BuilderPanels />
                  <DebugTools />
                  <Environments />
                  <FloatingLauncher />
                  <ImportExport />
                  <Startup main={main} />
                </DebugProvider>
              </EnvironmentProvider>
            </SettingsProvider>
          </PagesProvider>
        )}
      </main>
    </>
  );
}
