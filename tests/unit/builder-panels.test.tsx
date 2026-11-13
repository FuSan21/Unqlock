import { waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { apiNames, byId, click, memoryStorage, renderPopup, settle, type } from './harness';

const builder = 'https://fixture.unqork.io/ide/builder/workspaces/test/modules/first';

test.each(apiNames)('queued saves and resets, focus, measured widths and validation (%s)', async apiName => {
  // Slow writes let changes queue up behind each other.
  const memory = memoryStorage({}, { delay:30 });
  const saved: Record<string, any> = memory.data;
  const widths: Record<string, number> = {};
  await renderPopup(apiName, {
    storage:memory.storage,
    tabs:{ query:async () => [{ id:1, url:builder }], sendMessage:async () => ({ widths:structuredClone(widths) }) },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async () => ({ ok:true, config:{}, missingOrigins:[] }) }
  });
  click('open-panels'); await settle();
  const form = byId('panels-form');
  const start = document.querySelector<HTMLInputElement>('input[name="agent-visibility"][value="start"]')!;
  start.focus();
  click(start);
  expect(document.activeElement).toBe(start);
  expect(form.getAttribute('aria-busy')).toBe('true');
  click(document.querySelector('input[name="agent-visibility"][value="always"]')!);
  // Always collapsed locks the width switches and explains why.
  expect(document.querySelector<HTMLInputElement>('input[name="agent-sizing"][value="custom"]')!.disabled).toBe(true);
  click('panels-reset');
  await waitFor(() => expect(form.getAttribute('aria-busy')).toBe('false'));
  expect(saved.builderPanels.agent.visibility).toBe('native');

  // Use current width waits for the panel to open, then picks up its width.
  const useCurrent = document.querySelector<HTMLButtonElement>('[aria-label="Use current Build Agent width"]')!;
  expect(useCurrent.disabled).toBe(true);
  expect(useCurrent.closest('.disabled-explanation')?.getAttribute('aria-label')).toBe('Why Use current Build Agent width is unavailable');
  widths.agent = 420;
  await waitFor(() => expect(useCurrent.disabled).toBe(false), { timeout:3000 });
  click(useCurrent);
  await waitFor(() => expect(saved.builderPanels?.agent.width).toBe(420));
  expect(saved.builderPanels.agent.sizing).toBe('custom');

  // Widths save on commit; an invalid width keeps the saved one.
  const width = byId<HTMLInputElement>('agent-width');
  expect(width.disabled).toBe(false);
  type(width, '20'); await settle();
  expect(width.getAttribute('aria-invalid')).toBe('true');
  expect(byId('panels-status').textContent).toMatch(/whole-number width/);
  type(width, '500');
  await waitFor(() => expect(saved.builderPanels.agent.width).toBe(500));
  expect(width.hasAttribute('aria-invalid')).toBe(false);
});

