"use client";
import { useEffect, useState } from "react";
import type { User, View } from "@/lib/types";
import type { Mutate } from "./workspace";
import { Field, Modal } from "./ui";
export default function UserManagement({
  view,
  mutate,
  onView,
}: {
  view: View;
  mutate: Mutate;
  onView: (v: View) => void;
}) {
  const [search, setSearch] = useState(""),
    [showRemoved, setShowRemoved] = useState(false),
    [invite, setInvite] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [link, setLink] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      user: User;
      action: "remove" | "admin" | "member";
    } | null>(null),
    [directory, setDirectory] = useState<View | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/users", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setDirectory(d.view);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  // The directory load includes registered accounts which have never entered the workspace.
  const shown = directory || view;
  const users = shown.users.filter(
    (u) =>
      Boolean(u.removedAt) === showRemoved &&
      `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  function openInvite(user?: User) {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setLink("");
    setMessage("");
    setError("");
    setInvite(true);
  }
  return (
    <div>
      <header className="page-heading">
        <div>
          <h1>Users</h1>
          <p>Manage team access, invitations and administrator roles.</p>
        </div>
        <button className="primary" onClick={() => openInvite()}>
          Invite user
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="user-toolbar">
        <Field label="Search users">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
          />{" "}
          Show removed users
        </label>
      </div>
      <section className="panel user-table-scroll">
        <table className="user-table">
          <thead>
            <tr>
              <th>Name / email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Selection phase</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </td>
                <td>{u.role === "admin" ? "Administrator" : "Member"}</td>
                <td>
                  {u.removedAt
                    ? "Removed"
                    : u.invitedAt && !u.acceptedAt
                      ? "Invited"
                      : "Active"}
                  {u.removedAt && (
                    <small>{new Date(u.removedAt).toLocaleString()}</small>
                  )}
                </td>
                <td>
                  {u.rejected
                    ? "Not selected"
                    : shown.phases.find((p) => p.id === u.phaseId)?.name ||
                      "Not applying"}
                </td>
                <td>
                  {!u.removedAt && (
                    <div className="user-actions">
                      {u.invitedAt && !u.acceptedAt && (
                        <button onClick={() => openInvite(u)}>
                          New invite link
                        </button>
                      )}
                      <button
                        disabled={u.id === view.me.id}
                        onClick={() =>
                          setPending({
                            user: u,
                            action: u.role === "admin" ? "member" : "admin",
                          })
                        }
                      >
                        {u.role === "admin"
                          ? "Make member"
                          : "Promote to admin"}
                      </button>
                      <button
                        disabled={u.id === view.me.id}
                        onClick={() =>
                          setPending({ user: u, action: "remove" })
                        }
                      >
                        Remove access
                      </button>
                      {u.id === view.me.id && <small>Your account</small>}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!users.length && (
          <p style={{ padding: 20 }}>No users match this view.</p>
        )}
      </section>
      <p className="matrix-method">
        Administrator roles grant access to all player journals, evaluations and
        internal discussions. Team selection is managed separately.
      </p>
      <details className="matrix-method">
        <summary>User-management history</summary>
        {shown.audit
          .filter((a) =>
            /changed .* to (admin|member)|removed portal access|invitation link/.test(
              a.text,
            ),
          )
          .map((a) => (
            <p key={a.id}>
              {a.text} · {new Date(a.createdAt).toLocaleString()}
            </p>
          ))}
      </details>
      {pending && (
        <Modal
          title={
            pending.action === "remove"
              ? "Remove user access"
              : "Change user role"
          }
          onClose={() => setPending(null)}
        >
          <p>
            {pending.action === "remove"
              ? `Remove ${pending.user.name}’s access to the portal? Their journal and team history will remain. Their selection place and event reservations will be released.`
              : `${pending.action === "admin" ? "Give" : "Remove"} administrator access ${pending.action === "admin" ? "to" : "from"} ${pending.user.name}?`}
          </p>
          <button
            disabled={busy}
            className="primary"
            onClick={async () => {
              setBusy(true);
              const ok = await mutate(
                pending.action === "remove"
                  ? { type: "removeUser", userId: pending.user.id }
                  : {
                      type: "userRole",
                      userId: pending.user.id,
                      role: pending.action,
                    },
              );
              setBusy(false);
              if (ok) {
                setDirectory(null);
                setPending(null);
              }
            }}
          >
            Confirm {pending.action === "remove" ? "removal" : "role change"}
          </button>
        </Modal>
      )}
      {invite && (
        <Modal title="Invite team member" onClose={() => setInvite(false)}>
          {link ? (
            <div>
              <p>{message}</p>
              <Field label="One-time invitation link">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setMessage(
                      "Invitation copied. Share it directly with the invited person.",
                    );
                  } catch {
                    setMessage("Select and copy the invitation link above.");
                  }
                }}
              >
                Copy invitation link
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const r = await fetch("/api/admin/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, email }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error);
                  setDirectory(null);
                  onView(d.view);
                  setLink(d.inviteUrl);
                  setMessage(d.message);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Full name">
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Email address">
                <input
                  type="email"
                  required
                  maxLength={150}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <p>
                Create a one-time link to share with this person. No email will
                be sent.
              </p>
              <button className="primary" disabled={busy}>
                Create invitation link
              </button>
              {error && <p role="alert">{error}</p>}
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
