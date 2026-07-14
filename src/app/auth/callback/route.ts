import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await writeAudit({
        action: "auth.login",
        actorId: data.user.id,
        actorEmail: data.user.email,
        metadata: { provider: "azure" },
      });
      return NextResponse.redirect(`${origin}/dashboard`);
    }
    await writeAudit({
      action: "auth.login_failed",
      metadata: { provider: "azure", reason: error?.message ?? "no user" },
    });
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
