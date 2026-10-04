# Screenshots

## Store images

Five 1280 × 800 RGB PNGs for the Chrome Web Store and Firefox listing, in this order:

1. [Compact builder](listing-01-compact-builder.png): the real sidebar and canvas with subtle accents in the light theme and full colors in the dark theme.
2. [Component appearance](listing-02-component-appearance.png): Component style switches, the per-group color pickers and the canvas row layout switches.
3. [Builder panels](listing-03-builder-panels.png): visibility and width switches for the four panels.
4. [Environment and home menu](listing-04-environment-menu.png): the home menu with the environment strip, the production guard and an example domain group.
5. [Debug tools](listing-05-debug-tools.png): the Inspect, Data and Execute tabs.

Each settings image shows one popup view in the light and the dark theme side by side, plus a third view. The images crop the captures in SS/light and SS/dark at their native pixels, without resizing, sharpening or re-rendering text; only the builder captures are downscaled to fit. They show actual extension UI, never simulated controls or a combination of states the popup cannot show. Upload them with the build whose features they depict; repository assets do not upload themselves to either store. Chrome's image guidance: https://developer.chrome.com/docs/webstore/images

## Promo tiles

Chrome Web Store promo tiles, 24-bit RGB PNGs without transparency:

- [Small promo tile](promo-small-440x280.png), 440 × 280: the icon, name, a one-line pitch and the ten group colors.
- [Marquee promo tile](promo-marquee-1400x560.png), 1400 × 560: the same, with three key features beside the compact builder.

Firefox does not use promo tiles. [CHROME-WEB-STORE.md](../CHROME-WEB-STORE.md#dashboard-upload) lists which file goes in which dashboard field.

## Captures

The popup captures are generated from the current build in both themes, with example data only: the active tab is example-staging.unqork.io and the domain group uses placeholder hostnames. SS/light and SS/dark hold the single-theme captures the store images crop; each image listed below pairs them, light on the left and dark on the right, for the main README.

- [Home menu](SS/home-menu.png)
- [Component style](SS/component-style.png)
- [Canvas layout](SS/canvas-layout.png)
- [Builder panels](SS/builder-panels.png)
- [Environments](SS/environments.png)
- [Floating launcher](SS/floating-launcher.png)
- [Import & export](SS/import-export.png)
- [Debug: Inspect](SS/debug-inspect.png)
- [Debug: Data](SS/debug-data.png)
- [Debug: Execute](SS/debug-execute.png)

The builder captures are screenshots of the Unqork builder with test data, with compact components on, one per theme: `compact-builder-subtle-accents-light.png` and `-dark.png`, and `compact-builder-full-colors-light.png` and `-dark.png`. They compare color treatments, not normal versus compact sizing. The composer pairs each view, light on the left and dark on the right:

- [Compact builder with subtle accents](SS/compact-builder-subtle-accents.png)
- [Compact builder with full colors](SS/compact-builder-full-colors.png)

## Regenerating

After a change to the popup, refresh the captures and then the store images:

```sh
npm run build
npm run screenshots
python scripts/compose-listing.py
```

npm run screenshots loads dist/chrome in Playwright's Chromium, fills storage with the example settings in scripts/capture-screenshots.cjs and writes the popup captures to SS/light and SS/dark. The composer needs Python 3, Pillow and the Windows Segoe UI fonts; it writes the light and dark pairs to SS/, the five store images and both promo tiles here, and a review contact sheet to the ignored artifacts/ folder. If a page's layout changes, adjust the crop boxes in scripts/compose-listing.py and inspect every image at full size before uploading.

The builder captures come from a real builder session. Capture only test data in both themes, then crop to the component sidebar and canvas, leaving out browser chrome, workspace and module tabs, coworker names and organization hostnames, and save them at 1x scale as RGB without transparency before committing.
