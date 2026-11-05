import { expect, test } from 'vitest';
import { index, results, typeName } from '@/lib/canvas-search';

// Definitions as rendered rows hold them: a container's row holds its children, so a nested row repeats a subtree.
const fieldGroup = { key:'fgOwners', type:'field-group', label:'', title:'Owners group', components:[{ key:'ownerAddress', type:'hidden', label:'Mailing address' }] };
const columns = { key:'cols', type:'columns', columns:[{ components:[{ key:'ownerPhone', type:'phoneNumber', label:'Phone' }] }, { components:[] }] };
const panel = { key:'panelRequest', type:'panel', label:'Request', components:[fieldGroup, columns, null, { key:'', type:'hidden' }, { key:'noType' }] };
const calc = { key:'calcOwner', type:'transformer', label:'calcOwner' };

test('indexes every component once, in canvas order, with the containers above it', () => {
  const found = index([panel, fieldGroup, calc, null, { notAComponent:true }]);
  expect([...found].map(([key, entry]) => key + ':' + entry.path.join('/'))).toEqual([
    'panelRequest:', 'fgOwners:panelRequest', 'ownerAddress:panelRequest/fgOwners', 'cols:panelRequest', 'ownerPhone:panelRequest/cols', 'calcOwner:'
  ]);
});

test("lists Unqork's matches in canvas order with labels and tray names, and keeps keys it cannot place", () => {
  const listed = results(new Set(['calcOwner', 'missing', 'ownerAddress', 'fgOwners']), index([panel, calc]));
  expect(listed.map(({ key, label, type, path }) => [key, label, type, path.join('/')])).toEqual([
    ['fgOwners', 'Owners group', 'Field Group', 'panelRequest'],
    ['ownerAddress', 'Mailing address', 'Hidden', 'panelRequest/fgOwners'],
    ['calcOwner', 'calcOwner', 'Calculator', ''],
    ['missing', '', '', '']
  ]);
  expect(listed[3].component).toBeNull();
  expect(typeName('somethingNew')).toBe('somethingNew');
});
