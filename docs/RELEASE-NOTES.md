## New in 1.7.2

- **Input shapes in the SSE debugger:** the input now reaches the module: it is sent as the submission's values, which Unqork reads from *data.data*, where before the module ran without it. A switch above **Input** places it as **data**, or for an API module under **_request**, its **query** or its **body**, and shows that wrapper as fixed lines around what you type, which changing the switch keeps. The window remembers the choice, and **Rerun** restores it.
- **Keep past runs:** a new option under Unqlock SSE debugger in Debug tools, off by default, saves the debugger's last 10 runs in this browser for 30 days, so they are still there when you open the window again. **Clear** removes them, and turning the option off deletes them.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
