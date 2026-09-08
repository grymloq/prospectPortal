import type { User } from "@/lib/types";
export function publicUser(user: User): User {
  const safe = { ...user };
  delete safe.password;
  return safe;
}
