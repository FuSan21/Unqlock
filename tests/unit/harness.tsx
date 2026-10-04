import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

export type ApiName = 'chrome' | 'browser';
export const apiNames: ApiName[] = ['chrome', 'browser'];
type Scope = Record<string, unknown>;

afterEach(() => {
  cleanup();
  delete (globalThis as Scope).chrome;
  delete (globalThis as Scope).browser;
  document.body.className = '';
  vi.doUnmock('@/popup/runtime');
  vi.restoreAllMocks();
});

interface Options {
  // The popup's address, such as a detached window's ?targetTab.
  url?: string;
  // Renders as the floating menu's frame on a page.
  embedded?: boolean;
}

// Installs an extension API double under one API name and renders a fresh copy of the popup,
// so the API chooser sees only that branch.
export async function renderPopup(apiName: ApiName, double: object, { url = 'https://extension.test/popup.html', embedded = false }: Options = {}) {
  vi.resetModules();
  history.replaceState(null, '', url);
  (globalThis as Scope)[apiName] = double;
  if (embedded) {
    vi.doMock('@/popup/runtime', async importOriginal => ({ ...await importOriginal<object>(), embedded:() => true }));
    vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  }
  const { App } = await import('@/popup/App');
  const result = render(<App />);
  await settle();
  return result;
}

// Lets pending promises, timers and React updates finish.
export async function settle(rounds = 10) {
  for (let round = 0; round < rounds; round++) await act(() => new Promise(resolve => setTimeout(resolve, 0)));
}

export const byId = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error('No element #' + id);
  return element as T;
};
export const query = <T extends Element = HTMLElement>(selector: string) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error('No element ' + selector);
  return element as T;
};
export const click = (target: string | Element) => fireEvent.click(typeof target === 'string' ? byId(target) : target);
// Types into a text field, select or textarea the way a person would, which React notices.
export const type = (target: string | Element, value: string) => fireEvent.change(typeof target === 'string' ? byId(target) : target, { target:{ value } });
export const press = (key: string, target: Element = document.activeElement || document.body) => fireEvent.keyDown(target, { key, bubbles:true, cancelable:true });
