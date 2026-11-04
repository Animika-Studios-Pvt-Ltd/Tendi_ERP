/** Joins truthy class names. Keep variant maps free of conflicting utilities. */
export function cn(...classes) {
  return classes.flat().filter(Boolean).join(' ');
}
