## New in 1.7.3

- **Input sent as shown:** the SSE debugger now sends the input as the request's *data* exactly as the fixed lines around **Input** show it, for **data**, **_request**, **query** and **body**. 1.7.2 put every shape inside an extra *data* object, so the module did not receive the input.
- **Large runs stay in Runs:** with **Keep past runs** on, a run whose steps and response are too large for the browser's storage is no longer left out. It stays in **Runs** with its input, options and result, and **Rerun** runs it again to show the rest.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
