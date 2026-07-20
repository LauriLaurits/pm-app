"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/**
 * True only once this render is happening on the client, past hydration. Needed because
 * next-themes reads localStorage synchronously on its very first client render (to avoid a
 * flash of the wrong theme), which means that first client render already disagrees with the
 * server-rendered HTML -- a real hydration mismatch on this button's label/icon otherwise.
 * useSyncExternalStore (server snapshot false, client snapshot true) is the primitive React
 * itself recommends for "value differs between server and client" -- unlike a
 * useState+useEffect("mounted") flag, it doesn't trigger a synchronous setState-in-effect
 * (flagged by this repo's react-hooks lint rule) and is the more correct tool for this exact case.
 */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Minimal light/dark toggle. Flips between the two explicitly (never "system") once clicked, so
 * the choice sticks -- next-themes persists it to localStorage itself. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const isDark = isClient && resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
      {isClient ? (isDark ? "Dark" : "Light") : "Theme"}
    </Button>
  );
}
