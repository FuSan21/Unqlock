import type { Stored } from './api';
import type { PageId } from '@/popup/pages';

// Release notes shown under What's new, newest first. Each version keeps the wording it shipped with,
// so older notes name the popup as it was then; `page` links only to a page that still holds the feature.
// Text takes **bold** and *italic* and nothing else.
export interface ReleaseItem {
  title: string;
  text: string;
  page?: PageId;
}

export interface Release {
  version: string;
  // The day the release was published, as YYYY-MM-DD; absent until it is.
  date?: string;
  items: ReleaseItem[];
}

export const releases: Release[] = [
  { version:'1.6.1', date:'2026-10-13', items:[
    { title:"What's new", text:"release notes for every version, opened from **What's new** beside the version in the header. After an update that adds features, the toolbar icon shows *NEW* and the home menu names the new version until you read its notes or dismiss the notice." },
    { title:'Site access and file picking in Firefox', text:'where Firefox would close the toolbar popup, site access for Debug tools from the floating launcher, Detach dev overlay and custom-domain badges, and choosing a settings file to import, now open in a small Unqlock window that names the sites and what Unqlock will do there. Detach dev overlay can now be turned on and off from the floating menu in Firefox.' }
  ] },
  { version:'1.6.0', date:'2026-10-11', items:[
    { title:'Detach dev overlay', text:"an opt-in Debug tools option adds a Detach button to Unqork's SSE Debugger drawer. It opens the module in its own window showing only the overlay, with Execute, the event stream and every menu working as usual, while the builder stays in view. Closing that window or choosing Reattach brings the drawer back. Turning the option on asks for access to unqork.io sites; while it is off, nothing is added to Unqork pages.", page:'quick-page' },
    { title:'Navigation tabs', text:"under Builder panels, the tab bar can be kept as is, shown on several lines with each tab's full name, or hidden so only the current tab is kept, with the application and module named in the toolbar. **Collapse until header hover** keeps the bar out of sight until Unqork's header is hovered.", page:'panels-page' },
    { title:'Component labels', text:"under Canvas layout, each component's label can be shown after its property ID, always or only when it differs.", page:'layout-page' },
    { title:'Legacy view', text:"canvas styling now works in Unqork's legacy view, including preview rows for inputs, buttons and content, with the property ID shown muted beside the type." },
    { title:'Draggable floating launcher', text:'Floating launcher → Position chooses Fixed, in a corner, or Draggable, anywhere on the page for that tab. The menu opens toward the side with more room.', page:'launcher-page' },
    { title:'Fixes', text:"builder features now load when Unqork's module search opens the builder without a page load, and selected rows and search matches stand out on styled rows." }
  ] },
  { version:'1.5.0', date:'2026-10-04', items:[
    { title:'Switches for builder panels', text:"each panel's Visibility (Default, Start collapsed, Always collapsed) and Width (Default, Custom, Remember last) are side-by-side switches like the canvas row layout, and every panel's options are shown at once.", page:'panels-page' },
    { title:'Switches for the canvas toolbar', text:'under Canvas layout → Toolbar, Search bar and Sort mode are switches between Default and Always visible or Switches.', page:'layout-page' },
    { title:'Save status', text:'Component style and Canvas layout show *Saving…* while a change is being saved, then *Saved*.' }
  ] },
  { version:'1.4.0', date:'2026-10-03', items:[
    { title:'Canvas toolbar', text:"under Canvas layout → Toolbar, keep the configuration search field always visible, and show the sort modes as side-by-side switches (Default, By Type, Alphabetical) instead of a dropdown. Both default to Unqork's behavior and are included in Import & export.", page:'layout-page' },
    { title:'Component colors by role', text:"components are regrouped into ten color groups by what they do: input fields, layout, grids, content, actions and navigation, logic and processing (Initializer, Decisions, Calculator, Data Workflow, Data Mapper, Timer and AI Summarizer now share one color), data and storage, integrations, charts and maps, and custom components. Custom (BYOC) components get their own color in the sidebar and on the canvas, and the Simple Grid UI block is styled with the grids. Each group has its own color, chosen to fit the role and measured to stay distinct for icons and for full backgrounds in light and dark themes, with readable text on every background. Distinct icon shapes follow their group's color.", page:'style-page' },
    { title:'Custom colors', text:"Component style → Colors replaces the color guide with pickers: per group, a foreground and a background color for the light theme and for the dark theme. Pick one color of a theme and its partner is worked out to stay readable, or pick both to keep similar groups apart. Reset restores a group's defaults, and colors travel with Component style in Import & export.", page:'style-page' },
    { title:'Controls on colored rows', text:"with Full background accents or Tinted container headers on, a row's dependency count, actions menu and container chevron take the row's own colors instead of Unqork's brand tint and gray." },
    { title:'Tinted container headers', text:"now use the group's background color, including colors you pick.", page:'layout-page' },
    { title:'Version in the popup', text:'the header shows the installed Unqlock version next to its name.' },
    { title:'By Type and Alphabetical views', text:'component styling now applies to the flat rows these sort modes show.' }
  ] },
  { version:'1.3.3', date:'2026-10-01', items:[
    { title:'Import & export', text:'back up settings or share them with your team as JSON. Copy to the clipboard or download a file, then paste or choose a file to import. A review step lists each section in the file so you can replace only Component style, Canvas layout, Builder panels, Environments or Floating launcher.', page:'transfer-page' },
    { title:'Type badge stays left', text:'with Compact components on, the type badge now sits beside the property ID instead of at the far right, and a new custom row layout starts with the type badge on the left.', page:'layout-page' }
  ] },
  { version:'1.3.2', date:'2026-10-01', items:[
    { title:'Containers in read-only modules', text:'container emphasis and container background and border colors now apply in imported and other read-only modules, where Unqork turns off dragging.' },
    { title:'Selection highlight with the left accent', text:"selected components that are not collapsible show Unqork's selection ring again when the subtle left accent is on. The hover shadow is kept as well." }
  ] },
  { version:'1.3.1', date:'2026-10-01', items:[
    { title:'Pinned headers inside Columns', text:'an expanded panel or other container placed in a Columns cell no longer has its header pushed to the bottom of the container. Containers in a column keep their normal header position, because the column cell cannot pin to the canvas.' },
    { title:'Selecting containers with a custom row layout', text:'clicking the empty part of a panel, field group or other collapsible header selects the component again, as it does natively. Only the icon, the expand arrow and the header edges toggle it.' }
  ] },
  { version:'1.3.0', date:'2026-09-30', items:[
    { title:'Reorganized popup', text:'the home menu now shows the current environment with switch links, the Component styling and Compact components switches, and Log page data. Features are grouped under Builder, Tools and Setup, and each has its own page: Component style, Canvas layout, Builder panels, Debug tools, Environments and Floating launcher. Existing preferences carry over unchanged.' },
    { title:'Canvas row layout', text:'place the icon, property ID, type badge, dependency count and actions menu of each canvas row on the left, in the middle or on the right. Choose a preset such as All left, or position each part yourself, under Canvas layout.', page:'layout-page' },
    { title:'Container emphasis', text:'separate toggles for extra spacing, tinted headers, nesting guide lines, depth shading, pinned headers while scrolling and end markers. They apply to every collapsible canvas component, including panels, field groups, columns and grids.', page:'layout-page' }
  ] },
  { version:'1.2.2', date:'2026-09-29', items:[
    { title:'Left accents with full borders', text:'left accents stay visible alongside full colored borders.' }
  ] },
  { version:'1.2.1', date:'2026-09-26', items:[
    { title:'Debug tools in Firefox', text:'Debug tools work again inside the floating menu in Firefox.' },
    { title:'Floating menu focus', text:'the floating menu keeps keyboard focus where you were typing.' }
  ] },
  { version:'1.2.0', date:'2026-09-25', items:[
    { title:'Compact components', text:'shorter sidebar and canvas rows with smaller icon tiles and inline type badges. Enable it under Component appearance → Layout.' },
    { title:'Four configurable panels', text:'control Build Agent, Explore, Properties and Component tray independently. Use native behavior, start collapsed on module entry, or keep a panel always collapsed.' },
    { title:'Panel widths', text:'use a custom default, capture the current width, or remember deliberate mouse, touch and keyboard resizing. Native limits and available space still apply.' },
    { title:'Reliable panel settings', text:'queued saves and resets, preserved keyboard focus, refreshed current-width capture, and explanations for disabled controls. Always collapsed blocks native expansion where the builder exposes supported panel methods.' }
  ] },
  { version:'1.1.0', date:'2026-09-23', items:[
    { title:'Environment tools', text:"an optional floating environment label, editable hostname groups, environment switching and an optional production block for Unqlock's Data and Execute tools." },
    { title:'Floating menu', text:'open the toolkit from any corner, or hide the launcher in General settings.' },
    { title:'Debug tools from the floating menu', text:'opened from the floating menu, Debug tools ask for access to that one hostname before acting on the page.' }
  ] },
  { version:'1.0.3', date:'2026-09-20', items:[
    { title:'Store listings', text:'the first version submitted to the Chrome Web Store and addons.mozilla.org. Both listings go live after store review.' }
  ] },
  { version:'1.0.2', date:'2026-09-20', items:[
    { title:'License', text:'Unqlock is released under the MIT license.' }
  ] },
  { version:'1.0.1', date:'2026-09-20', items:[
    { title:'Firefox add-on ID', text:'the add-on ID is now unqlock@fusan.me, kept for every later release. Remove a temporary install of 1.0.0 before loading this version; its saved preferences do not transfer.' },
    { title:'Privacy notice', text:'a privacy notice for both store listings.' }
  ] },
  { version:'1.0.0', date:'2026-09-17', items:[
    { title:'Component appearance', text:'category colors and custom icons for all 52 component types, with light and dark palettes, across Unqork subdomains. Choose colored icons, tinted icon backgrounds, colored sidebar names, colored canvas type labels, distinct icon shapes, left accents, full backgrounds and borders. **Enable component styling**, **Style sidebar components** and **Style canvas components** turn whole areas on and off while keeping your choices.' },
    { title:'Debug tools', text:'Inspect, Data and Execute tabs on Angular Unqork application pages: log submission and cache data in the DevTools Console, add, update or remove a top-level property, and execute one component by its key. Each edit and execution asks for confirmation first.' }
  ] }
];

export const key = 'whatsNew';

// `seen` is the version whose notes were last read or dismissed; `badge` keeps the toolbar's NEW until
// the popup next opens.
export interface State { seen: string | null; badge: boolean }

const parse = (version: unknown) => {
  const match = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(version) : null;
  return match ? match.slice(1).map(Number) : null;
};

export function compare(a: string, b: string) {
  const [x, y] = [parse(a) || [0, 0, 0], parse(b) || [0, 0, 0]];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export function state(stored: Stored): State {
  return { seen:parse(stored?.seen) ? stored.seen : null, badge:stored?.badge === true };
}

// Releases up to the installed version, newest first, leaving out notes written ahead of a release.
export const shipped = (current: string) => releases.filter(release => compare(release.version, current) <= 0);

// Releases after `seen`. Only a minor or major release brings a notice; a patch's fixes wait to be read.
export const unseen = (seen: string | null, current: string) => seen ? shipped(current).filter(release => compare(release.version, seen) > 0) : [];
export const notify = (seen: string | null, current: string) => unseen(seen, current).some(release => parse(release.version)![2] === 0);
