// Deterministic soft tint per name for avatar fallbacks -- rows stop blending into a wall of
// gray without per-row random noise. Keyed to the FIRST LETTER of the name (A..Z cycle through
// the palette), so the color is predictable: every "A" person is amber-family, every "B" blue,
// etc. Both modes readable.
const TINTS = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

export function avatarTint(name: string | null | undefined): string {
  const first = name?.trim().charAt(0).toUpperCase();
  if (!first) return "bg-muted text-muted-foreground";
  const code = first.charCodeAt(0);
  // A=0, B=1, ... wrapping over the palette; non-latin initials fall back to the same math.
  return TINTS[Math.abs(code - 65) % TINTS.length];
}
