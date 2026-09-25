# Development and release

Maintainer documentation for Unqlock. User-facing documentation is in README.md.

## Build

Requirements, build commands and manual installation of a local build are in README.md under Building from source. Run every command from the repository root.

Beyond the outputs listed there, npm run sign:firefox writes artifacts/unqlock-firefox-VERSION.xpi when Mozilla returns a signed file, and npm run package:source writes artifacts/unqlock-source.zip, the archive listed AMO submissions upload for review.

Extension code lives in src/ and browser-specific manifest settings live in manifests/. Both packages use identical JavaScript, CSS, HTML and icons; the build merges manifest.base.json with the appropriate browser overrides. The runtime chooses Firefox's promise-based browser API when available, otherwise Chrome's API. No polyfill or runtime dependency is needed.

Build tools are development-only. ZIP files contain no npm packages or tests. Archives use fixed timestamps for repeatable builds, and the build refuses symbolic links or redirected output directories.

## Add-on identity

The add-on ID is unqlock@fusan.me. Keep the ID unchanged for subsequent releases.

## Source layout

```text
unqork-scripts/
  src/                  Shared extension code, base manifest and icons
  manifests/            Chrome and Firefox manifest overrides
  scripts/              Build, icon rendering, packaging, signing, publishing and test commands
  tests/                Behavior, browser integration and package checks
  docs/                 Component catalog, privacy notice, screenshots and icon preview
  .claude/              Maintainer documentation and design notes
  .github/workflows/    Push/PR checks, tag-triggered store publishing and releases
  CLAUDE.md             Project context and pointers
  LICENSE               MIT license, matching the AMO listing
  amo-metadata.json     Listing metadata sent with AMO submissions
  package.json          Project commands and development dependencies
  package-lock.json     Locked dependency versions
  .gitignore            Excludes dependencies and generated files
  .gitattributes        Consistent text line endings and binary handling
  .editorconfig         Basic editor formatting conventions
  README.md             Features, installation and privacy
```

Commit the files shown above, including the PNG icons and package-lock.json. Do not commit node_modules/, dist/ or artifacts/; they are generated locally and ignored by Git. Build scripts resolve paths from their location, so they do not depend on a machine-specific checkout path.

## Tests

```sh
npx playwright install chromium firefox
npm test
npm run lint:firefox
```

Optionally set CHROME_PATH to an installed Chrome for Testing executable for the Chromium tests. Otherwise Playwright's Chromium is used. Tests run in isolated profiles using synthetic builder fixtures and do not access your real module data. The Firefox behavior test supplies a browser API test double; it verifies Firefox rendering and the Firefox API branch, not Mozilla signing or live-site permission prompts. An additional web-ext test installs and reloads the actual Firefox package in an isolated temporary profile (optionally set FIREFOX_PATH to override its executable). Chrome integration loads the actual unpacked extension and exercises persistent popup settings. No tests install an extension into your normal browser profile.

Quick-action tests use synthetic Angular objects and test doubles for tab selection and script injection. The environment tests cover hostname classification, badge lifecycle and the popup pages in both API branches; the background test drives the message listener against a tab API that omits url, the way a browser without host access does. The environment browser test loads the real extension and exercises badge injection on a granted custom domain and on a statically matched unqork.io host, covering both sides of the Debug tools site-access request; it grants its custom domain by editing the fixture manifest, since the real permission prompt is user-controlled and cannot be accepted from automation.

Before a release, verify both permission flows in both browsers on a disposable Unqork application. From the toolbar: log data, set and remove a test property, and trigger a harmless component. From the floating badge: confirm the menu opens, Environment reports the right host, and Debug tools offers the per-hostname site-access request, then accept it and repeat the three actions. Declining must leave Appearance, Environment and General usable.

