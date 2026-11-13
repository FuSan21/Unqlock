// Restored saves in Unqork's History. Restoring a save makes a new save with the status "restored", named
// "(Restored) " followed by the source's name or, for an unnamed save, its date as History shows it, which the
// person restoring can still change, and holding the source's notes, to which they can add. Only the selected
// save's detail names its source, as `sourceArchiveId`; the list does not, so any other restore is matched by
// that name: the nearest older save with that label, preferring one whose notes begin the restored save's notes.
// An unnamed source's date was written in the restorer's time zone, so a date no label matches is tried against
// each unnamed save's time in every time zone, and that match is only probable.
export interface Save {
  id: string;
  module: string;
  label: string;
  named: boolean;
  restored: boolean;
  created: number | null;
  notes: string;
}
export interface Source {
  // The source save's ID, or null when it is not known.
  id: string | null;
  // The label the restored save's name gives, or the exact source's label.
  label: string;
  how: 'exact' | 'name' | 'date' | 'none';
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

// A save record as the History list and its detail hold it: `{ _id, form, archiveName?, status, created, notes, … }`.
export function saveOf(revision: unknown, format: (time: number) => string): Save | null {
  const record = revision as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || typeof record._id !== 'string') return null;
  const parsed = Date.parse(text(record.created));
  const created = Number.isNaN(parsed) ? null : parsed;
  const name = text(record.archiveName).trim();
  return {
    id:record._id,
    module:text(record.form),
    label:name || (created === null ? '' : format(created)),
    named:Boolean(name),
    restored:record.status === 'restored',
    created,
    notes:text(record.notes)
  };
}

const prefix = /^\(Restored\)\s*/;
// The label a restored save's name points to, one "(Restored)" removed, or null for a name without it.
export const restoredFrom = (label: string) => prefix.test(label) ? label.replace(prefix, '').trim() : null;

const minute = 60_000;
const quarter = 15 * minute;
const hour = 60 * minute;
// History's own date, such as 11/13/2026, 1:29 AM, as the wall-clock time it shows, counted as UTC.
export function wallTime(label: string): number | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AP])\.?\s?M\.?$/i.exec(label.trim());
  if (!match) return null;
  const hours = Number(match[4]) % 12 + (match[6].toUpperCase() === 'P' ? 12 : 0);
  return Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), hours, Number(match[5]));
}
// Whether a save made at `created` shows as `wall` in some time zone, offset by whole quarter hours from UTC−12
// to UTC+14. History drops the seconds, so the wall time is up to a minute behind.
export function sameMoment(wall: number, created: number) {
  const offset = wall - created;
  const zone = Math.ceil(offset / quarter) * quarter;
  return zone < offset + minute && zone >= -12 * hour && zone <= 14 * hour;
}

// `saves` are one module's saves, newest first; `known` maps saves to the sources their detail named.
export function sourceOf(save: Save, saves: Save[], known: ReadonlyMap<string, string>): Source {
  const exact = known.get(save.id);
  if (exact) return { id:exact, label:saves.find(other => other.id === exact)?.label ?? '', how:'exact' };
  const target = restoredFrom(save.label);
  if (target === null || !target) return { id:null, label:'', how:'none' };
  const older = saves.filter(other => other.id !== save.id && (save.created === null || other.created === null || other.created < save.created));
  const prefer = (list: Save[]) => list.find(other => other.notes && save.notes.startsWith(other.notes)) ?? list[0];
  const named = older.filter(other => other.label === target);
  if (named.length) return { id:prefer(named).id, label:target, how:'name' };
  const wall = wallTime(target);
  if (wall !== null) {
    const dated = older.filter(other => !other.named && other.created !== null && sameMoment(wall, other.created));
    if (dated.length) {
      const found = prefer(dated);
      return { id:found.id, label:found.label, how:'date' };
    }
  }
  return { id:null, label:target, how:'none' };
}

// The badge's tooltip.
export function describe(source: Source, saves: Save[], format: (time: number) => string) {
  const found = source.id ? saves.find(other => other.id === source.id) : undefined;
  if (found) {
    const date = found.created === null ? '' : format(found.created);
    const what = '“' + found.label + '”' + (date && date !== found.label ? ', saved ' + date : '');
    return (source.how === 'date' ? 'Probably restored from ' : 'Restored from ') + what;
  }
  if (source.id) return 'Restored from a save that is not in the list';
  if (source.label) return 'Restored from “' + source.label + '”, which is not in the list';
  return 'Restored from an earlier save. Select this save to find which one';
}

// Gives each guide, as [top, bottom] in list order, the first of `count` lanes free over its span, so guides
// that overlap sit side by side; with every lane taken, the one that frees first is shared.
export function lanes(spans: [number, number][], count = 3) {
  const ends: number[] = [];
  return spans.map(([top, bottom]) => {
    let lane = ends.findIndex(end => end < top);
    if (lane === -1) lane = ends.length < count ? ends.length : ends.indexOf(Math.min(...ends));
    ends[lane] = Math.max(ends[lane] ?? -Infinity, bottom);
    return lane;
  });
}
