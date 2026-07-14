"use client";

import { useTransition } from "react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline" disabled={isPending}>
            {isPending ? "Working…" : "Manage"}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              await adminSignOutUserAction(userId);
            })
          }
        >
          Log out from all devices
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              await setUserStatusAction({
                userId,
                status: status === "active" ? "disabled" : "active",
              });
            })
          }
        >
          {status === "active" ? "Disable account" : "Re-enable account"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
