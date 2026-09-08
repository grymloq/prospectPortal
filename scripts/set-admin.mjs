// Run with trusted credentials in the environment; never accept a role from a browser.
import { createClient } from "@supabase/supabase-js";
const email = process.argv[2]?.toLowerCase();
if (!email)
  throw new Error("Usage: node scripts/set-admin.mjs <registered-email>");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
let found;
for (let page = 1; !found; page++) {
  const { data, error } = await client.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) throw error;
  found = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!data.users.length) break;
}
if (!found)
  throw new Error(
    "Register and confirm this account before assigning administrator access.",
  );
const { error } = await client.auth.admin.updateUserById(found.id, {
  app_metadata: { ...found.app_metadata, portal_role: "admin" },
});
if (error) throw error;
console.log(
  "Administrator role assigned. It takes effect on the next workspace request.",
);
