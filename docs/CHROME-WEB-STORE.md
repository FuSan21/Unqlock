# Chrome Web Store listing

Copy for the next extension update. The public listing must be updated in the developer dashboard; the release API uploads the package but does not update these fields.

Listing: https://chromewebstore.google.com/detail/unqlock/mcjjmjlohiadneoaielnigjjlbibfcja

## Short description

Style and compact Unqork components, control builder panels, identify environments, and debug application data.

## Detailed description

Unqlock helps Unqork developers recognize components, make room in the builder, identify environments and debug application behavior.

COMPONENT APPEARANCE
• Recognize 54 supported component types and your custom components, colored by role: inputs, layout, grids, logic and more, with distinct icons.
• Turn on Compact components for shorter rows, smaller icon tiles and inline type badges.
• Arrange canvas rows: place the icon, property ID, type badge, dependency count and actions menu on the left, in the middle or on the right.
• Make panels, field groups and other containers stand out with spacing, tinted headers, guide lines, depth shading, pinned headers and end markers.
• Pick your own foreground and background color for each group, separately for light and dark themes. Customize icon colors, icon backgrounds, sidebar names and canvas type labels.
• Enable subtle accents, full backgrounds or colored borders; dependency counts and row menus follow the row’s colors.
• Keep the canvas search field open and show sort modes (Default, By Type, Alphabetical) as switches instead of a dropdown.
• Control sidebar and canvas styling independently, following the builder’s light or dark appearance.

BUILDER PANELS
• Control Build Agent, Explore, Component tray (including Outline) and Properties independently.
• Keep Unqork defaults, start a module visit with a panel collapsed, or keep it always collapsed.
• Locked expand controls explain how to enable the panel again.
• Use native sizing, set a custom default width, or remember the last width you chose by dragging or keyboard resizing.
• Capture an open panel’s current width, reset one panel or reset all four.

ENVIRONMENT TOOLS
• Show an optional environment label in the floating badge. Unrecognized hosts stay UNKNOWN until mapped.
• Organize visited Unqork hostnames into editable groups, or disable automatic discovery.
• Open the same path on another environment in the current group.
• Optionally block Unqlock’s Data and Execute tools in production while keeping Inspect available.

DEBUG TOOLS
• Inspect: log submission and available cache data to the page’s DevTools Console.
• Data: add, update or remove in-memory submission properties using Text, Number or JSON values.
• Execute: run a component by its exact key.
• Review an inline confirmation before changing data or executing a component. Production actions are called out explicitly.

YOUR WORKSPACE
• Open the menu from the browser toolbar or floating Unqlock launcher.
• The home menu shows the current environment with switch links, quick styling and compact switches, and one-click page data logging.
• Choose any corner for the launcher, show its environment label, or hide it.
• Back up or share settings as JSON: copy or download an export, then paste or choose a file to import only the sections you want.
• Preferences save locally and persist across browser restarts.

COMPATIBILITY
Appearance and panel controls support the modern Unqork Config builder on HTTPS Unqork subdomains. Compact styling and row layout also apply to custom components with a compatible header, and container options apply to any collapsible canvas component. Legacy canvas, Logic view and UI preview are outside the supported appearance scope. Debug tools require a compatible Angular-based Unqork application page. Native panel limits and available space constrain widths.

PRIVACY AND SAFETY
Preferences, panel widths and saved hostname groups remain in browser-local storage. Automatic discovery records hostnames only, not paths, queries or module content. Settings exports go only to your clipboard or a file you save. Unqlock does not collect analytics or transmit page data to developer-operated servers.

Debug tools use active-tab access from the toolbar. From the floating launcher, they request optional access to that hostname when enabled. Automatic badges on saved custom domains also require optional site access. Declining leaves other settings usable.

Logged data may contain sensitive information. Property edits affect in-memory data; executed components may save data or call external integrations. Environment-switch links preserve the URL path, query and fragment. Production safeguards apply to Unqlock actions, not the application’s own controls.

Unqlock is an independent project and is not affiliated with or endorsed by Unqork.

## Dashboard upload

In the [Chrome developer dashboard](https://chrome.google.com/webstore/devconsole), open Unqlock, then **Store listing**:

| Dashboard field | File |
| --- | --- |
| Description | The **Detailed description** above |
| Store icon (128 × 128) | `src/public/icons/icon-128.png` |
| Screenshot 1 | `docs/screenshots/listing-01-compact-builder.png` |
| Screenshot 2 | `docs/screenshots/listing-02-component-appearance.png` |
| Screenshot 3 | `docs/screenshots/listing-03-builder-panels.png` |
| Screenshot 4 | `docs/screenshots/listing-04-environment-menu.png` |
| Screenshot 5 | `docs/screenshots/listing-05-debug-tools.png` |
| Small promo tile (440 × 280) | `docs/screenshots/promo-small-440x280.png` |
| Marquee promo tile (1400 × 560) | `docs/screenshots/promo-marquee-1400x560.png` |

Delete the current screenshots first, then upload in this order; the first screenshot is the one shown in search results. The short description comes from the package manifest, so it updates with the next uploaded version. Save the draft, then submit it for review together with the package, or on its own if the package is already submitted.

On addons.mozilla.org, open the add-on in the [Developer Hub](https://addons.mozilla.org/developers/addons), choose **Edit Product Page** and replace the screenshots with the same five `listing-*.png` files in the same order. Firefox has no promo tiles; the description and summary are sent from amo-metadata.json with each submission.

All images show light and dark themes and contain only example data.

## Update notes

Builder panels and the canvas toolbar settings now use side-by-side switches instead of dropdowns, like the canvas row layout, and every builder panel's options are shown at once. Component style and Canvas layout show when a change is saving.

Do not submit an older package alongside this copy: it describes the current repository build. Updating these files does not publish a store release.
