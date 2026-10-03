## Unreleased

- **Canvas toolbar:** under Canvas layout → Toolbar, keep the configuration search field always visible, and show the sort modes as side-by-side switches (Default, By Type, Alphabetical) instead of a dropdown. Both default to Unqork's behavior and are included in Import & export.
- **Component colors by role:** components are regrouped into ten color groups by what they do: input fields, layout, grids, content, actions and navigation, logic and processing (Initializer, Decisions, Calculator, Data Workflow, Data Mapper, Timer and AI Summarizer now share one color), data and storage, integrations, charts and maps, and custom components. Custom (BYOC) components get their own color in the sidebar and on the canvas, and the Simple Grid UI block is styled with the grids. Each group has its own color, chosen to fit the role and measured to stay distinct for icons and for full backgrounds in light and dark themes, with readable text on every background. Distinct icon shapes follow their group's color.
- **Custom colors:** Component style → Colors replaces the color guide with pickers: per group, a foreground and a background color for the light theme and for the dark theme. Pick one color of a theme and its partner is worked out to stay readable, or pick both to keep similar groups apart. Reset restores a group's defaults, and colors travel with Component style in Import & export.
- **Controls on colored rows:** with Full background accents or Tinted container headers on, a row's dependency count, actions menu and container chevron take the row's own colors instead of Unqork's brand tint and gray.
- **Tinted container headers** now use the group's background color, including colors you pick.
- **By Type and Alphabetical views:** component styling now applies to the flat rows these sort modes show.

## New in 1.3.3

- **Import & export:** back up settings or share them with your team as JSON. Copy to the clipboard or download a file, then paste or choose a file to import. A review step lists each section in the file so you can replace only Component style, Canvas layout, Builder panels, Environments or Floating launcher.
- **Type badge stays left:** with Compact components on, the type badge now sits beside the property ID instead of at the far right, and a new custom row layout starts with the type badge on the left.

## Fixes in 1.3.2

- **Containers in read-only modules:** container emphasis and container background and border colors now apply in imported and other read-only modules, where Unqork turns off dragging.
- **Selection highlight with the left accent:** selected components that are not collapsible show Unqork's selection ring again when the subtle left accent is on. The hover shadow is kept as well.

## What's new

- **Reorganized popup:** the home menu now shows the current environment with switch links, the Component styling and Compact components switches, and Log page data. Features are grouped under Builder, Tools and Setup, and each has its own page: Component style, Canvas layout, Builder panels, Debug tools, Environments and Floating launcher. Existing preferences carry over unchanged.
- **Canvas row layout:** place the icon, property ID, type badge, dependency count and actions menu of each canvas row on the left, in the middle or on the right. Choose a preset such as All left, or position each part yourself, under Canvas layout.
- **Container emphasis:** separate toggles for extra spacing, tinted headers, nesting guide lines, depth shading, pinned headers while scrolling and end markers. They apply to every collapsible canvas component, including panels, field groups, columns and grids.
- **Compact components:** shorter sidebar and canvas rows with smaller icon tiles and inline type badges. Turn it on from the home menu or under Canvas layout.
- **Four configurable panels:** control Build Agent, Explore, Properties and Component tray independently. Use native behavior, start collapsed on module entry, or keep a panel always collapsed.
- **Panel widths:** use a custom default, capture the current width, or remember deliberate mouse, touch and keyboard resizing. Native limits and available space still apply.
- **Reliable panel settings:** queued saves and resets, preserved keyboard focus, refreshed current-width capture, and explanations for disabled controls. Always collapsed blocks native expansion where the builder exposes supported panel methods.
- **Environment tools:** an optional floating environment label, editable hostname groups, environment switching and an optional production block for Unqlock's Data and Execute tools.
- **Floating menu:** open the toolkit from any corner, show its environment label, or hide it under Floating launcher.

Appearance includes category colors, distinct icons, tinted icon backgrounds, labels, accents, full backgrounds and borders. Debug tools provide Inspect, Data and Execute tabs on compatible Angular Unqork application pages, with confirmation before edits and execution.

## Packages

Chrome ZIP: extract and load unpacked for local installation. Firefox ZIP: unsigned, for temporary installation only. A signed Firefox XPI is attached only when Mozilla returns one at submission. The source ZIP contains the shared source and build instructions.

Store submissions go live after review. A successful submission is not confirmation that either public listing has updated.
