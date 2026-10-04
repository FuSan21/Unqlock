# Development and release

Maintainer documentation for Unqlock. User-facing documentation is in README.md.

## Build

Requirements, build commands and manual installation of a local build are in README.md under Building from source. Run every command from the repository root.

Beyond the outputs listed there, npm run sign:firefox writes artifacts/unqlock-firefox-VERSION.xpi when Mozilla returns a signed file, and npm run package:source writes artifacts/unqlock-source.zip, the archive listed AMO submissions upload for review.

Unqlock is TypeScript built with WXT, which runs Vite once per browser. wxt.config.ts holds the manifest, with the Chrome and Firefox differences chosen by browser, and keeps both on Manifest V3; the version comes from package.json. Entrypoints live in src/entrypoints: the background, one file per content script (`<name>.content.ts`, or a `<name>.content/` folder when it brings CSS), and the popup. Each content script still builds to its own file under content-scripts/, which the browser tests inject into their fixtures. Shared models in src/lib are plain modules imported by whichever entrypoint needs them; src/lib/api.ts chooses Firefox's promise-based browser API when available, otherwise Chrome's. No polyfill is needed. React and React DOM are the only runtime dependencies, bundled into the popup alone. Both packages contain identical JavaScript, CSS, HTML and icons; only manifest.json differs.

Build tools are development-only. ZIP files contain no npm packages or tests. scripts/build.cjs runs WXT for each browser into dist/<browser> and zips the result with fixed timestamps and sorted entries, and it refuses symbolic links or redirected output directories. The bundles are left unminified for store review, and wxt.config.ts turns off the bundler's debug comments, which would otherwise embed absolute source paths and make a build depend on where the repository is checked out. Isolated content scripts set `noScriptStartedPostMessage`, so WXT's start-up notice is not broadcast to the page's own message listeners.

## Add-on identity

The add-on ID is unqlock@fusan.me. Keep the ID unchanged for subsequent releases.

## Source layout

```text
unqlock/
  src/
    entrypoints/        Background, content scripts, MAIN-world bridges and the popup page
    lib/                Shared models: settings, environments, colors, page actions, import and export
    popup/              React popup: providers, views and the shared components
    public/icons/       Committed icons, copied into both packages as-is
  scripts/              Build, icon rendering, packaging, signing, publishing and test commands
  tests/                Browser integration, package and model checks
  tests/unit/           Vitest popup and component tests in jsdom
  docs/                 Component catalog, privacy notice, screenshots and icon preview
  .claude/              Maintainer documentation and design notes
  .github/workflows/    Push/PR checks, tag-triggered store publishing and releases
  wxt.config.ts         WXT settings and the manifest for both browsers
  tsconfig.json         TypeScript settings, extending WXT's generated config
  vitest.config.mts     Unit test settings
  CLAUDE.md             Project context and pointers
  LICENSE               MIT license, matching the AMO listing
  amo-metadata.json     Listing metadata sent with AMO submissions
  package.json          Project commands and dependencies
  package-lock.json     Locked dependency versions
  .gitignore            Excludes dependencies and generated files
  .gitattributes        Consistent text line endings and binary handling
  .editorconfig         Basic editor formatting conventions
  README.md             Features, installation and privacy
```

