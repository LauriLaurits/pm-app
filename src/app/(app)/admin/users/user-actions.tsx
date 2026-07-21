"use client";

import { useState, useTransition } from "react";
import { adminSignOutUserAction, setUserStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserActions({
  userId,
  status,
}: {
  userId: string;
  status: "active" | "disabled";
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSignOut() {
    setError(null);
    startTransition(async () => {
      const result = await adminSignOutUserAction(userId);
      if ("error" in result) setError(result.error);
    });
  }

  function onToggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await setUserStatusAction({
        userId,
        status: status === "active" ? "disabled" : "active",
      });
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost" disabled={isPending}>
              {isPending ? "Working…" : "Manage"}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onSignOut}>
            Log out from all devices
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleStatus}>
            {status === "active" ? "Disable account" : "Re-enable account"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
