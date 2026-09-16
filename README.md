# Unqlock — Chrome and Firefox

Unqlock combines Unqork + Unlock: make builder components easier to recognize.

<img src="docs/assets/extension-icon.png" width="80" height="80" alt="Unqlock icon">

One source tree, two Manifest V3 builds. Includes all 52 component types, custom icons, light/dark palettes, separate full background/border controls, and support across Unqork subdomains. The current version is recorded in package.json.

## Build

The popup opens to a feature menu. Choose **Component appearance** for all color, icon, label, accent, background and border controls, the color guide, and reset. Use **All features** or Escape to return to the menu. Existing preferences are preserved; navigation does not toggle the feature.

## Appearance controls

Appearance controls are grouped into master switches, icons/labels, and component frames. **Enable component styling** controls the whole appearance feature; **Style sidebar components** and **Style canvas components** control all effects in their respective areas. They do not affect Debug tools. Individual controls include colored icons, tinted icon backgrounds, colored sidebar names, colored canvas type labels, distinct icon shapes, left accents, full backgrounds and borders. Distinct shapes require colored icons; icon backgrounds are independent. Existing settings retain their behavior: icon colors/backgrounds default on, and the new sidebar-name coloring defaults off. Turning a master off preserves the individual preferences.

## Debug tools

Debug tools uses three keyboard-accessible tabs: **Inspect** for console logging, **Data** for property edits/removal, and **Execute** for component execution. Data values use a Text / Number / JSON selector and monospace editor. Each action reports feedback in its own tab. Mutations and execution require an inline confirmation; Cancel, Escape, editing an input, switching tabs, or leaving the page cancels the pending confirmation. The confirmation applies to a captured request, not later edits. No persistent confirmation checkbox is used.

Open Unqlock from the browser toolbar on an Angular Unqork application page, then choose **Debug tools**. This separately implemented feature follows the workflows observed in Qorkscrew 1.7:

- Log submission and available cache data in the page's DevTools Console, grouped or as a single object. Logs can contain sensitive data.
- Add/update an exact top-level property with text, a finite number, or a JSON object/array. Dots are literal key characters, not nested paths. Reserved prototype keys are rejected.
- Remove an existing property; the value field is ignored.
- Execute one component matching its exact key. Missing, duplicate or non-executable matches are rejected.

Confirm your intent before each edit, removal or execution. Edits affect in-memory submission data only; they do not save submissions or force an Angular digest. Component execution can have external effects, including saving data or calling integrations. Actions target the tab and URL captured when entering Debug tools, and refuse a changed URL. Only one top-level Angular form is supported, not embedded forms or the modern builder. No automatic actions run. Typed values are not persisted. Console output style lasts only for the current popup session.

Debug tools use temporary active-tab access instead of blanket host permissions, including for custom-domain application pages. Browser API reference: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript

Quick-action tests use synthetic Angular objects and test doubles for tab selection and script injection. Before release, verify the real toolbar permission flow in both browsers on a disposable Unqork application: log data, set/remove a test property, and trigger a harmless component. Real application compatibility and Firefox MAIN-world injection have not yet been verified against a live Unqork page.

Requires Node.js 22 or newer and npm. Run all commands from the repository root (the folder containing package.json):

```sh
npm ci
npm run build
```

Outputs:

- dist/chrome/ — load unpacked in Chrome.
- dist/firefox/ — temporarily load manifest.json in Firefox.
- artifacts/unqlock-chrome.zip — Chrome package.
- artifacts/unqlock-firefox.zip — unsigned Firefox package for temporary loading or submission for signing.

Extension code lives in src/ and browser-specific manifest settings live in manifests/. Both packages use identical JavaScript, CSS, HTML and icons; the build merges manifest.base.json with the appropriate browser overrides. The runtime chooses Firefox's promise-based browser API when available, otherwise Chrome's API. No polyfill or runtime dependency is needed.

Build tools are development-only. ZIP files contain no npm packages or tests. Archives use fixed timestamps for repeatable builds. npm run package:source creates a source ZIP including the lockfile, scripts and tests.

## Chrome installation / update

Open chrome://extensions, enable Developer mode and Load unpacked from dist/chrome. For an existing installation, replace files in the same installed folder, click Reload on the extension, and refresh Unqork. Keeping the installation path retains its identity and preferences. Chrome 111+ is declared; current Chrome is recommended.

## Firefox installation

Requires Firefox desktop 142 or newer. Open about:debugging#/runtime/this-firefox, choose Load Temporary Add-on, and select dist/firefox/manifest.json or the Firefox ZIP. Refresh Unqork. If Firefox has not granted access to the staging site, allow the Unqork site from the extension's permissions controls.

Temporary add-ons are removed when Firefox restarts. Permanent installation in standard Firefox requires Mozilla signing; the package is unsigned and has not been submitted to Mozilla. The stable add-on ID is unqlock@extensions.local. Keep it unchanged for future releases of this add-on. This replaces the unpublished prototype ID: remove the old temporary add-on before loading Unqlock; its saved preferences do not transfer. Preferences are local to each browser and do not synchronize between Chrome and Firefox.

