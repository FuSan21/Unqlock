import { expect, test } from 'vitest';
import { describe, promotionsOf } from '@/lib/history-promotions';

const utc = new Intl.DateTimeFormat('en-US', { year:'numeric', month:'numeric', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'UTC' });
const format = (time: number) => utc.format(time);

test('reads each promotion once, oldest first, as a save record holds them', () => {
  // As captured from a live History list: Unqork lists the same promotion twice.
  const twice = { targetEnv:'org-qa-qa', user:'eric.ma@example.com', timestamp:'2026-10-21T21:29:35.208Z' };
  const revision = { _id:'a', promotions:{ out:[
    { targetEnv:'org-qa-qa', user:'uq64ac12c6fad64a4df2557e6d', timestamp:'2026-10-24T17:56:12.307Z' },
    twice, { ...twice }
  ] } };
  const found = promotionsOf(revision);
  expect(found.map(promotion => promotion.user)).toEqual(['eric.ma@example.com', 'uq64ac12c6fad64a4df2557e6d']);
  expect(describe(found, format)).toBe('Promoted to org-qa-qa by eric.ma@example.com, 10/21/2026, 9:29 PM\nPromoted to org-qa-qa by uq64ac12c6fad64a4df2557e6d, 10/24/2026, 5:56 PM');
});

test('a save without promotions, or with entries it cannot read, has none', () => {
  for (const revision of [null, {}, { promotions:{} }, { promotions:{ out:{} } }, { promotions:{ out:[null, { user:'x' }, { targetEnv:' ' }] } }]) {
    expect(promotionsOf(revision)).toEqual([]);
  }
  // A missing user or date leaves that part out.
  expect(describe(promotionsOf({ promotions:{ out:[{ targetEnv:'org-uat', timestamp:'later' }] } }), format)).toBe('Promoted to org-uat');
});
