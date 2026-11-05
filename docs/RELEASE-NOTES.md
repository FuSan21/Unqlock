## New in 1.9.0

- **Promoted saves in History:** a save in a module's **History** that was promoted to another environment now shows a green rocket after its name. Hover it to see where it went, who promoted it and when. **Promotion badges**, under the new **History** card in **Builder panels**, is on by default.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
