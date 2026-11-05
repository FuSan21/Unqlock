import { components as catalog } from './catalog';

// Search results for the canvas search field. Unqork's search already finds every matching component, those
// inside collapsed containers included, and hands each canvas row the set as `searchMatchKeys`; it only
// highlights the rows it renders. Each rendered row's React node holds its component definition, children
// included, so indexing the rendered rows' definitions reaches every component and the containers above it.
// Unqork's definitions are unversioned, so anything without a string key and type is skipped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Definition = any;
export interface Indexed { component: Definition; path: string[] }
export interface Result { key: string; label: string; type: string; component: Definition | null; path: string[] }

const isComponent = (value: Definition) => value !== null && typeof value === 'object' && typeof value.key === 'string' && value.key !== '' && typeof value.type === 'string';

// A container's children: `components`, or components inside items of another list, such as Columns' columns.
function* childrenOf(component: Definition): Generator<Definition> {
  for (const value of Object.values(component)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (isComponent(item)) yield item;
      else if (item && typeof item === 'object' && Array.isArray(item.components)) yield* item.components.filter(isComponent);
    }
  }
}

// Every component under the given definitions, in canvas order, with the keys of the containers above it.
// Definitions already reached through an earlier one are skipped, so passing every rendered row in order keeps
// the outermost paths.
export function index(definitions: Iterable<Definition>) {
  const found = new Map<string, Indexed>();
  const walk = (component: Definition, path: string[]) => {
    if (found.has(component.key)) return;
    found.set(component.key, { component, path });
    const inner = [...path, component.key];
    for (const child of childrenOf(component)) walk(child, inner);
  };
  for (const definition of definitions) if (isComponent(definition)) walk(definition, []);
  return found;
}

// The name Unqork's component tray gives a type, or the type itself.
const typeNames = new Map(catalog.map(entry => [entry.type, entry.label]));
export const typeName = (type: string) => typeNames.get(type) || type;

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

// Unqork's matches in canvas order, then any it found that the index lacks.
export function results(matches: Iterable<string>, found: Map<string, Indexed>): Result[] {
  const keys = new Set(matches);
  const listed: Result[] = [];
  for (const [key, { component, path }] of found) {
    if (!keys.delete(key)) continue;
    // Field groups keep the label shown in Properties in title.
    listed.push({ key, label:text(component.label) || text(component.title), type:typeName(component.type), component, path });
  }
  for (const key of keys) listed.push({ key, label:'', type:'', component:null, path:[] });
  return listed;
}