test.each(apiNames)('navigation tabs switch loads, saves and resets with all panels (%s)', async apiName => {
  const memory = memoryStorage({ navigationTabs:'hidden', navigationTabsCollapsed:true });
  const saved: Record<string, any> = memory.data;
  await renderPopup(apiName, {
    storage:memory.storage,
    tabs:{ query:async () => [{ id:1, url:builder }], sendMessage:async () => ({ widths:{} }) },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async () => ({ ok:true, config:{}, missingOrigins:[] }) }
  });
  click('open-panels'); await settle();
  const option = (value: string) => document.querySelector<HTMLInputElement>('input[name="navigation-tabs"][value="' + value + '"]')!;
  expect(option('hidden').checked).toBe(true);
  expect(option('hidden').getAttribute('aria-label')).toBe('Navigation tabs: Hidden');
  // Hidden has no bar to collapse, so the switch is unavailable but keeps its saved value.
  const collapse = () => document.querySelector<HTMLInputElement>('input[name="navigation-tabs-collapsed"]')!;
  expect(collapse().checked).toBe(true);
  expect(collapse().disabled).toBe(true);
  expect(document.querySelector('[aria-label="Why Collapse until header hover is unavailable"]')).not.toBeNull();
  click(option('native'));
  await waitFor(() => expect(saved.navigationTabs).toBe('native'));
  expect(byId('panels-status').textContent).toMatch(/New tabs open as usual/);
  expect(collapse().disabled).toBe(false);
  click(collapse());
  await waitFor(() => expect(saved.navigationTabsCollapsed).toBe(false));
  expect(byId('panels-status').textContent).toMatch(/stays open/);
  click(collapse());
  await waitFor(() => expect(saved.navigationTabsCollapsed).toBe(true));
  expect(byId('panels-status').textContent).toMatch(/hover the header/);
  expect(option('wrapped').getAttribute('aria-label')).toBe('Navigation tabs: Multi-line');
  click(option('wrapped'));
  await waitFor(() => expect(saved.navigationTabs).toBe('wrapped'));
  expect(byId('panels-status').textContent).toMatch(/full names/);
  click(option('hidden'));
  await waitFor(() => expect(saved.navigationTabs).toBe('hidden'));
  expect(byId('panels-status').textContent).toMatch(/keep only their current tab/);
  click('panels-reset');
  await waitFor(() => expect(saved.navigationTabs).toBe('native'));
  expect(option('native').checked).toBe(true);
  expect(saved.navigationTabsCollapsed).toBe(false);
  expect(collapse().checked).toBe(false);
});

test.each(apiNames)('promotion badges in History load, save and reset with all panels (%s)', async apiName => {
  const memory = memoryStorage({ historyPromotions:false });
  const saved: Record<string, any> = memory.data;
  await renderPopup(apiName, {
    storage:memory.storage,
    tabs:{ query:async () => [{ id:1, url:builder }], sendMessage:async () => ({ widths:{} }) },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async () => ({ ok:true, config:{}, missingOrigins:[] }) }
  });
  click('open-panels'); await settle();
  const badges = () => document.querySelector<HTMLInputElement>('input[name="history-promotions"]')!;
  expect(badges().checked).toBe(false);
  expect(badges().getAttribute('aria-describedby')).toBe('history-promotions-help');
  click(badges());
  await waitFor(() => expect(saved.historyPromotions).toBe(true));
  expect(byId('panels-status').textContent).toMatch(/marks promoted saves/);
  click(badges());
  await waitFor(() => expect(saved.historyPromotions).toBe(false));
  expect(byId('panels-status').textContent).toMatch(/as Unqork does/);
  // On is the default, which Reset all builder panels restores.
  click('panels-reset');
  await waitFor(() => expect(saved.historyPromotions).toBe(true));
  expect(badges().checked).toBe(true);
});

test.each(apiNames)('restored saves in History load, save and reset with all panels (%s)', async apiName => {
  const memory = memoryStorage({ historyRestores:'native' });
  const saved: Record<string, any> = memory.data;
  await renderPopup(apiName, {
    storage:memory.storage,
    tabs:{ query:async () => [{ id:1, url:builder }], sendMessage:async () => ({ widths:{} }) },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async () => ({ ok:true, config:{}, missingOrigins:[] }) }
  });
  click('open-panels'); await settle();
  const option = (value: string) => document.querySelector<HTMLInputElement>('input[name="history-restores"][value="' + value + '"]')!;
  expect(option('native').checked).toBe(true);
  click(option('always'));
  await waitFor(() => expect(saved.historyRestores).toBe('always'));
  expect(byId('panels-status').textContent).toMatch(/guide from each restored save/);
  click(option('native'));
  await waitFor(() => expect(saved.historyRestores).toBe('native'));
  expect(byId('panels-status').textContent).toMatch(/as Unqork does/);
  // On hover is the default, which Reset all builder panels restores.
  click('panels-reset');
  await waitFor(() => expect(saved.historyRestores).toBe('hover'));
  expect(option('hover').checked).toBe(true);
});
