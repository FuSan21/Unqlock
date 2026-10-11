import { fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import * as Environment from '@/lib/environment';
import { apiNames, byId, click, press, query, renderPrompt, settle } from './harness';

type Message = { type: string; kind?: string; tab?: string; replace?: unknown };

// The prompt window asks the background what to request, shows the browser's prompt from its own
// click, and lets the background finish a granted request.
test.each(apiNames)('site access: describe, decline, allow and finish (%s)', async apiName => {
  const messages: Message[] = [];
  const requests: string[][] = [];
  let answer = false;
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  await renderPrompt(apiName, {
    runtime:{ sendMessage:async (message: Message) => {
      messages.push(message);
      if (message.type === 'prompt.describe') return { ok:true, origins:['https://first-prod.unqork.io/*'], host:'first-prod.unqork.io' };
      return { ok:true };
    } },
    permissions:{ request:async ({ origins }: { origins: string[] }) => { requests.push(origins); return answer; } }
  }, 'kind=debug&tab=7');
  expect(messages[0]).toEqual({ type:'prompt.describe', kind:'debug', tab:'7' });
  expect(byId('prompt-title').textContent).toBe('Allow Debug tools on first-prod.unqork.io?');
  expect(query('.prompt-sites').textContent).toBe('first-prod.unqork.io');
  expect(document.activeElement?.id).toBe('prompt-allow');

  // Declining changes nothing and offers another try.
  click('prompt-allow'); await settle();
  expect(requests).toEqual([['https://first-prod.unqork.io/*']]);
  expect(messages.some(message => message.type === 'prompt.granted')).toBe(false);
  expect(query('[role="alert"]').textContent).toMatch(/not granted/);
  expect(byId('prompt-allow').textContent).toBe('Try again');

  answer = true;
  click('prompt-allow'); await settle();
  expect(messages.at(-1)).toEqual({ type:'prompt.granted', kind:'debug', tab:'7' });
  expect(byId('prompt-title').textContent).toBe('Access allowed');
  expect(document.activeElement?.id).toBe('prompt-close');
  click('prompt-close');
  expect(close).toHaveBeenCalled();
});

test('an address without a request asks for nothing', async () => {
  const sendMessage = vi.fn();
  await renderPrompt('chrome', { runtime:{ sendMessage } }, 'kind=everything');
  expect(query('[role="alert"]').textContent).toMatch(/opened without a request/);
  expect(sendMessage).not.toHaveBeenCalled();
});

test('site access: a failed lookup explains itself, and Escape closes the window', async () => {
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  await renderPrompt('chrome', { runtime:{ sendMessage:async () => ({ ok:false, error:'Page is not configured.' }) } }, 'kind=debug&tab=7');
  expect(byId('prompt-title').textContent).toBe('Access was not changed');
  expect(query('[role="alert"]').textContent).toMatch(/Page is not configured/);
  press('Escape');
  expect(close).toHaveBeenCalled();
});

test('site access: nothing left to ask for finishes at once', async () => {
  const messages: Message[] = [];
  await renderPrompt('browser', { runtime:{ sendMessage:async (message: Message) => {
    messages.push(message);
    return message.type === 'prompt.describe' ? { ok:true, origins:[] } : { ok:true };
  } } }, 'kind=badges');
  expect(messages.map(message => message.type)).toEqual(['prompt.describe', 'prompt.granted']);
  expect(byId('prompt-title').textContent).toBe('Access allowed');
});

test.each(apiNames)('import: pick or drop a file, review the sections and import (%s)', async apiName => {
  const store: Record<string, unknown> = { appearance:{ icons:false }, floating:{ enabled:false, mode:'fixed', corner:'bottom-left' } };
  const messages: Message[] = [];
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  await renderPrompt(apiName, {
    storage:{ local:{
      get:async (keys: string[]) => structuredClone(Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]))),
      set:async (value: object) => { Object.assign(store, structuredClone(value)); }
    } },
    runtime:{ sendMessage:async (message: Message) => {
      messages.push(message);
      const config = Environment.settings(message.replace);
      return { ok:true, config, missingOrigins:Environment.customOrigins(config) };
    } }
  }, 'kind=import');
  expect(byId('prompt-title').textContent).toBe('Import a settings file');
  expect(document.activeElement?.id).toBe('prompt-choose');
  const input = byId<HTMLInputElement>('prompt-file');
  let picked = false;
  input.click = () => { picked = true; };
  click('prompt-choose');
  expect(picked).toBe(true);

  const file = (name: string, text: string, size = text.length) => ({ name, size, text:async () => text });
  // Files that are not exports are refused before anything changes.
  fireEvent.change(input, { target:{ files:[file('notes.txt', 'hello')] } }); await settle();
  expect(byId('prompt-error').textContent).toMatch(/not valid JSON/);
  fireEvent.change(input, { target:{ files:[file('huge.json', '{}', 2 * 1024 * 1024)] } }); await settle();
  expect(byId('prompt-error').textContent).toMatch(/larger than 1 MB/);

  const exported = { unqlock:1, extensionVersion:'1.6.0', settings:{
    appearance:{ icons:true }, floating:{ enabled:true, mode:'draggable', corner:'top-right' },
    environment:{ groups:[{ id:'custom', name:'Custom', domains:[{ hostname:'custom.test', environment:'production' }] }] }
  } };
  // Dropping a file works like choosing one.
  fireEvent.drop(query('.prompt-drop'), { dataTransfer:{ files:[file('team.json', JSON.stringify(exported))] } }); await settle();
  expect(byId('prompt-title').textContent).toBe('Choose what to import');
  expect(byId('prompt-file-name').textContent).toBe('team.json');
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>('#prompt-sections input')];
  expect(boxes().map(box => box.name)).toEqual(['style', 'environments', 'launcher']);
  for (const box of boxes()) if (box.checked) click(box);
  click('prompt-import'); await settle();
  expect(byId('prompt-error').textContent).toMatch(/Choose at least one/);

  click(boxes().find(box => box.name === 'launcher')!);
  click(boxes().find(box => box.name === 'environments')!);
  click('prompt-import'); await settle();
  expect(store.floating).toEqual({ enabled:true, mode:'draggable', corner:'top-right' });
  expect((store.appearance as { icons: boolean }).icons).toBe(false);
  expect(messages.filter(message => message.type === 'environment.save')).toHaveLength(1);
  expect(byId('prompt-import-done').textContent).toBe('Imported Environments, Floating launcher. Open Environments to enable automatic badges on custom domains.');
  expect(document.activeElement?.id).toBe('prompt-close');
  click('prompt-close');
  expect(close).toHaveBeenCalled();
});
