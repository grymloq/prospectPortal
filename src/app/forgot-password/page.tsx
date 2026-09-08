"use client";
import TeamLogo from "@/components/team-logo";
import Link from "next/link";
import { useState } from "react";
import { Field } from "@/components/ui";
export default function ForgotPassword() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="auth-inner">
        <TeamLogo />
        <h1>Reset your password</h1>
        <p>We’ll send a link to your account email.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const email = new FormData(e.currentTarget).get("email");
            try {
              const r = await fetch("/api/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              });
              const d = await r.json();
              setMessage(d.message || d.error);
            } catch {
              setMessage("Could not connect. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Email address">
            <input type="email" name="email" required autoComplete="email" />
          </Field>
          {message && <p role="status">{message}</p>}
          <button className="primary full" disabled={busy}>
            {busy ? "Requesting…" : "Send reset link"}
          </button>
        </form>
        <p>
          <Link href="/">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
