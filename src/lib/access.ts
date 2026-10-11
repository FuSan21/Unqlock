// The prompt window: a small extension window that asks for site access, or picks a settings file,
// where a popup cannot. Firefox closes its toolbar popup when a permission prompt or file picker opens,
// and the floating menu's frame cannot always request permissions. The background opens the window
// and works out what to request, so the window's address only names the kind of request.
export const accessKinds = ['debug', 'devOverlay', 'badges'] as const;
export type AccessKind = typeof accessKinds[number];
export const isAccessKind = (value: unknown): value is AccessKind => accessKinds.includes(value as AccessKind);

export const page = '/prompt.html';
export const sizes = { access:{ width:420, height:560 }, import:{ width:460, height:640 } };

// A match pattern as people read it: "*.unqork.io" or "custom.test".
export function originLabel(origin: string) {
  const match = origin.match(/^(\*|https?):\/\/([^/]+)\/\*$/);
  return match ? match[2] : origin;
}
