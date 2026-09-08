"use client";
import { useState } from "react";
import Link from "next/link";
export default function AcceptInvite({ token }: { token: string }) {
  const [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main
      className="panel"
      style={{ maxWidth: 480, margin: "60px auto", padding: 24 }}
    >
      <h1>Join Team Sweden</h1>
      {done ? (
        <p>
          Your account is ready. <Link href="/">Sign in</Link>
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const password = new FormData(e.currentTarget).get("password");
              const r = await fetch("/api/admin/users/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Choose a password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <button disabled={busy}>Accept invitation</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </main>
  );
}
