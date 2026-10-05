// Unqork's module search opens the builder by rewriting the URL of a page that started outside
// /ide/, and browsers inject content scripts only for the URL a page first loads. The builder
// scripts are therefore declared for every unqork.io page and start here the first time the
// route reaches /ide/; until then they only compare the path.
export const inIde = () => location.pathname.startsWith('/ide/');

export function whenIde(start: () => void) {
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
