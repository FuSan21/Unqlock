# Unqork component icon proposal

Verified against the open Chrome builder on 16 September 2026. The Default Library contains 52 unique component types across five categories: Primary Fields (9), Secondary Fields (9), Display & Layout (17), Data & Event Processing (13), Charts & Graphs (4). Frequently Used repeats 11 of these, producing 63 tray entries. Address is explicitly marked deprecated.

The accompanying component-catalog.json records every display name, case-sensitive data-tray-type value, group, and existing Lucide icon. This catalog describes the Default Library, not other component sources.

## Proposed visual system

Apply the same type-to-color mapping in the tray and the middle canvas. Keep the component name legible and neutral. Use a saturated icon on a pale tinted tile; make a thin matching left accent optional. On the middle canvas, the existing 32-pixel icon tile is a good place to apply this treatment without changing row size.

Suggested starting families (design proposals, not existing Unqork conventions):

- Text, numeric, date, and choice inputs: blue (#1D4ED8 on #EFF6FF).
- Identity, contact, and signature fields: teal (#0F766E on #F0FDFA).
- Layout containers and grids: indigo (#4338CA on #EEF2FF).
- Content, HTML, Markdown, rich text: violet (#6D28D9 on #F5F3FF).
- Data tables, storage, and uploads: cyan (#0E7490 on #ECFEFF).
- Calculator and data transformation: purple (#7E22CE on #FAF5FF).
- Decisions: amber (#92400E on #FFFBEB).
- Initializer, buttons, navigation, and execution controls: green (#166534 on #F0FDF4).
- Plug-In and Plaid integrations: orange (#9A3412 on #FFF7ED).
- Charts and geographic visualization: rose (#9D174D on #FFF1F2).
- Hidden and protected fields: slate (#475569 on #F1F5F9), with explicit eye-off / lock shapes.

These are starting light-theme tokens. Retain labels and shapes so color is never the only way to identify a type. Give every type a stable treatment even when it appears under Frequently Used.

## Dark-mode inspection and proposed palette

Switched the live builder through User profile > Appearance > Dark and verified the selected Dark control and rendered canvas on 16 September 2026. Left the app in dark mode as requested. No module configuration was changed.

The sampled canvas card and tray card use #0B0E13 backgrounds with #262D38 borders. The canvas icon tile uses #1D242E with #A2ABB6 icon strokes; the sampled sidebar icon uses #CBD2DA. The canvas type label also uses #A2ABB6. Icons remain monochrome: dark mode does not resolve the shared-icon ambiguity identified above.

Use the same semantic color families as light mode, with brighter strokes on deep tinted tiles:

- Inputs: #93C5FD on #172554.
- Identity/contact/signature: #5EEAD4 on #042F2E.
- Layout: #A5B4FC on #1E1B4B.
- Content: #C4B5FD on #2E1065.
- Data/storage: #67E8F9 on #083344.
- Calculation/transformation: #D8B4FE on #3B0764.
- Decisions: #FCD34D on #451A03.
- Execution/actions: #86EFAC on #052E16.
- Integrations: #FDBA74 on #431407.
- Charts/maps: #FDA4AF on #4C0519.
- Hidden/protected: #CBD5E1 on #1E293B.

Calculated sRGB foreground-to-tile contrast ranges from 8.02:1 to 10.62:1 for these eleven proposed dark pairs. This verifies the specified color pairs only; the proposed styling has not been applied to the live app. Actual rendered icons, hover/selection states, and color-vision distinguishability still need visual verification during implementation.

Keep row backgrounds dark and neutral, retain the existing 32-pixel canvas tiles, and avoid glow or bright full-row fills. Keep the dependency badges and selection/error styling distinct from component identity colors. The live document root gains a dark class; the extension should follow that application theme and react when it changes, including when the app's System appearance setting changes the effective theme.

## Resolve the existing icon collisions

- Address / Address Search: pin versus pin with magnifier; retain the deprecated badge on Address.
- Phone Number / Intl Phone Number: phone versus phone with globe.
- Table / Data Grid / Advanced Data Grid: plain table versus editable table versus table with settings.
- Dynamic Grid / Freeform Grid / View Grid: grid with repeat arrows versus unequal tiles versus grid with eye.
- Text Area / Markdown / Rich Text Editor: text lines versus M with down arrow versus formatted text with pen.
- Matrix / Uniform Grid: a selection matrix with dots versus evenly sized grid cells.
- Map / Map V2: folded map versus map with pin and a small V2 marker.
- Multi-Select Dropdown: replace the bare chevron with stacked selected chips plus chevron.

## Useful optional features

1. A compact mode that reduces vertical spacing while retaining readable labels.
2. Type filters that spotlight matching canvas components without removing their parent containers.
3. A toggle between colored icons only and icons plus subtle row accents.
4. A small color legend and per-type overrides saved locally.
5. Full-name tooltips for truncated sidebar labels.
6. An explicit reset/disable control.

## Implementation observations from the live page

The sidebar exposes [data-tray-type]. Preserve its exact case, including basicDropdown, dynamicGrid, freeFormGrid, inlineGrid, browserStorage, and phoneNumber.

Middle-canvas elements expose [data-component-key], which identifies an instance rather than a type. Their headers contain a separate uppercase type label and an icon tile. Container headers and ordinary cards use different nesting. Match the local header label, not all descendant text: a Field Group contains many nested component types.

Normalize label aliases explicitly: the tray says Plug-In while the observed middle canvas says PLUGIN. Calculator uses transformer as its tray type; Data Table uses infotable; Decisions uses decision; Matrix uses survey.

Do not identify types by their SVG class alone: numerous types share icons. Scope styling to component icons rather than menu, dependency, drag-handle, navigation, or expansion icons. Preserve selection/error indicators. A future extension should handle new or replaced cards as the builder updates and should fail harmlessly when an unknown type appears.

This delivery is the verified catalog and design proposal. No extension has been installed and no module configuration has been changed.
