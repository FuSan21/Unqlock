## New in 1.6.2

- **Mark disabled components:** components whose **Disable Execution** (logic such as Decisions) or **Disabled** (inputs) is turned on in Properties now stand out on the canvas, with a dashed, hatched frame, faded contents and a struck-through name. It is the first option under Component frames and is on by default; a disabled container marks only its own header and frame.

## Package notes

- Built with WXT from TypeScript. The popup uses React and React DOM, the only runtime dependencies; content scripts and the background are framework-free.
- Bundles are unminified. npm ci followed by npm run build reproduces both packages.
