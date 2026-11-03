import { act } from '@testing-library/react';
import { expect, test } from 'vitest';
import { apiNames, click, memoryStorage, query, renderPopup, settle } from './harness';

// The toolbar popup and a floating menu can be open at once, and the prompt window imports settings. Each
// copy follows what the others write, so its next save does not put back the values it loaded.
test.each(apiNames)('popup settings follow changes made elsewhere and save on top of them (%s)', async apiName => {
  const memory = memoryStorage({ appearance:{ enabled:true, compact:false }, floating:{ enabled:false, mode:'fixed', corner:'bottom-left' } });
  await renderPopup(apiName, {
    storage:memory.storage,
    tabs:{ query:async () => [{ id:7, url:'https://example.test/app' }] },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async () => ({ ok:true, config:{}, missingOrigins:[] }) }
  });
  const toggle = (key: string) => query<HTMLInputElement>(`#home [data-appearance="${key}"]`);
  expect(toggle('compact').checked).toBe(false);

  // Another copy turns on compact rows.
  await act(async () => memory.write({ appearance:{ ...memory.data.appearance as object, compact:true } }));
  expect(toggle('compact').checked).toBe(true);

  // A save here keeps that change.
  click(toggle('enabled')); await settle();
  expect(memory.data.appearance).toMatchObject({ enabled:false, compact:true });

  // Floating launcher follows a change made elsewhere while it is open.
  click(query('[aria-controls="launcher-page"]')); await settle();
  await act(async () => memory.write({ floating:{ enabled:true, mode:'draggable', corner:'top-right' } }));
  expect(query<HTMLInputElement>('#launcher-page input[name="enabled"]').checked).toBe(true);
  click(query('#launcher-page input[name="enabled"]')); await settle();
  expect(memory.data.floating).toEqual({ enabled:false, mode:'draggable', corner:'top-right' });
});
