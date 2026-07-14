import { createClient } from "@/lib/supabase/server";
import { decodeJwtSessionId } from "@/lib/auth/jwt";
import { SessionsList } from "./sessions-list";

export default async function SessionsPage() {
  const supabase = await createClient();
  const [{ data: sessions, error }, { data: sessionData }] = await Promise.all([
    supabase.rpc("list_my_sessions"),
    supabase.auth.getSession(),
  ]);

  if (error) {
    return (
      <p className="text-destructive">
        Failed to load sessions: {error.message}
      </p>
    );
  }

  const currentSessionId = sessionData.session
    ? decodeJwtSessionId(sessionData.session.access_token)
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Devices signed in to your account. Sessions expire automatically
          after 24 hours.
        </p>
      </div>
      <SessionsList
        sessions={sessions ?? []}
        currentSessionId={currentSessionId}
      />
    </div>
  );
}