The popup is one React app, src/entrypoints/popup, rendered by the same page in the toolbar popup, the floating-menu iframe and detached windows. src/popup/App.tsx resolves which of those it is (src/popup/runtime.ts), then nests four providers: `PagesProvider` (src/popup/pages.tsx) is the only navigation code. `open(id, origin)` and `back()` show one page at a time, the page title takes focus on open, the originating control regains it on return, and `usePageOpen` and `usePageLeave` hooks hold a page's load logic and let it keep itself open, as Debug tools and Import & export do to let Escape dismiss a pending confirmation first. On the home menu of the floating launcher, Escape closes the menu. `SettingsProvider` holds appearance, row layout, toolbar and color settings with one save, so the home and page copies of a preference (`AppearanceToggle`, `data-appearance="key"`) share one value; a save shows the change at once, then writes it. Reset style and Reset layout each write only their own keys. `EnvironmentProvider` owns the environment configuration, the target tab and the background's `environment.*` messages for the home strip, Environments, Floating launcher and Import & export. `DebugProvider` holds Debug tools' target, site access, confirmation and execution, shared with Log page data on the home menu. Each page is a view in src/popup/views built from the components in src/popup/components: `Page`, `FeatureEntry`, `Toggle`, `Segmented`, `Select`, `TextField`, `Button`, `Card`, `Tabs`, `Note`, `Status` and `PageFooter`. `Unavailable` wraps any control that can be disabled with a reason, giving it a focusable "Why … is unavailable" wrapper and tooltip; once wrapped, a control keeps the wrapper so it is not remounted, and controls that listen for native `change` events (color swatches, panel widths) attach them through ref callbacks for the same reason. Import & export (with the pure model in src/lib/settings-transfer.ts) groups storage into the same sections as the pages; an import validates the whole file, writes only the chosen sections and sends environments to the background as `environment.save` with `replace`, so custom-domain registration stays in one place. Canvas layout also holds the Toolbar options, stored as `canvasToolbar` (src/lib/toolbar-settings.ts) and exported with the Canvas layout section. The canvas-toolbar content script clicks Unqork's own search button whenever it is rendered and returns focus to the element that had it; it stops after six clicks in two seconds if the field does not open, until the next module or settings change. Both scripts watch the page only while their option is on. While the field is always visible, it intercepts Close search and Escape in the capture phase and clears the field through the native value setter and an input event, so Unqork's state empties without the field closing; Escape on an empty field only blurs it. It passes the sort choice to MAIN as `data-unqlock-sort-mode` on the root element. The canvas-toolbar bridge runs in MAIN, walks up from the sort trigger's React fiber to the component whose props hold `options`, `selectedValue` and `onSelect`, and renders the switches beside the hidden trigger, calling `onSelect` on click. React keeps two versions of each fiber, so the bridge reads props from the current one using the same pairing walk as React's findCurrentFiberUsingSlowPath; the fixture's memoized trigger keeps the switches honest about reading the value from the dropdown rather than the trigger. Any other shape leaves the native dropdown alone. The environment-label toggle on Floating launcher saves `environment.badge` through the background's partial-preference merge.

Commit the files shown above, including the PNG icons and package-lock.json. Do not commit node_modules/, .wxt/, dist/ or artifacts/; they are generated locally and ignored by Git. Build scripts resolve paths from their location, so they do not depend on a machine-specific checkout path.

## Tests

```sh
npx playwright install chromium firefox
npm test
npm run lint:firefox
```

npm test runs the type check and the Vitest unit tests first, then builds and runs the browser suites against dist/. npm run test:unit runs only the unit tests. npm run lint:firefox runs web-ext lint through scripts/lint-firefox.cjs, which fails on any error or warning except the two innerHTML assignments inside React DOM, which exist only for dangerouslySetInnerHTML; Unqlock never uses that, and a third such warning fails the lint so new code gets reviewed. The unit tests in tests/unit render the real React popup in jsdom with an extension API double, once under `chrome` and once under `browser`, so both API branches are covered: `harness.tsx` installs the double and imports a fresh copy of the popup for each run. They interact through Testing Library's `fireEvent`, which sets values the way React expects; assigning `.value` and dispatching an event by hand does not reach a controlled input. Tests that run code outside the built extension, such as model checks and page actions, bundle it from src/lib with esbuild through tests/lib.cjs; tests that inject content scripts into fixture pages read the built files from dist/<browser>/content-scripts.

Optionally set CHROME_PATH to an installed Chrome for Testing executable for the Chromium tests. Otherwise Playwright's Chromium is used. Tests run in isolated profiles using synthetic builder fixtures and do not access your real module data. The Firefox behavior test supplies a browser API test double; it verifies Firefox rendering and the Firefox API branch, not Mozilla signing or live-site permission prompts. An additional web-ext test installs and reloads the actual Firefox package in an isolated temporary profile (optionally set FIREFOX_PATH to override its executable). Chrome integration loads the actual unpacked extension and exercises persistent popup settings, page navigation and focus return, the bound home switches, the split resets and logging from home. No tests install an extension into your normal browser profile.

