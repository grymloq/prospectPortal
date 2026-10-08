"use client";
import { useState } from "react";
import type { Patch } from "@/lib/types";
import { patchLabel } from "@/lib/patches";
import type { Mutate } from "./workspace";
import { Field } from "./ui";
export default function PatchSettings({
  patches,
  mutate,
}: {
  patches: Patch[];
  mutate: Mutate;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <section>
      <h3>Rules patches</h3>
      <p>
        Import the current New Recruit catalogue snapshot for game logs and
        matchups. Its date is the catalogue update date, not an official GW
        release date.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setNotice("");
          try {
            if (await mutate({ type: "importPatch" }))
              setNotice(
                "Current New Recruit patch is available. Existing imports are kept without duplicates.",
              );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : "Import from New Recruit"}
      </button>
      {notice && <p role="status">{notice}</p>}
      <p>
        Add a named patch and release date. Players select it when logging
        games.
      </p>
      <ul className="patch-list">
        {patches.map((p) => (
          <li key={p.id}>
            {patchLabel(p)}
            {p.source && (
              <small> · New Recruit · {p.source.books.length} catalogues</small>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            f = new FormData(form);
          setBusy(true);
          const ok = await mutate({
            type: "patch",
            name: f.get("name"),
            date: f.get("date"),
          });
          setBusy(false);
          if (ok) form.reset();
        }}
      >
        <div className="form-grid">
          <Field label="Patch name">
            <input
              name="name"
              required
              maxLength={100}
              placeholder="e.g. Balance update"
            />
          </Field>
          <Field label="Patch release date">
            <input name="date" type="date" required />
          </Field>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Adding…" : "Add patch"}
        </button>
      </form>
    </section>
  );
}
