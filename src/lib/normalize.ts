// Stored values come from storage, imports or older versions, so each setting is read through one of these,
// which falls back to its default for anything it does not recognize.

// One of `values`, else `fallback`.
export const oneOf = <T extends string>(values: readonly T[], fallback: T) => (value: unknown): T => values.includes(value as T) ? value as T : fallback;
// On only when stored as true.
export const flag = (value: unknown) => value === true;
// The values as an import error lists them: "a", "b" or "c".
export const choices = (values: readonly string[]) => values.map(value => '"' + value + '"').join(', ').replace(/, ([^,]*)$/, ' or $1');
