## New in 1.7.0

- **Unqlock SSE debugger:** a new opt-in Debug tools option adds **Open in Unqlock debugger** to Unqork's SSE Debugger drawer. It opens Unqlock's own window for that builder tab, where **Run module** runs the module on the server and shows the run at a glance: a one-line result, the component that stopped a failed run, and **Steps** with one lane per component and one column per step, so you can select any value and trace which component set it and why. **Changes**, **Output** and **Raw** show the changed values, the returned data and the exact request and response. It works beside Detach dev overlay, and asks for the same access to unqork.io sites. With **Use instead of Unqork's debugger**, shown under the option while it is on, Unqork's dev overlay is hidden and **Server-Side Execute** opens Unqlock's debugger.
- **Rerun, Slow, value search and setup lanes in the SSE debugger:** **Rerun** beside a past run runs it again with its input and options. A **Slow** badge marks a run over 300 ms or a wait, such as a plug-in, over 3 seconds, and the result line links to the slowest. **In values** lets the filter find components by the values they set, and **Hide setup values** leaves out components that only received a setup value.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
