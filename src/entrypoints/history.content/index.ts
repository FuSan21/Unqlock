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
    // The history bridge in MAIN marks promoted saves only while this attribute is on the root, and
    // style.css draws their badge; neither can read extension storage itself. Without storage, the default applies.
    whenIde(() => watchLocal([Panels.promotionsKey], values => {
      document.documentElement.toggleAttribute('data-unqlock-history-promotions', Panels.promotions(values[Panels.promotionsKey]));
    }));
  }
});
