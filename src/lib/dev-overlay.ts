import { flag } from './normalize';

// Detach for Unqork's dev overlay, an opt-in Debug tools option. Its two scripts are not in the manifest:
// the background registers them for builder pages only while the option is on. The isolated script also
// adds the Unqlock SSE debugger's button (src/lib/sse-debugger.ts), so it is registered while either is on.
export const key = 'devOverlayDetach';
export const enabled = flag;
export const matches = ['https://*.unqork.io/*'];
export const scripts = [
  { id:'unqlock-dev-overlay', matches, js:['content-scripts/dev-overlay.js'], css:['content-scripts/dev-overlay.css'], runAt:'document_idle' as const, persistAcrossSessions:true },
  // Before Unqork's stores load, so the detached copy never saves over the builder tab's tabs and drawer.
  { id:'unqlock-dev-overlay-guard', matches, js:['content-scripts/dev-overlay-guard.js'], runAt:'document_start' as const, world:'MAIN' as const, persistAcrossSessions:true }
];

// The scripts each combination of options needs: the guard serves only a detached copy.
export const needed = (detach: boolean, debuggerOn: boolean) => scripts.filter(script => script.world === 'MAIN' ? detach : detach || debuggerOn);