## Source layout

```text
unqork-scripts/
  src/                  Shared extension code, base manifest and icons
  manifests/            Chrome and Firefox manifest overrides
  scripts/              Build, icon rendering, packaging and test commands
  tests/                Behavior, browser integration and package checks
  docs/                 Component catalog, design notes and icon preview
  .github/workflows/    Push/PR checks and tag-triggered releases
  package.json          Project commands and development dependencies
  package-lock.json     Locked dependency versions
  .gitignore            Excludes dependencies and generated files
  .gitattributes        Consistent text line endings and binary handling
  .editorconfig         Basic editor formatting conventions
  README.md             Setup, build, installation and testing
```

Commit the files shown above, including the PNG icons and package-lock.json. Do not commit node_modules/, dist/ or artifacts/; they are generated locally and ignored by Git. Build scripts resolve paths from their location, so they do not depend on a machine-specific checkout path.

## Automated builds and releases

Once pushed to a GitHub repository with Actions enabled, every push and pull request runs the full build and browser tests, Firefox lint, and source packaging on Ubuntu with Node.js 22. Successful runs retain downloadable ZIP artifacts for 14 days. Pull requests never publish releases. Actions are pinned to commit hashes; only the release job receives repository write permission.

Pushing a tag beginning with v additionally validates that it exactly matches the numeric package, lockfile and manifest version, such as v1.0.0. After all checks pass, the workflow creates a GitHub Release with generated notes and the exact tested Chrome, Firefox and source ZIPs. Other tags only run checks. Failed checks or mismatched tags prevent publishing. Existing releases are not overwritten; rerunning an already published release fails safely.

Version bumps are manual: patch for fixes, minor for features, major for breaking changes. The helper updates package.json, package-lock.json and src/manifest.base.json together without committing or tagging. Both browsers always share one version. Numeric major.minor.patch versions only; prerelease suffixes are not supported.

Example next patch release from 1.0.0 (run after committing other changes):

```sh
npm run version:bump -- patch
npm test
npm run lint:firefox
git add package.json package-lock.json src/manifest.base.json
git commit -m "Release 1.0.1"
git tag -a v1.0.1 -m "Unqlock 1.0.1"
git push origin HEAD
git push origin v1.0.1
```

Use minor, major or an explicit higher version instead of patch as needed; adjust the commit and tag accordingly. Run npm run version:check -- v1.0.1 to verify a proposed tag. To release the unchanged initial 1.0.0 version, omit the bump and create v1.0.0 on the committed workflow instead. Do not move published tags; fix issues in a new version. Configure origin before running push commands.

Releases are GitHub downloads only: no Chrome Web Store upload, Mozilla signing, automatic store publication or installed-extension updates. Firefox ZIPs remain unsigned. The workflow uses GitHub's built-in token and needs no store credentials or personal access token. No release is created until you push a matching version tag.

The component catalog in docs/component-catalog.json is also used by the behavior tests. Design notes are historical proposal material, not generated build inputs.

To edit the extension icon, change src/icons/unqlock.svg and run npm run icons after installing Playwright's Chromium. This regenerates the committed PNG icons and documentation preview. Regular builds use the committed images and do not need a browser installation.

## Tests

```sh
npx playwright install chromium firefox
npm test
npm run lint:firefox
```

Optionally set CHROME_PATH to an installed Chrome for Testing executable for the Chromium tests. Otherwise Playwright's Chromium is used. Tests run in isolated profiles using synthetic builder fixtures and do not access your real module data. The Firefox behavior test supplies a browser API test double; it verifies Firefox rendering and the Firefox API branch, not Mozilla signing or live-site permission prompts. An additional web-ext test installs and reloads the actual Firefox package in an isolated temporary profile (optionally set FIREFOX_PATH to override its executable). Chrome integration loads the actual unpacked extension and exercises persistent popup settings. No tests install an extension into your normal browser profile.

## Scope and privacy

Targets the modern Unqork Config builder across HTTPS *.unqork.io subdomains. The script is registered on /ide/* pages so navigation into /ide/builder/ works. Appearance styling does not run on unrelated domains or application pages. Unknown component types are untouched. Legacy canvas, Logic view and UI preview are not supported or verified. Appearance changes do not modify module definitions or submit/save anything.

Permissions are storage (appearance preferences), activeTab and scripting (user-invoked debug tools). Unqlock makes no external requests or telemetry transmissions; executed application components may do so. Submission/cache data is logged in the page, not returned to extension storage. Firefox explicitly declares no data collection. Full borders replace native border colors while enabled; focus outlines are retained. Disabling or resetting removes decorations. The app's root dark class controls the page palette; the popup follows system appearance.

## References

- Cross-browser APIs: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities
- Firefox temporary installation and signing: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- Firefox no-data declaration: https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
