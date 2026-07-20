"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

/** Shared sign-out control -- same signOutAction the header user-menu uses, reused here for the
 * Settings page so there's exactly one place that wires up the pending state around it. */
export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "destructive" | "ghost" }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      disabled={isPending}
      onClick={() => startTransition(async () => { await signOutAction(); })}
    >
      {isPending ? "Signing out…" : "Sign out everywhere"}
    </Button>
  );
}
