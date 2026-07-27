"use server";

import { requirePermission } from "@/lib/auth/require-permission";
import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// The person-avatar picker (src/components/person-avatar-picker.tsx) previously uploaded
// straight from the browser Supabase client. This app sets Supabase session cookies
// httpOnly: true (see src/lib/supabase/server.ts / middleware.ts), so the browser client
// never carries a session -- uploads went out as `anon` and the avatars bucket's
// `to authenticated` insert policy rejected them with a 400 RLS violation. Uploading
// through a server action runs with the authenticated server client instead, which does
// carry the session.
export async function uploadPersonAvatarAction(
  formData: FormData
): Promise<{ error: string } | { url: string }> {
  // Security boundary first (same ordering as every other action). The picker only appears
  // in the manage_people-gated person form.
  await requirePermission("manage_people");

  const file = formData.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { error: "Choose an image file." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Image must be under 2 MB." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type });
  if (uploadError) {
    return { error: "Upload failed. Try again." };
  }

  return { url: supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl };
}
