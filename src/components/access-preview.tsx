"use client";
import { useState } from "react";
import type { View } from "@/lib/types";
import { Field, Modal } from "./ui";
import styles from "./access-preview.module.css";

export default function AccessPreview({
  view,
  onView,
}: {
  view: View;
  onView: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(view.me.id);
  const [role, setRole] = useState("actual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = view.accessPreview;
  if (!preview) return null;
  async function change(exit: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/view-as", {
        method: exit ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(exit ? {} : { body: JSON.stringify({ userId, role }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen(false);
      onView(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={`${styles.bar} ${preview.active ? styles.active : ""}`}>
        <span>
          {preview.active ? (
            <>
              Viewing as <strong>{view.me.name}</strong> ·{" "}
              {view.me.role === "admin" ? "Admin" : "Member"} · Read-only
            </>
          ) : (
            "Access preview"
          )}
        </span>
        <div className={styles.actions}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setUserId(view.me.id);
              setError("");
              setOpen(true);
            }}
          >
            View as…
          </button>
          {preview.active && (
            <button type="button" disabled={busy} onClick={() => change(true)}>
              Exit preview
            </button>
          )}
        </div>
        {error && !open && <p role="alert">{error}</p>}
      </div>
      {open && (
        <Modal
          title="Preview access"
          busy={busy}
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void change(false);
            }}
          >
            <Field label="User">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                {preview.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.role === "admin" ? "Admin" : "Member"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Access level">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="actual">Actual access</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <p>
              Preview only. Changes are disabled; team roles follow the selected
              user.
            </p>
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={busy}>
              Start preview
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
