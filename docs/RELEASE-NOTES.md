## New in 1.7.4

- **Imports keep the styling switch:** importing **Component style** from a file no longer changes the **Component styling** switch on the home menu, just as **Reset style** leaves it alone. A file shared by a teammate who had styling turned off no longer turns it off for you.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
