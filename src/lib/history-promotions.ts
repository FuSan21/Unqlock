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

// The format of Unqork's own History dates, such as 10/21/2026, 5:29 PM in English: its formatDate is
// toLocaleString with these options, which also labels an unnamed save.
const dateFormat = new Intl.DateTimeFormat(undefined, { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit' });
export const formatDate = (time: number) => dateFormat.format(time);

// An environment's name without the prefix it shares with the builder's own host, such as qa-qa for
// org-qa-qa seen from org-staging.unqork.io; the prefix is cut only at a hyphen, and a name it would empty is kept.
export function shortEnv(env: string, hostname: string) {
  const host = hostname.split('.')[0];
  let shared = 0;
  while (shared < env.length && shared < host.length && env[shared] === host[shared]) shared++;
  const cut = env.lastIndexOf('-', shared - 1) + 1;
  return cut > 0 && cut < env.length ? env.slice(cut) : env;
}

// The badge's text: each environment once, in the order it was first promoted to.
export const envLabel = (list: Promotion[], hostname: string) => [...new Set(list.map(({ env }) => shortEnv(env, hostname)))].join(' · ');

// One line per promotion, for the row's tooltip.
export function describe(list: Promotion[], format = formatDate) {
  return list.map(({ env, user, time }) => 'Promoted to ' + env + (user ? ' by ' + user : '') + (time === null ? '' : ', ' + format(time))).join('\n');
}
