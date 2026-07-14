/** Extract the session_id claim from a Supabase access token. Pure; no verification. */
export function decodeJwtSessionId(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}
