// Semantic colors for row/record actions (demo feedback: actions all read as the same gray,
// then as bare text). Each is a soft pastel PILL -- tinted background at rest so it clearly
// reads as a pressable button, one shade deeper on hover. Destructive = red, edit = green,
// status/neutral = gray. Applied via className on ghost-variant buttons -- never new variants,
// so size/spacing/focus behavior stays identical everywhere.
export const DESTRUCTIVE_ACTION_CLASS =
  "border-red-500/15 bg-red-500/8 text-red-700 hover:border-red-500/25 hover:bg-red-500/15 hover:text-red-800 dark:border-red-500/25 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25 dark:hover:text-red-300";

export const EDIT_ACTION_CLASS =
  "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 hover:border-emerald-500/25 hover:bg-emerald-500/15 hover:text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/25 dark:hover:text-emerald-300";

export const NEUTRAL_ACTION_CLASS =
  "border-foreground/10 bg-foreground/[0.04] text-foreground/70 hover:bg-foreground/10 hover:text-foreground dark:border-foreground/15 dark:bg-foreground/[0.08] dark:hover:bg-foreground/15";
