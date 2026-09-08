"use client";
import TeamLogo from "@/components/team-logo";
import Link from "next/link";
import { useState } from "react";
import { Field } from "@/components/ui";
export default function ResetPassword() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <main className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="auth-inner">
        <TeamLogo />
        <h1>Set a new password</h1>
        {done ? (
          <>
            <p>Your password has been updated.</p>
            <Link href="/">Sign in</Link>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const password = new FormData(e.currentTarget).get("password");
              try {
                const r = await fetch("/api/password", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ password }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                setDone(true);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="New password">
              <input
                type="password"
                name="password"
                minLength={8}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </Field>
            {message && <p role="alert">{message}</p>}
            <button className="primary full" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
