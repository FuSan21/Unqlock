## New in 1.8.0

- **Imports keep the styling switch:** importing **Component style** from a file no longer changes the **Component styling** switch on the home menu, just as **Reset style** leaves it alone. A file shared by a teammate who had styling turned off no longer turns it off for you.
- **Settings stay in step:** with the toolbar popup and the floating menu open together, or after importing a file in the Unqlock window, a change made in one no longer puts back the settings the other loaded earlier.
- **SSE debugger fixes:** a run too large to save stays in **Runs** while its window is open, **Stop** works right after **Run module**, and a saved run that failed names the step it stopped in.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
