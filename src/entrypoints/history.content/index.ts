import { defineContentScript } from 'wxt/utils/define-content-script';
import { whenIde } from '@/lib/builder-route';
import { watchLocal } from '@/lib/watch-storage';
import * as Panels from '@/lib/panel-settings';
import './style.css';

export default defineContentScript({
  // Every unqork.io page, since Unqork's module search reaches the builder without a page load.
  matches: ['https://*.unqork.io/*'],
  runAt: 'document_idle',
  // Don't broadcast WXT's start-up message to the page's own message listeners.
  noScriptStartedPostMessage: true,
  main() {
    // The history bridge in MAIN marks promoted and restored saves only while these attributes are on the root,
    // and style.css draws their badges; neither can read extension storage itself. Without storage, the
    // defaults apply.
    whenIde(() => watchLocal([Panels.promotionsKey, Panels.restoresKey], values => {
      const root = document.documentElement;
      const promotions = Panels.promotionsMode(values[Panels.promotionsKey]);
      if (promotions === 'native') root.removeAttribute('data-unqlock-history-promotions');
      else root.setAttribute('data-unqlock-history-promotions', promotions);
      const restores = Panels.restoresMode(values[Panels.restoresKey]);
      if (restores === 'native') root.removeAttribute('data-unqlock-history-restores');
      else root.setAttribute('data-unqlock-history-restores', restores);
    }));
  }
});
