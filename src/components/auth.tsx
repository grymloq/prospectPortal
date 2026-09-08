"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Field } from "./ui";
export default function Auth({
  onLogin,
  localDemo = false,
}: {
  onLogin: () => Promise<void>;
  localDemo?: boolean;
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function login(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.message) {
        setNotice(d.message);
        return;
      }
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth">
      <section className="auth-story">
        <div className="flag" />
        <h2>
          TEAM SWEDEN<span>40K NATIONAL TEAM</span>
        </h2>
        <div>
          <h1>
            Great players.
            <br />
            One team.
          </h1>
          <p>
            A shared space to improve your game,
            <br />
            show your progress, and earn your place.
          </p>
        </div>
        <small>Eight players. A collective ambition.</small>
      </section>
      <section className="auth-form">
        <div className="auth-inner">
          <ShieldCheck size={30} />
          <h1>{register ? "Join the journey." : "Welcome back."}</h1>
          <p>
            {register
              ? "Create an account and apply to represent Sweden."
              : "Sign in to your team workspace."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void login({
                email: f.get("email"),
                password: f.get("password"),
                ...(register ? { register: true, name: f.get("name") } : {}),
              });
            }}
          >
            {register && (
              <Field label="Full name">
                <input name="name" required autoComplete="name" />
              </Field>
            )}
            <Field label="Email address">
              <input type="email" name="email" required autoComplete="email" />
            </Field>
            <Field label="Password">
              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete={register ? "new-password" : "current-password"}
              />
            </Field>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {!localDemo && !register && (
            <p>
              <a href="/forgot-password">Forgot your password?</a>
            </p>
          )}
          {localDemo && (
            <div className="demo-box">
              <strong>Explore the local demo</strong>
              <p>
                Fictional players and practice games. Changes are saved on this
                computer.
              </p>
              <div className="row">
                <button
                  disabled={busy}
                  onClick={() =>
                    login({
                      email: "admin@teamsweden.local",
                      password: "Sweden40k!",
                    })
                  }
                >
                  Try admin view
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    login({
                      email: "player@teamsweden.local",
                      password: "Sweden40k!",
                    })
                  }
                >
                  Try player view
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
