# Chrome Web Store listing

Copy for the next extension update. The public listing must be updated in the developer dashboard; the release API uploads the package but does not update these fields.

Listing: https://chromewebstore.google.com/detail/unqlock/mcjjmjlohiadneoaielnigjjlbibfcja

## Short description

Style and compact Unqork components, control builder panels, identify environments, and debug application data.

## Detailed description

Unqlock helps Unqork developers recognize components, make room in the builder, identify environments and debug application behavior.

COMPONENT APPEARANCE
• Recognize 52 supported component types with category colors and distinct icons.
• Turn on Compact components for shorter rows, smaller icon tiles and inline type badges.
• Customize icon colors, icon backgrounds, sidebar names and canvas type labels.
• Enable subtle accents, full backgrounds or colored borders.
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
• Choose any corner for the launcher, show its environment label, or hide it.
• Preferences save locally and persist across browser restarts.

COMPATIBILITY
Appearance and panel controls support the modern Unqork Config builder on HTTPS Unqork subdomains. Compact styling also applies to custom components with a compatible header. Legacy canvas, Logic view and UI preview are outside the supported appearance scope. Debug tools require a compatible Angular-based Unqork application page. Native panel limits and available space constrain widths.

PRIVACY AND SAFETY
Preferences, panel widths and saved hostname groups remain in browser-local storage. Automatic discovery records hostnames only, not paths, queries or module content. Unqlock does not collect analytics or transmit page data to developer-operated servers.

Debug tools use active-tab access from the toolbar. From the floating launcher, they request optional access to that hostname when enabled. Automatic badges on saved custom domains also require optional site access. Declining leaves other settings usable.

Logged data may contain sensitive information. Property edits affect in-memory data; executed components may save data or call external integrations. Environment-switch links preserve the URL path, query and fragment. Production safeguards apply to Unqlock actions, not the application’s own controls.

Unqlock is an independent project and is not affiliated with or endorsed by Unqork.

## Screenshots

Use the five images and captions in [screenshots/README.md](screenshots/README.md). Keep the existing dark UI presentation and use only non-sensitive example data.

## Update notes

Adds compact component rows, visibility and width preferences for all four builder panels, and expanded environment and floating-menu controls. Panel improvements cover resize detection, remembered widths, locked expansion, queued settings saves, focus retention, refreshed width capture and explanatory tooltips.

Do not submit an older package alongside this copy: it describes the current repository build. Updating these files does not publish a store release.
