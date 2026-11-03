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

test('keeps one copy of a run two windows both saved, the first one given', () => {
  const held = { ...run('same', now - 1000), title:'Held here' };
  const stored = writeRuns(localStorage, [held, run('other', now), run('same', now - 1000)], now);
  expect(stored.map(each => each.id)).toEqual(['other', 'same']);
  expect(stored[1].title).toBe('Held here');
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

test('a full quota trims the largest runs first, then drops the oldest, and leaves out a run whose input is too large', () => {
  // A stand-in storage that refuses anything over 3,000 characters, as a quota would.
  const items = new Map<string, string>();
  const storage = {
    getItem:(key: string) => items.get(key) ?? null,
    setItem:(key: string, value: string) => { if (value.length > 3000) throw new DOMException('Quota exceeded', 'QuotaExceededError'); items.set(key, value); },
    removeItem:(key: string) => { items.delete(key); }
  } as Storage;
  // A run with a large event log and a failure the outcome still needs.
  const logged = (id: string, at: number) => ({ ...run(id, at), summary:{ steps:3, sets:2 }, response:{ ok:false, status:412, ms:9, headers:{},
    body:{ eventLog:'x'.repeat(1200), executionError:{ component:'callService', message:'Request failed' }, validationErrors:[] } } });
  const kept = writeRuns(storage, [logged('a', now - 2000), logged('b', now - 1000), run('c', now)], now);
  expect(kept.map(each => [each.id, each.trimmed === true])).toEqual([['c', false], ['b', true], ['a', false]]);
  expect(kept[1].response).toEqual({ ok:false, status:412, ms:9, headers:{}, body:{ executionError:{ component:'callService', message:'Request failed' }, validationErrors:[] } });
  expect(kept[1].summary).toEqual({ steps:3, sets:2 });
  expect(readRuns(storage, now)).toEqual(kept);

  // Once every large run is trimmed, the oldest go.
  expect(writeRuns(storage, [run('d', now + 1, 2200), ...readRuns(storage, now)], now).map(each => each.id)).toEqual(['d', 'c']);
  // An input too large to store even trimmed is left out, keeping the others.
  expect(writeRuns(storage, [run('huge', now + 2, 5000), ...readRuns(storage, now)], now).map(each => each.id)).toEqual(['d', 'c']);
});