The behavior fixture mirrors the builder's canvas markup as captured from a saved builder page: a header with an icon tile, an identity wrapper holding the property ID and type label, and a trailing group with the dependency count, actions menu and container chevron, plus collapsible containers built from `data-slot` collapsible triggers and content. Canvas row layout and the container options detect exactly that structure and leave anything else untouched, so update the fixture first if Unqork changes it. Group colors live in src/lib/component-colors.ts: the default palette, the picked colors stored as `componentColors` (`{ group: { light: { ink, tint }, dark: { ink, tint } } }`, picked values only), and the partner rule: a theme with only one picked color derives the other, a background capped short of white or black so it keeps its hue, or a foreground with at least 5:1 contrast. Two picked colors are used as picked. A derived pale background cannot keep close hues apart, which is why backgrounds can be picked. The content script's style.css only references variables; the content script (src/entrypoints/content.content) sets them, and the distinct-shape images built from the palette, on the root element through the CSSOM, which the builder's content security policy allows where an injected stylesheet might not. On a colored surface, a full-background row or a tinted container header, the content script also marks the row's own dependency chip (`data-uq-chip`) and actions menu and chevron (`data-uq-row-control`) so they take its colors instead of Unqork's brand tint and gray; tinted headers use the background color and keep a 12% foreground band over full backgrounds. The Colors section of Component style renders one picker row per group from the same module. The content script reruns only for mutations that touch a component or an element it marked, or after a route change; the rest of the builder, such as streaming Build Agent replies, changes on nearly every frame, and a full pass costs about 5 µs per component.

`tests/unit/import-export.test.tsx` drives Import & export in both API branches with storage, clipboard and download doubles, covering validation, per-section imports, Escape, file input and the Firefox tab hand-off for file picking; Chrome integration round-trips real storage through Copy JSON, a downloaded file and a pasted import. `tests/quick-actions.cjs` runs the page action against synthetic Angular objects. `tests/environment.cjs` covers hostname classification, discovery and the built badge's lifecycle. `tests/unit/environments.test.tsx` covers the production guard, the home environment strip and group editing, and `tests/unit/debug-tools.test.tsx` covers logging from home and its hand-over to Debug tools, site access, confirmations and tabs in the toolbar popup, a detached window and the floating menu; the background test drives the message listener against a tab API that omits url, the way a browser without host access does. The environment browser test loads the real extension and exercises badge injection on a granted custom domain and on a statically matched unqork.io host, covering both sides of the Debug tools site-access request; it grants its custom domain by editing the fixture manifest, since the real permission prompt is user-controlled and cannot be accepted from automation.

Before a release, verify both permission flows in both browsers on a disposable Unqork application. From the toolbar: log data from the home menu and from Debug tools, set and remove a test property, and trigger a harmless component. From the floating badge: confirm the menu opens, the home environment strip reports the right host and its switch links open the same path, and Log page data on home hands over to Debug tools with the per-hostname site-access request; accept it and repeat the three actions. Declining must leave Component style, Canvas layout, Builder panels, Environments, Floating launcher and Import & export usable. In Firefox, also check that Choose file under Import & export continues in a tab from the toolbar popup, and that Copy JSON works from the floating menu.

`tests/builder-panels.cjs` bundles a nested-layout fixture using the native `react-resizable-panels` library. It tests the installed Chrome extension and the Firefox API branch against native collapse, imperative resize and real pointer/keyboard input. react-resizable-panels and esbuild are test-only dependencies and do not enter either extension package. The sizing adapter in the panel-resize bridge runs in MAIN and locates the public `panelRef` on the React wrapper; if Unqork changes that integration, it reports unsupported sizing instead of overriding CSS or mutating React state. A live Unqork smoke test is still required before publishing.

The live Build Agent panel keeps its content mounted but hidden while collapsed, so its hidden Collapse left button coexists with the visible Expand left button. Panel lookup therefore counts only rendered toggles, for every panel. The fixture reproduces this for Build Agent and Component tray.

`tests/canvas-toolbar.cjs` bundles `tests/fixtures/canvas-toolbar.jsx`, a React copy of the builder's search and sort toolbar code paths, and runs it against the installed Chrome extension and, with `--firefox`, the Firefox API branch. It covers focus retention when the search opens, clearing in place with Escape and the close button, the switches following Unqork's value through a memoized trigger, keyboard selection, toolbar remounts, the fallback for an unrecognized sort control, scope, and popup persistence and reset.

`tests/firefox-panel-bridge.cjs` installs the actual Firefox extension in a temporary profile and verifies isolated-content-script to MAIN-world resizing against the native fixture. Only that test copy of the manifest receives localhost access. `tests/unit/builder-panels.test.tsx` checks queued saves and resets, focus retention, the busy state, measured widths and width validation; `tests/unit/components.test.tsx` covers the shared components and page navigation.

In the live builder, the bridge finds the public panel reference at depth 1 for all four side panels, resizes each one and restores original widths and collapsed state. Recheck this against Unqork's current builder before a release, since it depends on their integration.

