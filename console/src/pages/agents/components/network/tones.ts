// Chip colours shared by the method and status badges: Postman's palette, a
// shade deeper so it holds up as small text on both themes. Full class
// strings: Tailwind only sees literals
export const TONES = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  orange: 'bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  blue: 'bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  violet: 'bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  red: 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  pink: 'bg-pink-500/15 text-pink-700 dark:bg-pink-500/20 dark:text-pink-400',
  muted: 'bg-muted text-muted-foreground',
} as const;

export type Tone = keyof typeof TONES;

/** Shape of a method or status chip, over the outline Badge */
export const CHIP = 'border-transparent px-1.5 font-semibold tracking-wide';
