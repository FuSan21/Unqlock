// Component labels on the canvas, drawn after the property ID. Default keeps Unqork's rows, When different adds a label
// that differs from its property ID, and Always adds every label, even one that repeats the ID.
export const modes = [['native', 'Default'], ['different', 'When different'], ['always', 'Always']] as const;
export type LabelMode = typeof modes[number][0];
export const key = 'canvasLabels';
export const mode = (value: unknown): LabelMode => modes.some(([id]) => id === value) ? value as LabelMode : 'native';

// Whether a row whose name line shows its property ID gets its label after it. Unqork's legacy view
// already names a row by a label that differs, with the ID in the type line, so only Always adds to it,
// and only a label that repeats the ID.
export function shows(current: LabelMode, label: string | null, id: string | null, legacy: boolean) {
  if (current === 'native' || !label) return false;
  return label === id ? current === 'always' : !legacy;
}
