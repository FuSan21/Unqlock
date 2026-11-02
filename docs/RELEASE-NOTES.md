## New in 1.7.0

- **Unqlock SSE debugger:** a new opt-in Debug tools option adds **Open in Unqlock debugger** to Unqork's SSE Debugger drawer. It opens Unqlock's own window for that builder tab, where **Run module** runs the module on the server and shows the run at a glance: a one-line result, the component that stopped a failed run, and **Steps** with one lane per component and one column per step, so you can select any value and trace which component set it and why. **Changes**, **Output** and **Raw** show the changed values, the returned data and the exact request and response. It works beside Detach dev overlay, and asks for the same access to unqork.io sites.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
