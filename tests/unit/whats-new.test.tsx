import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { expect, test } from 'vitest';
import * as Environment from '@/lib/environment';
import * as Notes from '@/lib/whats-new';
import { apiNames, byId, click, press, query, renderPopup, settle } from './harness';

const project = resolve(__dirname, '../..');
const pages = ['style-page', 'layout-page', 'panels-page', 'quick-page', 'environment-page', 'launcher-page', 'transfer-page'];

test('Release notes run newest first, cover the package version and match RELEASE-NOTES.md', () => {
  const versions = Notes.releases.map(release => release.version);
  for (const version of versions) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  for (let index = 1; index < versions.length; index++) expect(Notes.compare(versions[index - 1], versions[index])).toBeGreaterThan(0);
  const dates = Notes.releases.flatMap(release => release.date ? [release.date] : []);
  expect([...dates].sort().reverse()).toEqual(dates);
  for (const release of Notes.releases) {
    expect(release.items.length).toBeGreaterThan(0);
    for (const item of release.items) if (item.page) expect(pages).toContain(item.page);
  }
  // Every tagged version has notes, and the next release's notes are what RELEASE-NOTES.md describes.
  const { version } = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8'));
  expect(versions).toContain(version);
  const newest = Notes.releases[0];
  const document = readFileSync(resolve(project, 'docs/RELEASE-NOTES.md'), 'utf8');
  expect(document.match(/^## New in (\S+)/m)?.[1]).toBe(newest.version);
  for (const item of newest.items) expect(document).toContain('**' + item.title + ':**');
});

test('Versions compare numerically and only minor or major releases bring a notice', () => {
  expect(Notes.compare('1.10.0', '1.9.3')).toBeGreaterThan(0);
  expect(Notes.shipped('1.6.0')[0].version).toBe('1.6.0');
  expect(Notes.unseen('1.4.0', '1.6.0').map(release => release.version)).toEqual(['1.6.0', '1.5.0']);
  expect(Notes.notify('1.3.2', '1.3.3')).toBe(false);
  expect(Notes.notify('1.3.3', '1.4.0')).toBe(true);
  expect(Notes.notify(null, '1.6.0')).toBe(false);
  expect(Notes.state({ seen:'x', badge:'yes' })).toEqual({ seen:null, badge:false });
});

function double(version: string, whatsNew?: object) {
  const store: Record<string, unknown> = { whatsNew };
  const badges: string[] = [];
  const api = {
    storage:{ local:{ get:async (key?: string | string[]) => typeof key === 'string' ? { [key]:store[key] } : { ...store }, set:async (value: object) => { Object.assign(store, value); } }, onChanged:{ addListener:() => {}, removeListener:() => {} } },
    tabs:{ query:async () => [] },
    runtime:{ getManifest:() => ({ version }), sendMessage:async () => ({ ok:true, config:Environment.settings(undefined), missingOrigins:[] }) },
    permissions:{ contains:async () => false, request:async () => false },
    action:{ setBadgeText:async ({ text }: { text: string }) => { badges.push(text); } }
  };
  return { api, store, badges };
}

test.each(apiNames)('An update names the new version until its notes are read (%s)', async apiName => {
  const { api, store, badges } = double('1.6.0', { seen:'1.4.0', badge:true });
  await renderPopup(apiName, api);

  // Opening the popup clears the toolbar's NEW but keeps the home notice.
  expect(badges).toEqual(['']);
  expect(store.whatsNew).toEqual({ seen:'1.4.0', badge:false });
  expect(byId('update-summary').textContent).toBe('Updated to v1.6.0');

  click('update-open'); await settle();
  expect(byId('whats-new-page').hidden).toBe(false);
  expect(document.activeElement?.id).toBe('whats-new-title');
  expect(store.whatsNew).toEqual({ seen:'1.6.0', badge:false });
  // Unread releases are open and marked New; notes written ahead of the installed version stay hidden.
  const open = [...document.querySelectorAll('#whats-new-page section.release h3')].map(heading => heading.textContent);
  expect(open).toEqual(['Unqlock 1.6.0NewOctober 11, 2026', 'Unqlock 1.5.0NewOctober 4, 2026']);
  expect(document.getElementById('release-1-6-1')).toBeNull();
  expect(query('#release-1-4-0').tagName).toBe('DETAILS');
  expect(query('#release-1-0-0 summary').textContent).toBe('Unqlock 1.0.0September 17, 2026');
  expect(query('#release-1-5-0 em').textContent).toBe('Saving…');

  // A note's link opens its page, and returning lands on the What's new entry.
  const link = [...document.querySelectorAll<HTMLButtonElement>('#release-1-6-0 .release-link')].find(button => button.textContent === 'Open Floating launcher ›')!;
  click(link); await settle();
  expect(byId('launcher-page').hidden).toBe(false);
  press('Escape'); await settle();
  expect(document.activeElement?.id).toBe('open-whats-new');
  expect(document.getElementById('update-notice')).toBeNull();
});

test.each(apiNames)('The notice can be dismissed, and patches and older installs bring none (%s)', async apiName => {
  const update = double('1.4.0', { seen:'1.3.3', badge:false });
  await renderPopup(apiName, update.api);
  expect(update.badges).toEqual([]);
  click('update-dismiss'); await settle();
  expect(document.getElementById('update-notice')).toBeNull();
  expect(document.activeElement?.id).toBe('open-whats-new');
  expect(update.store.whatsNew).toEqual({ seen:'1.4.0', badge:false });

  // An unread patch is marked New on the page but brings no notice; an install from before What's new has nothing unread.
  for (const [whatsNew, marked] of [[{ seen:'1.3.2', badge:false }, 1], [undefined, 0]] as const) {
    cleanup();
    await renderPopup(apiName, double('1.3.3', whatsNew).api);
    expect(document.getElementById('update-notice')).toBeNull();
    click('open-whats-new'); await settle();
    expect([...document.querySelectorAll('#whats-new-page section.release')].map(section => section.id)).toEqual(['release-1-3-3']);
    expect(document.querySelectorAll('.release-new')).toHaveLength(marked);
  }
});
