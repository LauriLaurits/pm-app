"use client";

import { useState, useTransition } from "react";
import { revokeSessionAction } from "@/app/actions/sessions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SessionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  user_agent: string | null;
  ip: string | null;
};

export function SessionsList({
  sessions,
  currentSessionId,
}: {
  sessions: SessionRow[];
  currentSessionId: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (sessions.length === 0) {
    return <p className="text-muted-foreground">No active sessions.</p>;
  }

  function onRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeSessionAction(id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {sessions.map((session) => {
        const isCurrent = session.id === currentSessionId;
        return (
          <Card key={session.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {session.user_agent ?? "Unknown device"}
                  </span>
                  {isCurrent && <Badge>This device</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  IP {session.ip ?? "unknown"} · started{" "}
                  {new Date(session.created_at).toLocaleString()} · last active{" "}
                  {new Date(session.updated_at).toLocaleString()}
                </p>
              </div>
              {!isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onRevoke(session.id)}
                >
                  Revoke
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
