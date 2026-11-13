import { expect, test } from 'vitest';
import { describe, lanes, restoredFrom, sameMoment, saveOf, sourceOf, wallTime, type Save } from '@/lib/history-restores';

const utc = new Intl.DateTimeFormat('en-US', { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'UTC' });
const format = (time: number) => utc.format(time);
const none = new Map<string, string>();

// One module's saves, newest first, shaped as a live History list (Unqork 9.0.8, November 2026) held them.
const records = [
  { _id:'renamed', form:'m', archiveName:'Sprint build', status:'restored', created:'2026-11-13T17:31:50.504Z', notes:'Ticket 7\nmore' },
  { _id:'restoredNamed', form:'m', archiveName:'(Restored) Sprint build', status:'restored', created:'2026-11-13T02:20:18.139Z', notes:'Ticket 7' },
  { _id:'named', form:'m', archiveName:'Sprint build', status:'', created:'2026-11-12T21:31:28.285Z', notes:'Ticket 7' },
  { _id:'chain2', form:'m', archiveName:'(Restored) (Restored) 11/12/2026, 7:29 PM', status:'restored', created:'2026-11-12T20:37:15.794Z', notes:'' },
  { _id:'elsewhere', form:'m', archiveName:'(Restored) 11/12/2026, 1:29 PM', status:'restored', created:'2026-11-12T20:30:00.000Z', notes:'' },
  { _id:'chain1', form:'m', archiveName:'(Restored) 11/12/2026, 7:29 PM', status:'restored', created:'2026-11-12T20:06:59.064Z', notes:'' },
  { _id:'dated', form:'m', status:'', created:'2026-11-12T19:29:10.000Z', notes:'' },
  { _id:'olderName', form:'m', archiveName:'Sprint build', status:'', created:'2026-10-01T10:00:00.000Z', notes:'Other ticket' },
  { _id:'gone', form:'m', archiveName:'(Restored) Deleted save', status:'restored', created:'2026-09-01T10:00:00.000Z', notes:'' }
];
const saves = records.map(record => saveOf(record, format)!) as Save[];
const save = (id: string) => saves.find(each => each.id === id)!;

test('reads a save record, labelling an unnamed save with its date as History does', () => {
  expect(save('dated')).toEqual({ id:'dated', module:'m', label:'11/12/2026, 7:29 PM', named:false, restored:false, created:Date.parse('2026-11-12T19:29:10.000Z'), notes:'' });
  expect(save('restoredNamed').restored).toBe(true);
  for (const record of [null, {}, { _id:3 }]) expect(saveOf(record, format)).toBeNull();
});

test('a restored name points to the label after one "(Restored)"', () => {
  expect(restoredFrom('(Restored) (Restored) Aug 22, 10:50 AM')).toBe('(Restored) Aug 22, 10:50 AM');
  expect(restoredFrom('AEPT-2607')).toBeNull();
});

test('matches a restore to the nearest older save with that label, preferring notes it begins with', () => {
  expect(sourceOf(save('restoredNamed'), saves, none)).toEqual({ id:'named', label:'Sprint build', how:'name' });
  // Of two saves with that label, the one whose notes the restore's notes begin with wins over the nearer one.
  expect(sourceOf({ ...save('restoredNamed'), notes:'Other ticket, restored' }, saves, none).id).toBe('olderName');
  // A chain of restores links each to the one before.
  expect(sourceOf(save('chain2'), saves, none).id).toBe('chain1');
  expect(sourceOf(save('chain1'), saves, none)).toEqual({ id:'dated', label:'11/12/2026, 7:29 PM', how:'name' });
});

test('a date from another time zone matches an unnamed save probably; nothing else matches', () => {
  // 1:29 PM is 19:29 UTC in UTC−6.
  expect(sourceOf(save('elsewhere'), saves, none)).toEqual({ id:'dated', label:'11/12/2026, 7:29 PM', how:'date' });
  expect(sourceOf(save('gone'), saves, none)).toEqual({ id:null, label:'Deleted save', how:'none' });
  // A renamed restore has no name to follow until its detail names the source.
  expect(sourceOf(save('renamed'), saves, none)).toEqual({ id:null, label:'', how:'none' });
  expect(sourceOf(save('renamed'), saves, new Map([['renamed', 'named']]))).toEqual({ id:'named', label:'Sprint build', how:'exact' });
});

test('reads History dates and compares them across time zones', () => {
  const wall = wallTime('11/13/2026, 1:29 AM')!;
  expect(wall).toBe(Date.UTC(2026, 10, 13, 1, 29));
  expect(wallTime('Aug 22, 10:50 AM')).toBeNull();
  const created = Date.parse('2026-11-12T19:29:10.000Z');
  // UTC+6, UTC+5:45 and UTC−6 all read a time that shows; a time 30 s off a quarter hour does not.
  expect(sameMoment(wall, created)).toBe(true);
  expect(sameMoment(wallTime('11/13/2026, 1:14 AM')!, created)).toBe(true);
  expect(sameMoment(wallTime('11/12/2026, 1:29 PM')!, created)).toBe(true);
  expect(sameMoment(wall, created + 30_000 + 7 * 60_000)).toBe(false);
  // Beyond UTC+14 nothing matches.
  expect(sameMoment(wallTime('11/13/2026, 11:29 AM')!, created)).toBe(false);
});

test('describes the source for the badge tooltip', () => {
  const text = (id: string, known = none) => describe(sourceOf(save(id), saves, known), saves, format);
  expect(text('restoredNamed')).toBe('Restored from “Sprint build”, saved 11/12/2026, 9:31 PM');
  expect(text('chain1')).toBe('Restored from “11/12/2026, 7:29 PM”');
  expect(text('elsewhere')).toBe('Probably restored from “11/12/2026, 7:29 PM”');
  expect(text('gone')).toBe('Restored from “Deleted save”, which is not in the list');
  expect(text('renamed')).toBe('Restored from an earlier save. Select this save to find which one');
  expect(text('renamed', new Map([['renamed', 'unknown']]))).toBe('Restored from a save that is not in the list');
});

test('overlapping guides take separate lanes, sharing the one that frees first when all are taken', () => {
  expect(lanes([[0, 10], [5, 20], [12, 30], [6, 8], [7, 9]])).toEqual([0, 1, 0, 2, 2]);
});
