/** Capitalize the first letter of a string. */
export const capitalize = (s: string): string =>
  s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