`tests/builder-panels.cjs` bundles a nested-layout fixture using the native `react-resizable-panels` library. It tests the installed Chrome extension and the Firefox API branch against native collapse, imperative resize and real pointer/keyboard input. React, React DOM and esbuild are test-only dependencies; none enter either extension package. The sizing adapter in `panel-resize-bridge.js` runs in MAIN and locates the public `panelRef` on the React wrapper; if Unqork changes that integration, it reports unsupported sizing instead of overriding CSS or mutating React state. A live Unqork smoke test is still required before publishing.

`tests/firefox-panel-bridge.cjs` installs the actual Firefox extension in a temporary profile and verifies isolated-content-script to MAIN-world resizing against the native fixture. Only that test copy of the manifest receives localhost access. `tests/panel-popup.cjs` checks queued saves and resets, focus retention, saving cursors and changing panel availability in Chromium and Firefox.

Live Chrome verification on 2026-09-24 confirmed the bridge's public panel reference at depth 1 for all four side panels. Requests resized Build Agent and Explore to 472 px, Component tray to 210 px, and Properties to 240 px; original widths and collapsed state were restored. This verifies the current builder integration, not future Unqork releases.

Always collapsed guards the native public `expand` and `resize` methods in MAIN. Accessors retain native method replacements during rerenders and restore the latest implementation on unlock. The bridge collapses once through the native API, avoiding repeated close-button clicks when component selection requests expansion. If the builder no longer exposes configurable public methods, the existing close-after-reopen behavior remains the fallback. The panel tests sample widths across animation frames and check rerenders, all four panels and restored expansion; the installed Firefox bridge test covers the actual world boundary.

## Icons and generated documentation

To edit the extension icon, change src/icons/unqlock.svg and run npm run icons after installing Playwright's Chromium. This regenerates the committed PNG icons and the documentation preview. Regular builds use the committed images and do not need a browser installation.

The component catalog in docs/component-catalog.json is also used by the behavior tests. The icon proposal in .claude/icon-design-proposal.md is historical design material, not a build input.

The current listing gallery contains five 1280 × 800 PNGs under docs/screenshots/. The descriptively named user-provided captures are in docs/screenshots/SS/ and appear directly in the main README. Deleted archive images are not required. Run `python scripts/compose-listing.py` with Pillow and Windows Segoe UI fonts to regenerate the collages. The composer crops the newer settings and builder captures at their original pixel size. Capture only test data, crop out private navigation, and redact organization hostnames before publishing. See docs/screenshots/README.md for source mapping and upload order.

Store copy is maintained in docs/CHROME-WEB-STORE.md, amo-metadata.json and the shared manifest description in src/manifest.base.json. Both builds inherit that manifest description. Chrome's detailed listing and screenshot uploads are dashboard operations; the package-upload API does not apply the Markdown document. Firefox listed submissions pass amo-metadata.json through web-ext, including summary, description, categories and version metadata. Screenshots still need separate developer-hub uploads. docs/RELEASE-NOTES.md contains the feature summary and package notes for the next release. Refresh these files together before tagging.

docs/PRIVACY.md is the privacy notice both store listings point to. Keep it consistent with the permissions the manifest declares.

## Versioning

Version bumps are manual: patch for fixes, minor for features, major for breaking changes. The helper updates package.json, package-lock.json and src/manifest.base.json together without committing or tagging. Both browsers always share one version. Numeric major.minor.patch versions only; prerelease suffixes are not supported.

Example next patch release from 1.0.0, run after committing other changes:

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

One add-on ID can carry versions on both channels; the channel is chosen per version, and an unlisted version only needs a version number distinct from the latest listed one. Keeping manifests/firefox.json free of browser_specific_settings.gecko.update_url is what makes a self-distributed install upgradable: with no update_url, Firefox falls back to AMO's version check for unqlock@fusan.me and picks up a later approved listed version in place, preserving extension-local preferences. Adding an update_url would point those installs at that endpoint alone, and AMO rejects it on listed submissions anyway, so self-hosting updates means diverging the two channels' manifests. Mozilla documents the update_url requirement but not this fallback, which comes from AMO staff guidance, so confirm it in a disposable profile before shipping a release that relies on it.

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
