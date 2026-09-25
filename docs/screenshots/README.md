# Screenshots

Five 1280 × 800 RGB PNGs for the Chrome Web Store and Firefox listing, in this order:

1. [Compact builder](listing-01-compact-builder.png) — real sidebar and canvas, category colors, inline type badges and nested groups.
2. [Component appearance](listing-02-component-appearance.png) — compact layout, scope switches, icons, labels and frame controls.
3. [Builder panels](listing-03-builder-panels.png) — all four sections, visibility choices and native/custom/remembered widths.
4. [Environment and floating menu](listing-04-environment-menu.png) — the feature menu, badge, production option and domain configuration. The current organization hostname is explicitly redacted; the user-provided Demo Group and example hostnames remain visible.
5. [Debug tools](listing-05-debug-tools.png) — Inspect, Data and Execute tabs. These are interface captures; no debug actions were executed.

The existing store collages were built from the earlier user-provided Chrome captures on 2026-09-25. The SS/ folder now contains a newer set used directly in the main README. Settings are cropped and pasted at their original pixel size without resizing, sharpening or re-rendering their text. The builder receives one proportional downscale to fit the listing dimensions. Collages use crops of actual extension UI; they do not simulate new controls or combine states into a fictional popup. The dark palette and direct UI presentation follow the original screenshots. Browser chrome, workspace navigation and coworker names are excluded. The earlier source captures and archive were removed.

Capture settings pages by opening the floating menu, navigating to the feature, and scrolling long pages. Wait for the page and scroll animation to settle before capture. Open native select menus without changing preferences to show available policies. Crop to the extension or builder surface, assemble the selected views at 1280 × 800, and inspect every output at full size. Keep private full-window captures in ignored artifacts/, not in the repository.

Upload these images only with the build whose features they depict. Repository assets do not upload themselves to either store. Chrome's image guidance: https://developer.chrome.com/docs/webstore/images

## README originals

The newer captures are named for their visible contents. Their image pixels are unchanged.

- [Feature menu](SS/feature-menu.png)
- [Component appearance settings](SS/component-appearance-settings.png)
- [General settings and builder panels](SS/general-builder-panel-settings.png)
- [Environment settings](SS/environment-settings.png)
- [Debug: Inspect](SS/debug-inspect.png)
- [Debug: Data](SS/debug-data.png)
- [Debug: Execute](SS/debug-execute.png)
- [Compact builder with subtle accents](SS/compact-builder-subtle-accents.png)
- [Compact builder with full colors](SS/compact-builder-full-colors.png)

Both builder captures use compact components; they compare color treatments, not normal versus compact sizing. The environment capture includes its current hostname and example domain mappings.

## Regenerate store collages

Run `python scripts/compose-listing.py` with Python 3, Pillow and the Windows Segoe UI fonts. The script uses the descriptive filenames in SS/ and writes five listing PNGs plus an ignored contact sheet in artifacts/. Regeneration uses the newer captures, so the resulting crops differ from the retained store images. It does not modify the originals. Review the generated images before uploading.
