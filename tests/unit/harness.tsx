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
  // The page's address, including any query string.
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

// Renders a fresh copy of the prompt window at its address, such as ?kind=import.
export async function renderPrompt(apiName: ApiName, double: object, query: string) {
  vi.resetModules();
  history.replaceState(null, '', 'https://extension.test/prompt.html?' + query);
  (globalThis as Scope)[apiName] = double;
  const { Prompt } = await import('@/popup/prompt/Prompt');
  const result = render(<Prompt />);
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

type StorageListener = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void;

// An in-memory storage.local with onChanged, reading keys the way the browser does: null for everything,
// a key, a list of keys, or an object of keys with defaults. A write reports itself to every listener, and
// `write` stands in for another copy of the popup or the prompt window writing.
export function memoryStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  const listeners = new Set<StorageListener>();
  const pick = (keys?: string | string[] | Record<string, unknown> | null) => {
    if (keys === null || keys === undefined) return structuredClone(data);
    const defaults = typeof keys === 'string' ? { [keys]:undefined } : Array.isArray(keys) ? Object.fromEntries(keys.map(key => [key, undefined])) : keys;
    return Object.fromEntries(Object.entries(defaults).flatMap(([key, fallback]) => key in data ? [[key, structuredClone(data[key])]] : fallback === undefined ? [] : [[key, fallback]]));
  };
  const write = (items: Record<string, unknown>) => {
    const changes = Object.fromEntries(Object.entries(items).map(([key, value]) => [key, { oldValue:data[key], newValue:structuredClone(value) }]));
    Object.assign(data, structuredClone(items));
    listeners.forEach(listener => listener(changes, 'local'));
  };
  return {
    data, write,
    storage:{
      local:{ get:async (keys?: Parameters<typeof pick>[0]) => pick(keys), set:async (items: Record<string, unknown>) => write(items) },
      onChanged:{ addListener:(listener: StorageListener) => { listeners.add(listener); }, removeListener:(listener: StorageListener) => { listeners.delete(listener); } }
    }
  };
}
