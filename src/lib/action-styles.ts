// Semantic colors for row/record actions (demo feedback: actions all read as the same gray).
// Destructive = red, edit = green; both stay quiet at rest and intensify on hover, so tables
// gain color without shouting. Applied via className on the existing ghost/outline buttons --
// never new variants, so size/spacing/focus behavior stays identical everywhere.
export const DESTRUCTIVE_ACTION_CLASS =
  "text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300";

export const EDIT_ACTION_CLASS =
  "text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300";
