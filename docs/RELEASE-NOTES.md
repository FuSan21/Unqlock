## New in 1.10.0

- **Restored saves in History:** a save made by restoring an earlier one now shows a blue history badge after its name in a module's **History**. Hover it to see which save it came from, and a guide in the list connects the two. **Restored saves**, under the **History** card in **Builder panels**, is **On hover** by default; **Always** draws every guide at once.
- **Environments on promotion badges:** **Promotion badges** in **Builder panels** is now a choice: **Icon**, the rocket as before, **Environment**, which writes the environments a save was promoted to into its badge, such as *qa-qa · uat*, or **Default**, without badges.

## New in 1.9.1

- **Color themes:** a **Theme** choice above the color swatches in **Component style** swaps every group's colors at once: **Calm**, with quieter backgrounds, **High contrast**, and two themes for color vision deficiency, **Red-green safe** for protanopia and deuteranopia and **Blue-yellow safe** for tritanopia, which keep groups apart that the default colors make look alike. Colors you pick still apply on top.

## New in 1.9.0

- **Search results on the canvas:** the canvas search now lists every match in a dropdown under the field, with each component's property ID, label and type, including components inside collapsed containers that Unqork's search cannot highlight. Click one, or choose it with the arrow keys and press Enter, to open its containers, scroll to it and select it. **Search results**, under **Toolbar** in **Canvas layout**, is on by default.
- **Promoted saves in History:** a save in a module's **History** that was promoted to another environment now shows a green rocket after its name. Hover it to see where it went, who promoted it and when. **Promotion badges**, under the new **History** card in **Builder panels**, is on by default.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
