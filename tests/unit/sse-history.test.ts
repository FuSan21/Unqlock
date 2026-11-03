import { beforeEach, expect, test } from 'vitest';
import { clearRuns, historyKey, readRuns, writeRuns, type StoredRun } from '@/lib/sse-history';

// The debugger's past runs in its page's localStorage: the newest 10, none older than 30 days, and a quota
// that refuses a large list drops the oldest runs first.
beforeEach(() => { localStorage.clear(); });

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 3, 12);
const run = (id: string, at: number, size = 0): StoredRun => ({
  id, at, title:'Module ' + id, moduleId:'646125c9ce236b1c9e80986d',
  request:{ url:'https://acme-staging.unqork.io/ide/', moduleId:'646125c9ce236b1c9e80986d', data:{ pad:'x'.repeat(size) }, shape:'data', mode:'designer', role:'Administrator' },
  response:{ ok:true, status:200, ms:5, headers:{}, body:{} }
});

test('keeps the newest 10, newest first, and reads them back', () => {
  const runs = Array.from({ length:12 }, (_, index) => run('r' + index, now - index * 1000));
  expect(writeRuns(localStorage, [...runs].reverse(), now).map(each => each.id)).toEqual(runs.slice(0, 10).map(each => each.id));
  expect(readRuns(localStorage, now)).toEqual(runs.slice(0, 10));
});

test('drops runs older than 30 days when reading and writing', () => {
  writeRuns(localStorage, [run('new', now - day), run('old', now - 31 * day)], now);
  expect(readRuns(localStorage, now).map(each => each.id)).toEqual(['new']);
  expect(readRuns(localStorage, now + 30 * day).map(each => each.id)).toEqual([]);
  expect(writeRuns(localStorage, readRuns(localStorage, now + 30 * day), now + 30 * day)).toEqual([]);
  expect(localStorage.getItem(historyKey)).toBeNull();
});

test('ignores stored text that is not a list of runs, and Clear removes it', () => {
  localStorage.setItem(historyKey, '{not json');
  expect(readRuns(localStorage, now)).toEqual([]);
  localStorage.setItem(historyKey, JSON.stringify([run('ok', now), { id:1 }, null, { ...run('bad', now), request:{ data:[] } }]));
  expect(readRuns(localStorage, now).map(each => each.id)).toEqual(['ok']);
  clearRuns(localStorage);
  expect(localStorage.getItem(historyKey)).toBeNull();
});

test('a full quota drops the oldest runs first, and a run too large alone is left out', () => {
  // A stand-in storage that refuses anything over 2,000 characters, as a quota would.
  const items = new Map<string, string>();
  const storage = {
    getItem:(key: string) => items.get(key) ?? null,
    setItem:(key: string, value: string) => { if (value.length > 2000) throw new DOMException('Quota exceeded', 'QuotaExceededError'); items.set(key, value); },
    removeItem:(key: string) => { items.delete(key); }
  } as Storage;
  const older = [run('a', now - 3000, 500), run('b', now - 2000, 500), run('c', now - 1000, 500)];
  expect(writeRuns(storage, older, now).map(each => each.id)).toEqual(['c', 'b']);
  expect(writeRuns(storage, [run('d', now, 500), ...readRuns(storage, now)], now).map(each => each.id)).toEqual(['d', 'c']);
  expect(writeRuns(storage, [run('huge', now + 1, 5000), ...readRuns(storage, now)], now).map(each => each.id)).toEqual(['d', 'c']);
  expect(readRuns(storage, now).map(each => each.id)).toEqual(['d', 'c']);
});
