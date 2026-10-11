## New in 1.6.0

- **Detach dev overlay:** an opt-in Debug tools option adds a Detach button to Unqork's SSE Debugger drawer. It opens the module in its own window showing only the overlay, with Execute, the event stream and every menu working as usual, while the builder stays in view. Closing that window or choosing Reattach brings the drawer back. Turning the option on asks for access to unqork.io sites; while it is off, nothing is added to Unqork pages.
- **Navigation tabs:** under Builder panels, the tab bar can be kept as is, shown on several lines with each tab's full name, or hidden so only the current tab is kept, with the application and module named in the toolbar. **Collapse until header hover** keeps the bar out of sight until Unqork's header is hovered.
- **Component labels:** under Canvas layout, each component's label can be shown after its property ID, always or only when it differs.
- **Legacy view:** canvas styling now works in Unqork's legacy view, including preview rows for inputs, buttons and content, with the property ID shown muted beside the type.
- **Draggable floating launcher:** Floating launcher → Position chooses Fixed, in a corner, or Draggable, anywhere on the page for that tab. The menu opens toward the side with more room.
- **Fixes:** builder features now load when Unqork's module search opens the builder without a page load, and selected rows and search matches stand out on styled rows.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
