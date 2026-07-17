"use client";

import { type ReactElement, type ReactNode, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Every destructive mutation in the app returns one of these shapes (or, for the one action
 * that redirects on success instead of returning -- deleteProjectAction -- nothing at all). */
type MutationResult = { error: string } | { success: true; id?: string | number } | void;

/**
 * Shared confirm dialog for every destructive action in the app -- replaces the raw
 * `window.confirm()` that used to gate every delete/remove button with the app's own styled
 * AlertDialog (base-nova). `trigger` is passed to the `render` prop bare (no children), matching
 * every other Trigger usage in this codebase (Dialog, etc.) -- the visible label goes on
 * `triggerLabel` instead, which becomes the trigger's actual children.
 */
export function ConfirmDialog({
  trigger,
  triggerLabel,
  title,
  description,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  onConfirm,
}: {
  trigger: ReactElement;
  triggerLabel: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  onConfirm: () => Promise<MutationResult>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger render={trigger}>{triggerLabel}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={isPending}>
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
