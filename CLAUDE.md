# Unqlock

Manifest V3 extension for Chrome and Firefox that styles the Unqork Config builder and adds debug tools. TypeScript built with WXT from one source tree in src/: entrypoints in src/entrypoints, shared models in src/lib, the React popup in src/popup, and the manifest in wxt.config.ts. Reproducible packages land in artifacts/.

README.md is the user-facing documentation: features, installation and privacy. Everything about building, testing, versioning and publishing to the two stores lives in @.claude/development.md — read it before changing the build scripts, the workflow or anything release-related.

## Commands

```sh
npm ci                        # install dependencies and generate WXT types
npm run build                 # write dist/ and artifacts/ for both browsers
npm run typecheck             # tsc against WXT's generated config
npm run test:unit             # Vitest popup and component tests in jsdom
npm test                      # full suite, including real-browser checks
npm run lint:firefox          # web-ext lint; any warning fails except React DOM's innerHTML
npm run package:source        # source ZIP for AMO review
npm run version:bump -- patch # patch, minor, major or an explicit X.Y.Z
npm run sign:firefox          # submit to addons.mozilla.org
npm run publish:chrome        # upload and publish to the Chrome Web Store
npm run icons                 # regenerate committed PNG icons from the SVG
npm run screenshots           # recapture the popup screenshots from dist/chrome
```

## Conventions

- Node.js 22 or newer. Maintenance scripts are CommonJS .cjs files under scripts/. React and React DOM are the only runtime dependencies and only the popup uses them; content scripts, the MAIN-world bridges and the background stay framework-free. No polyfills.
- Popup UI is built from the shared components in src/popup/components (Toggle, Segmented, Select, Button, Page, Card and friends). Use them for new controls rather than hand-writing markup, so every page looks and behaves the same.
- The version in package.json and package-lock.json must always match; WXT writes it into both manifests. scripts/version.cjs enforces this and validates release tags.
- Builds must stay reproducible: fixed archive timestamps, no symlinks in build inputs, no npm packages or tests inside the ZIPs, and no machine-specific paths in the bundles (wxt.config.ts turns off the bundler's debug comments for this).
- dist/, artifacts/ and .wxt/ are generated and gitignored; never commit them.
- Releases are driven only by pushing a v tag. Store credentials live in repository secrets and are read by their own workflow job, never by the build or test jobs.
