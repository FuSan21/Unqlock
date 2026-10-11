// Detach for Unqork's dev overlay, an opt-in Debug tools option. Its two scripts are not in the manifest:
// the background registers them for builder pages only while the option is on.
export const key = 'devOverlayDetach';
export const enabled = (value: unknown) => value === true;
export const matches = ['https://*.unqork.io/*'];
export const scripts = [
  { id:'unqlock-dev-overlay', matches, js:['content-scripts/dev-overlay.js'], css:['content-scripts/dev-overlay.css'], runAt:'document_idle' as const, persistAcrossSessions:true },
  // Before Unqork's stores load, so the detached copy never saves over the builder tab's tabs and drawer.
  { id:'unqlock-dev-overlay-guard', matches, js:['content-scripts/dev-overlay-guard.js'], runAt:'document_start' as const, world:'MAIN' as const, persistAcrossSessions:true }
];
