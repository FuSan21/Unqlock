## New in 1.6.1

- **What's new:** release notes for every version, opened from **What's new** beside the version in the header. After an update that adds features, the toolbar icon shows *NEW* and the home menu names the new version until you read its notes or dismiss the notice.
- **Site access and file picking in Firefox:** where Firefox would close the toolbar popup, site access for Debug tools from the floating launcher, Detach dev overlay and custom-domain badges, and choosing a settings file to import, now open in a small Unqlock window that names the sites and what Unqlock will do there. Detach dev overlay can now be turned on and off from the floating menu in Firefox.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
