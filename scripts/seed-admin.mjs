import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error("Missing env. Run via: npm run seed:admin (reads .env.local)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Seed Admin" },
});
if (error) {
  console.error("createUser failed:", error.message);
  process.exit(1);
}

const { error: profileError } = await admin
  .from("user_profiles")
  .update({
    status: "active",
    role: "admin",
    approved_at: new Date().toISOString(),
  })
  .eq("id", data.user.id);
if (profileError) {
  console.error("profile activation failed:", profileError.message);
  process.exit(1);
}

console.log(`Seeded active admin: ${email} (${data.user.id})`);
