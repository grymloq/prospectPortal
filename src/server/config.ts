import "server-only";

export function localMode() {
  if (process.env.VERCEL) return false;
  return (
    process.env.TEAM_LOCAL_DEMO === "true" ||
    !!process.env.TEAM_DB_PATH ||
    (process.env.NODE_ENV === "development" &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

export function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
