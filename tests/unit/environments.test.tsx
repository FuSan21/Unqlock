import { expect, test } from 'vitest';
import * as Environment from '@/lib/environment';
import { apiNames, byId, click, press, query, renderPopup, settle, type } from './harness';

test.each(apiNames)('production guard, saved-host switcher and group editing (%s)', async apiName => {
  let config: Environment.EnvironmentSettings | { hosts: Record<string, string> } = { hosts:{ production:'custom.test', qa:'qa.test' } };
  let listener: (changes: object, area: string) => void = () => {};
  const calls: { args: { productionConfirmed?: boolean; production?: boolean }[] }[] = [];
  const settings = () => config as Environment.EnvironmentSettings;
  const api = {
    storage:{ local:{ get:async () => ({ environment:config }), set:async (value: { environment: typeof config }) => { config = value.environment; } }, onChanged:{ addListener:(fn: typeof listener) => { listener = fn; }, removeListener:() => {} } },
    tabs:{ query:async () => [{ id:7, url:'https://custom.test/app?x=1#/dashboard' }] },
    runtime:{ getManifest:() => ({ version:'1.0.0' }), sendMessage:async (message: { type: string; group?: Environment.Group; deleteId?: string; preferences?: object }) => {
      config = Environment.settings(config);
      if (message.type === 'environment.save') {
        if (message.group) config.groups = [...config.groups.filter(group => group.id !== message.group!.id), message.group];
        if (message.deleteId) config.groups = config.groups.filter(group => group.id !== message.deleteId);
        Object.assign(config, message.preferences);
      }
      return { ok:true, config, missingOrigins:['*://custom.test/*'] };
    } },
    permissions:{ request:async () => false },
    scripting:{ executeScript:async (injection: typeof calls[number]) => { calls.push(injection); return [{ result:{ ok:true, message:'Done' } }]; } }
  };
  await renderPopup(apiName, api);

  // Production actions confirm with Cancel focused, and re-read the guard when they run.
  click('open-quick'); await settle();
  click('tab-execute');
  type('component-key', 'run');
  click(query('[data-quick-action="trigger"]'));
  expect(byId('confirmation-text').textContent).toMatch(/PRODUCTION ENVIRONMENT/);
  expect(document.activeElement?.id).toBe('cancel-action');
  expect(calls).toHaveLength(0);
  click('confirm-action'); await settle();
  expect(calls[0].args[0].productionConfirmed).toBe(true);
  expect(calls[0].args[0].production).toBe(true);
  click(query('[data-quick-action="trigger"]'));
  settings().blockProduction = true;
  // Re-read policy at execution, even before a storage event reaches this popup.
  click('confirm-action'); await settle();
  expect(calls).toHaveLength(1);
  listener({ environment:{ newValue:config } }, 'local'); await settle();
  expect(query<HTMLButtonElement>('[data-quick-action="trigger"]').disabled).toBe(true);
  expect(query<HTMLButtonElement>('[data-quick-action="set"]').disabled).toBe(true);
  expect(query<HTMLButtonElement>('[data-quick-action="log"]').disabled).toBe(false);

  // The home strip links to the rest of the group, keeping the path.
  const link = query<HTMLAnchorElement>('#environment-links a');
  expect(link.href).toBe('https://qa.test/app?x=1#/dashboard');
  expect(link.textContent).toBe('Open in QA ↗');
  expect(byId('environment-summary').textContent).toMatch(/PRODUCTION · custom\.test/);

  click(query('#quick-page .page-back')); click('open-environment'); await settle();
  expect(byId('environment-current').textContent).toMatch(/^Current: PRODUCTION · custom\.test/);
  type(document.querySelectorAll('.environment-domain input')[1], 'https://bad.test'); await settle();
  expect(byId('environment-status').textContent).toMatch(/hostname only/);
  expect(settings().groups[0].domains[1].hostname).toBe('qa.test');
  expect(document.querySelector('#environment-form [name="badge"]')).toBeNull();
  click(query('[name="autoDiscover"]')); await settle();
  expect(settings().autoDiscover).toBe(false);
  expect(document.querySelectorAll<HTMLInputElement>('.environment-domain input')[1].value).toBe('https://bad.test');
  click('environment-access'); await settle();
  expect(byId('environment-status').textContent).toMatch(/not granted/);

  click('environment-new-group'); await settle();
  expect(document.activeElement?.id).toBe('environment-group-name');
  type('environment-group-name', 'Second organization');
  type(query('.environment-domain select'), 'staging');
  type(query('.environment-domain input'), 'second.test'); await settle();
  expect(settings().groups).toHaveLength(2);
  expect(settings().groups[0].domains).toHaveLength(2);
  const nameField = byId('environment-group-name');
  nameField.focus();
  for (const name of ['Second revised', 'Second final']) type(nameField, name);
  await settle();
  expect(settings().groups[1].name).toBe('Second final');
  expect(document.activeElement).toBe(nameField);
  click('environment-delete-group'); await settle();
  expect(settings().groups).toHaveLength(1);

  // Escape returns home and focuses the entry that opened the page.
  press('Escape');
  expect(byId('home').hidden).toBe(false);
  expect(document.activeElement?.id).toBe('open-environment');
});