Always collapsed guards the native public `expand` and `resize` methods in MAIN. Accessors retain native method replacements during rerenders and restore the latest implementation on unlock. The bridge collapses once through the native API, avoiding repeated close-button clicks when component selection requests expansion. If the builder no longer exposes configurable public methods, the existing close-after-reopen behavior remains the fallback. The panel tests sample widths across animation frames and check rerenders, all four panels and restored expansion; the installed Firefox bridge test covers the actual world boundary.

## Icons and generated documentation

To edit the extension icon, change src/public/icons/unqlock.svg and run npm run icons after installing Playwright's Chromium. This regenerates the committed PNG icons and the documentation preview. Regular builds use the committed images and do not need a browser installation.

The component catalog in docs/component-catalog.json is used by the behavior tests.

The store gallery is five 1280 × 800 PNGs under docs/screenshots/, composed from the captures in docs/screenshots/SS/, which also appear in the main README. After a popup change, run npm run build, npm run screenshots and `python scripts/compose-listing.py` (Pillow and the Windows Segoe UI fonts). npm run screenshots captures every popup page from dist/chrome with example data; the two builder captures come from a real builder session, so capture only test data and redact organization hostnames. See docs/screenshots/README.md for the image list and upload order.

Store copy is maintained in docs/CHROME-WEB-STORE.md, amo-metadata.json and the shared manifest description in wxt.config.ts. Both builds inherit that manifest description. Chrome's detailed listing and screenshot uploads are dashboard operations; the package-upload API does not apply the Markdown document. Firefox listed submissions pass amo-metadata.json through web-ext, including summary, description, categories and version metadata. Screenshots still need separate developer-hub uploads. docs/RELEASE-NOTES.md contains the feature summary and package notes for the next release. Refresh these files together before tagging.

docs/PRIVACY.md is the privacy notice both store listings point to. Keep it consistent with the permissions the manifest declares.

## Versioning

Version bumps are manual: patch for fixes, minor for features, major for breaking changes. The helper updates package.json and package-lock.json together without committing or tagging. Both browsers always share one version. Numeric major.minor.patch versions only; prerelease suffixes are not supported.

Example next patch release from 1.0.0, run after committing other changes:

```sh
npm run version:bump -- patch
npm test
npm run lint:firefox
git add package.json package-lock.json
git commit -m "Release 1.0.1"
git tag -a v1.0.1 -m "Unqlock 1.0.1"
git push origin HEAD
git push origin v1.0.1
```

Use minor, major or an explicit higher version instead of patch as needed; adjust the commit and tag accordingly. Run npm run version:check -- v1.0.1 to verify a proposed tag. Do not move published tags; fix issues in a new version. Both stores reject a version they already hold, so a rejected or superseded submission needs a new version.

## Continuous integration

Every push and pull request runs the full build and browser tests, Firefox lint, and source packaging on Ubuntu with Node.js 22. Successful runs retain downloadable ZIP artifacts for 14 days. Pull requests never publish releases or contact Mozilla or Google. Actions are pinned to commit hashes; only the release job receives repository write permission, and each store credential reaches only its own publishing job.

Pushing a tag beginning with v additionally validates that it exactly matches the numeric package, lockfile and manifest version, such as v1.0.0. After all checks pass, two store jobs run in parallel on the tested packages: the AMO job unpacks the Firefox ZIP and submits it with its source archive to addons.mozilla.org, while the Chrome job uploads the Chrome ZIP to the Chrome Web Store and submits it. The release job then creates a GitHub Release with docs/RELEASE-NOTES.md plus generated commit notes and the exact tested Chrome, Firefox and source ZIPs, plus the signed XPI when Mozilla returned one. Other tags only run checks. Failed checks, mismatched tags, a failed submission or a rejected store upload prevent the release. Existing releases are not overwritten; rerunning an already published release fails safely.

Beyond these two stores a release adds nothing: no other update channel, and the Firefox ZIP attached to it stays unsigned, since on the listed channel Mozilla signs and serves the add-on from its own listing. The release job uses GitHub's built-in token and needs no personal access token. No release is created until you push a matching version tag.

## Mozilla listing credentials

Firefox releases go to the public addons.mozilla.org listing through Mozilla's add-on submission API. Create API credentials at https://addons.mozilla.org/developers/addon/api/key/ and store them as repository secrets: AMO_JWT_ISSUER for the JWT issuer and AMO_JWT_SECRET for the JWT secret. Both are required for a tagged release; without them the submission job fails and no release is published. The secret is shown once, is tied to your AMO account, and should be revoked and replaced if exposed.

