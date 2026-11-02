// Unqlock SSE debugger, an opt-in Debug tools option beside Detach dev overlay and independent of it.
// While on, the dev-overlay content script adds Open in Unqlock debugger to Unqork's drawer, which opens
// this extension's own window for that builder tab. It shares Detach's unqork.io access.
export const key = 'sseDebugger';
// While the debugger is on: hide Unqork's dev overlay and open Unqlock's debugger from Server-Side Execute.
export const replaceKey = 'sseDebuggerReplace';
export const enabled = (value: unknown) => value === true;
export const page = '/sse.html';
// The window opens maximized; this is its size only where a browser refuses that and the screen is unknown.
export const size = { width:1280, height:800 };
