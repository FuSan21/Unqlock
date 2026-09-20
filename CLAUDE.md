# Unqlock

Manifest V3 extension for Chrome and Firefox that styles the Unqork Config builder and adds debug tools. One shared source tree in src/, per-browser manifest overrides in manifests/, reproducible packages in artifacts/.

README.md is the user-facing documentation: features, installation and privacy. Everything about building, testing, versioning and publishing to the two stores lives in @.claude/development.md — read it before changing the build scripts, the workflow or anything release-related.

## Commands

```sh
npm ci                        # install development dependencies
npm run build                 # write dist/ and artifacts/ for both browsers
npm test                      # full suite, including real-browser checks
npm run lint:firefox          # web-ext lint, warnings are errors
npm run package:source        # source ZIP for AMO review
npm run version:bump -- patch # patch, minor, major or an explicit X.Y.Z
npm run sign:firefox          # submit to addons.mozilla.org
npm run publish:chrome        # upload and publish to the Chrome Web Store
npm run icons                 # regenerate committed PNG icons from the SVG
```

## Conventions

- Node.js 22 or newer. Maintenance scripts are CommonJS .cjs files under scripts/; the extension itself has no runtime dependencies or polyfills.
- The version in package.json, package-lock.json and src/manifest.base.json must always match; scripts/version.cjs enforces this and validates release tags.
- Builds must stay reproducible: fixed archive timestamps, no symlinks in build inputs, no npm packages or tests inside the ZIPs.
- dist/ and artifacts/ are generated and gitignored; never commit them.
- Releases are driven only by pushing a v tag. Store credentials live in repository secrets and are read by their own workflow job, never by the build or test jobs.
