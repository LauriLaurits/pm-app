"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Thin wrapper so the root layout (a server component) doesn't itself need "use client" just to
// mount next-themes' provider. attribute="class" matches globals.css's `@custom-variant dark
// (&:is(.dark *))` -- next-themes toggles the same `.dark` class on <html> that Tailwind's
// dark: variant already keys off, so no separate dark-mode wiring is needed anywhere else.
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
