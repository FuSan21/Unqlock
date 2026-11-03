## New in 1.8.1

- **Metadata in the SSE debugger:** **Include metadata**, under the switch above **Input**, adds a second JSON field that is sent as the request's *metadata*, beside *data*, for every input shape. The window remembers the choice, and opening a past run or **Rerun** restores it with that run's metadata.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
