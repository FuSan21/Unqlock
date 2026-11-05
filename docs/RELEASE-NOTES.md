## New in 1.9.0

- **Search results on the canvas:** the canvas search now lists every match in a dropdown under the field, with each component's property ID, label and type, including components inside collapsed containers that Unqork's search cannot highlight. Click one, or choose it with the arrow keys and press Enter, to open its containers, scroll to it and select it. **Search results**, under **Toolbar** in **Canvas layout**, is on by default.
- **Promoted saves in History:** a save in a module's **History** that was promoted to another environment now shows a green rocket after its name. Hover it to see where it went, who promoted it and when. **Promotion badges**, under the new **History** card in **Builder panels**, is on by default.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
