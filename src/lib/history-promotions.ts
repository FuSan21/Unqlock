// Promotions of a save in Unqork's History. Each save's record, as the builder's History list holds it, carries
// `promotions.out`: one entry per promotion to another environment, `{ targetEnv, user, timestamp }`, where
// user is an email, a user name or a service ID. The same promotion is often listed twice, so entries are
// kept once each, oldest first. Anything else in the record is ignored.
export interface Promotion { env: string; user: string; time: number | null }

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function promotionsOf(revision: unknown): Promotion[] {
  const out = (revision as { promotions?: { out?: unknown } } | null)?.promotions?.out;
  if (!Array.isArray(out)) return [];
  const found = new Map<string, Promotion>();
  for (const entry of out) {
    const env = text(entry?.targetEnv);
    if (!env) continue;
    const user = text(entry.user);
    const parsed = Date.parse(entry.timestamp);
    const time = Number.isNaN(parsed) ? null : parsed;
    found.set([env, user, time].join('\n'), { env, user, time });
  }
  return [...found.values()].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

// The format of Unqork's own History dates, such as 10/21/2026, 5:29 PM in English.
const dateFormat = new Intl.DateTimeFormat(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' });

// One line per promotion, for the row's tooltip.
export function describe(list: Promotion[], format = (time: number) => dateFormat.format(time)) {
  return list.map(({ env, user, time }) => 'Promoted to ' + env + (user ? ' by ' + user : '') + (time === null ? '' : ', ' + format(time))).join('\n');
}
