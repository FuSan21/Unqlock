## New in 1.5.0

- **Switches for builder panels:** each panel's Visibility (Default, Start collapsed, Always collapsed) and Width (Default, Custom, Remember last) are side-by-side switches like the canvas row layout, and every panel's options are shown at once.
- **Switches for the canvas toolbar:** under Canvas layout → Toolbar, Search bar and Sort mode are switches between Default and Always visible or Switches.
- **Save status:** Component style and Canvas layout show *Saving…* while a change is being saved, then *Saved*.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
