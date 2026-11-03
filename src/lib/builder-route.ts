// Unqork's module search opens the builder by rewriting the URL of a page that started outside
// /ide/, and browsers inject content scripts only for the URL a page first loads. The builder
// scripts are therefore declared for every unqork.io page and start here the first time the
// route reaches /ide/; until then they only compare the path.
export const inIde = () => location.pathname.startsWith('/ide/');
// The builder itself, where canvas and toolbar features apply.
export const inBuilder = () => location.pathname.startsWith('/ide/builder/');
// The module open in the builder, as its path, or '' elsewhere. The panel content script and its MAIN-world
// bridge both key panel state by it, so they read it from here.
export const moduleRoute = () => location.pathname.match(/^\/ide\/builder\/workspaces\/[^/]+\/modules\/[^/]+/)?.[0] || '';

// A detached dev overlay is a second copy of the builder in a popup opened under this window name,
// which survives its reloads. Only the overlay is shown there, so the builder scripts stand down.
export const detachedName = 'unqlock-dev-overlay';
export const isDetached = () => window.name === detachedName;

export function whenIde(start: () => void) {
  if (isDetached()) return;
  if (inIde()) { start(); return; }
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  // pushState fires no event; the Navigation API reports it where available, a light poll elsewhere.
  const timer = navigation ? 0 : setInterval(check, 500);
  navigation?.addEventListener('currententrychange', check);
  window.addEventListener('popstate', check);
  function check() {
    if (!inIde()) return;
    clearInterval(timer);
    navigation?.removeEventListener('currententrychange', check);
    window.removeEventListener('popstate', check);
    start();
  }
}
