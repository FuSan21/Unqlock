import { waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { apiNames, byId, click, renderPopup, settle, type } from './harness';

const builder = 'https://fixture.unqork.io/ide/builder/workspaces/test/modules/first';

test.each(apiNames)('queued saves and resets, focus, measured widths and validation (%s)', async apiName => {
  const saved: Record<string, any> = {};
  const widths: Record<string, number> = {};
  await renderPopup(apiName, {
    storage:{ local:{
      get:async () => structuredClone(saved),
      // Slow writes let changes queue up behind each other.
      set:async (patch: object) => { await new Promise(resolve => setTimeout(resolve, 30)); Object.assign(saved, structuredClone(patch)); }
    }, onChanged:{ addListener:() => {}, removeListener:() => {} } },
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
