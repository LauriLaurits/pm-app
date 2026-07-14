"use client";

import { useState, useTransition } from "react";
import { signInWithAzureAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AzureButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await signInWithAzureAction();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
        disabled={isPending}
      >
        {isPending ? "Redirecting…" : "Sign in with Microsoft"}
      </Button>
    </div>
  );
}
