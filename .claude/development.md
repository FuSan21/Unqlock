# Development and release

Maintainer documentation for Unqlock. User-facing documentation is in README.md.

## Build

Requirements, build commands and manual installation of a local build are in README.md under Building from source. Run every command from the repository root.

Beyond the outputs listed there, npm run sign:firefox writes artifacts/unqlock-firefox-VERSION.xpi when Mozilla returns a signed file, and npm run package:source writes artifacts/unqlock-source.zip, the archive listed AMO submissions upload for review.

Extension code lives in src/ and browser-specific manifest settings live in manifests/. Both packages use identical JavaScript, CSS, HTML and icons; the build merges manifest.base.json with the appropriate browser overrides. The runtime chooses Firefox's promise-based browser API when available, otherwise Chrome's API. No polyfill or runtime dependency is needed.

Build tools are development-only. ZIP files contain no npm packages or tests. Archives use fixed timestamps for repeatable builds, and the build refuses symbolic links or redirected output directories.

## Add-on identity

The add-on ID is unqlock@fusan.me. It replaces unqlock@extensions.local, which was used for an earlier Mozilla submission; changing a listing slug does not change the internal ID, so this identity is submitted as a new add-on rather than an update. Keep the ID unchanged for subsequent releases.

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

Quick-action tests use synthetic Angular objects and test doubles for tab selection and script injection. Before a release, verify the real toolbar permission flow in both browsers on a disposable Unqork application: log data, set and remove a test property, and trigger a harmless component.

## Icons and generated documentation

To edit the extension icon, change src/icons/unqlock.svg and run npm run icons after installing Playwright's Chromium. This regenerates the committed PNG icons and the documentation preview. Regular builds use the committed images and do not need a browser installation.

The component catalog in docs/component-catalog.json is also used by the behavior tests. The icon proposal in .claude/icon-design-proposal.md is historical design material, not a build input.

Screenshots in docs/screenshots/ are captured by hand and embedded in README.md. Capture only test data and hide private information before committing. Both builder screenshots show styling enabled with different options; they are not a before/after comparison.

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

Pushing a tag beginning with v additionally validates that it exactly matches the numeric package, lockfile and manifest version, such as v1.0.0. After all checks pass, two store jobs run in parallel on the tested packages: the AMO job unpacks the Firefox ZIP and submits it with its source archive to addons.mozilla.org, while the Chrome job uploads the Chrome ZIP to the Chrome Web Store and submits it. The release job then creates a GitHub Release with generated notes and the exact tested Chrome, Firefox and source ZIPs, plus the signed XPI when Mozilla returned one. Other tags only run checks. Failed checks, mismatched tags, a failed submission or a rejected store upload prevent the release. Existing releases are not overwritten; rerunning an already published release fails safely.

Beyond these two stores a release adds nothing: no other update channel, and the Firefox ZIP attached to it stays unsigned, since on the listed channel Mozilla signs and serves the add-on from its own listing. The release job uses GitHub's built-in token and needs no personal access token. No release is created until you push a matching version tag.

## Mozilla listing credentials

Firefox releases go to the public addons.mozilla.org listing through Mozilla's add-on submission API. Create API credentials at https://addons.mozilla.org/developers/addon/api/key/ and store them as repository secrets: AMO_JWT_ISSUER for the JWT issuer and AMO_JWT_SECRET for the JWT secret. Both are required for a tagged release; without them the submission job fails and no release is published. The secret is shown once, is tied to your AMO account, and should be revoked and replaced if exposed.

As with Chrome, the API submits versions but does not write listing metadata. Set the add-on's name, summary, categories and license in the AMO developer hub, either beforehand or right after the first automated submission; until then the listing stays incomplete and invisible.

The default channel is listed: the version is submitted to the public listing under the add-on ID unqlock@fusan.me, together with artifacts/unqlock-source.zip for source review, and Mozilla signs and publishes it after review. Submission does not wait for that review, so a listed run usually returns no XPI and the release simply omits it; users install from the AMO listing. Set the repository variable AMO_CHANNEL to unlisted for self-distribution instead, which signs immediately, returns the XPI and publishes nothing on AMO. A given add-on ID cannot be used on both channels.

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
