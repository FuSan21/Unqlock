import { defineContentScript } from 'wxt/utils/define-content-script';
import { isDetached } from '@/lib/builder-route';

// The workspace tabs and the overlay's own open state and height. A detached copy would save a stale
// tab list on pagehide and its full-window drawer, overwriting what the main tab saved.
const ignored = new Set(['ide-workspace-store', 'ide-dev-overlay']);

export default defineContentScript({
  // Registered by the background, on every unqork.io page at document_start, only while Debug tools →
  // Detach dev overlay is on (src/lib/dev-overlay.ts).
  registration: 'runtime',
  world: 'MAIN',
  main() {
    if (!isDetached()) return;
    const { setItem, removeItem } = Storage.prototype;
    const skip = (storage: Storage, key: unknown) => {
      try { return storage === window.localStorage && ignored.has(String(key)); } catch { return false; }
    };
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (!skip(this, key)) setItem.call(this, key, value);
    };
    Storage.prototype.removeItem = function (this: Storage, key: string) {
      if (!skip(this, key)) removeItem.call(this, key);
    };
  }
});
