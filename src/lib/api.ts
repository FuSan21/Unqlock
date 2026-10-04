import type { WxtBrowser } from 'wxt/browser';

// Firefox's promise-based browser API when available, otherwise Chrome's. No polyfill is needed,
// and tests can supply either one to exercise both branches.
const scope = globalThis as unknown as { browser?: WxtBrowser; chrome?: WxtBrowser };
export const api: WxtBrowser = typeof scope.browser !== 'undefined' ? scope.browser : scope.chrome!;

// Stored values come from storage, imports or older versions, so models accept anything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Stored = any;