Unlike the Chrome package-upload API, the installed web-ext submission path sends the top-level AMO metadata along with the version to Mozilla's add-on endpoint. Keep summary, description and categories in amo-metadata.json current, and check the resulting developer-hub listing after submission. Screenshots and any remaining listing fields are managed in the developer hub.

Listed submissions also send amo-metadata.json, whose version object is merged into the submission payload. AMO rejects a listed version that declares no license, so version.license must stay set; it is MIT, matching the LICENSE file. The same file carries approval_notes, the build instructions Mozilla reviewers see. Listing fields such as name, summary and categories can be added there too, or set in the developer hub.

The default channel is listed: the version is submitted to the public listing under the add-on ID unqlock@fusan.me, together with artifacts/unqlock-source.zip for source review, and Mozilla signs and publishes it after review. Submission does not wait for that review, so a listed run usually returns no XPI and the release simply omits it; users install from the AMO listing. Set the repository variable AMO_CHANNEL to unlisted for self-distribution instead, which signs immediately, returns the XPI and publishes nothing on AMO.

One add-on ID can carry versions on both channels; the channel is chosen per version, and an unlisted version only needs a version number distinct from the latest listed one. Keeping the Firefox manifest in wxt.config.ts free of browser_specific_settings.gecko.update_url is what makes a self-distributed install upgradable: with no update_url, Firefox falls back to AMO's version check for unqlock@fusan.me and picks up a later approved listed version in place, preserving extension-local preferences. Adding an update_url would point those installs at that endpoint alone, and AMO rejects it on listed submissions anyway, so self-hosting updates means diverging the two channels' manifests. Mozilla documents the update_url requirement but not this fallback, which comes from AMO staff guidance, so confirm it in a disposable profile before shipping a release that relies on it.

Submit locally the same way:

```sh
npm ci
npm run build
npm run package:source
export AMO_JWT_ISSUER=...
export AMO_JWT_SECRET=...
npm run sign:firefox
```

Pass unlisted as an argument, or set AMO_CHANNEL, to override the channel. The script refuses to run without credentials, submits dist/firefox (unpacking artifacts/unqlock-firefox.zip when dist is absent), and when Mozilla returns a signed file it verifies the package's version and add-on ID and writes artifacts/unqlock-firefox-VERSION.xpi.

## Chrome Web Store credentials

Publishing uses the Chrome Web Store API, so the listing must already exist: create the item once by hand in the developer dashboard, complete its store listing and privacy fields, and note its 32-character item ID. The API updates and submits an existing item; it does not fill in listing metadata.

Enable the Chrome Web Store API in a Google Cloud project, create an OAuth client, and exchange its authorization code for a refresh token with the https://www.googleapis.com/auth/chromewebstore scope, as described at https://developer.chrome.com/docs/webstore/using-api. Request the code from https://accounts.google.com/o/oauth2/v2/auth with offline access; the older /o/oauth2/auth endpoint rejects this scope as unknown. Use a loopback redirect such as http://localhost:8818 rather than the retired out-of-band redirect, and authorize as the Google account that owns the listing.

Choose the external audience unless you have a Google Workspace organization, add that account as a test user, then publish the app so its status is in production: while it stays in testing, Google expires refresh tokens after seven days and releases start failing with an invalid_grant error. Verification is not required for this scope with a single user; the unverified-app warning appears once during authorization and is bypassed under Advanced. A production refresh token does not expire on a timer, but is invalidated by six months of disuse, by revoking it or the client secret, or by re-running the consent flow often enough to push it out of Google's hundred-token-per-client limit.

Store three repository secrets: CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN, plus the item ID as the repository variable CWS_EXTENSION_ID, since it is public listing information rather than a credential. All four values are required for a tagged release. The refresh token grants publishing rights to your developer account; revoke it in your Google account if exposed.

The default target submits to the public listing, which goes live after Google's review. Set the repository variable CWS_PUBLISH_TARGET to trustedTesters to release to testers only, or to draft to upload the new version without submitting it, which is the safest way to rehearse the credentials.

Publish locally the same way:

```sh
npm ci
npm run build
export CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... CWS_REFRESH_TOKEN=... CWS_EXTENSION_ID=...
npm run publish:chrome
```

Pass trustedTesters or draft as an argument, or set CWS_PUBLISH_TARGET, to override the target. The script refuses to run without all four values, verifies the packaged manifest version against the package version, uploads artifacts/unqlock-chrome.zip and reports whether the item went live or entered review.
