"use client";
import { useState } from "react";
import type { Patch } from "@/lib/types";
import { patchLabel } from "@/lib/patches";
import type { Mutate } from "./workspace";
import { Field } from "./ui";
import styles from "./patch-settings.module.css";

export default function PatchSettings({
  patches,
  defaultPatchId,
  mutate,
}: {
  patches: Patch[];
  defaultPatchId?: string;
  mutate: Mutate;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("newrecruit");
  const [removing, setRemoving] = useState<string | null>(null);
  async function save(command: object, message: string) {
    setBusy(true);
    setNotice("");
    try {
      const ok = await mutate(command);
      if (ok) setNotice(message);
      return ok;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.settings}>
      <h3>Rules patches</h3>
      <div className={styles.import}>
        <Field label="Import source">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={busy}
          >
            <option value="newrecruit">New Recruit</option>
            <option value="warmind">Warmind</option>
          </select>
        </Field>
        <button
          disabled={busy}
          onClick={() =>
            void save(
              { type: "importPatch", provider },
              "Rules import is available. Duplicate imports are skipped.",
            )
          }
        >
          {busy ? "Working…" : "Import ruleset"}
        </button>
      </div>
      <p className={styles.help}>
        {provider === "warmind"
          ? "Imports Warmind’s published MFM version and date."
          : "Imports New Recruit’s current catalogue revisions and update date."}{" "}
        Imports record ruleset versions; they do not download unit rules.
      </p>
      {notice && <p role="status">{notice}</p>}
      <Field label="Default ruleset for new games">
        <select
          value={defaultPatchId || ""}
          disabled={busy}
          onChange={(e) =>
            void save(
              { type: "defaultPatch", patchId: e.target.value },
              "Team default saved.",
            )
          }
        >
          <option value="" disabled>
            Choose a ruleset
          </option>
          {patches
            .filter((p) => !p.removedAt)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {patchLabel(p)}
              </option>
            ))}
        </select>
      </Field>
      <p className={styles.help}>
        Preselected for everyone when logging a new game. Existing games keep
        their ruleset.
      </p>
      <ul className={styles.list}>
        {patches.map((p) => (
          <li key={p.id} className={styles.item}>
            <div className={styles.summary}>
              <strong>{p.name}</strong>
              <small>
                {p.date}
                {p.source &&
                  ` · ${p.source.provider === "warmind" ? "Warmind · MFM" : `New Recruit · ${p.source.books.length} catalogues`}`}
                {p.id === defaultPatchId && " · Team default"}
                {p.removedAt && " · Removed"}
              </small>
            </div>
            {editing === p.id ? (
              <form
                className={styles.editor}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await save(
                      { type: "renamePatch", patchId: p.id, name },
                      "Patch name saved.",
                    )
                  )
                    setEditing(null);
                }}
              >
                <Field label="Patch name">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={100}
                    autoFocus
                    disabled={busy}
                  />
                </Field>
                <div className={styles.actions}>
                  <button className="primary" disabled={busy || !name.trim()}>
                    Save name
                  </button>
                  <button
                    className={styles.link}
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.actions}>
                <button
                  className={styles.link}
                  type="button"
                  disabled={busy}
                  aria-label={`Rename ${p.name}`}
                  onClick={() => {
                    setEditing(p.id);
                    setName(p.name);
                    setNotice("");
                    setRemoving(null);
                  }}
                >
                  Rename
                </button>
                {p.source &&
                  (p.removedAt ? (
                    <button
                      className={styles.link}
                      disabled={busy}
                      onClick={() =>
                        void save(
                          { type: "restorePatchImport", patchId: p.id },
                          "Import restored.",
                        )
                      }
                    >
                      Restore import
                    </button>
                  ) : (
                    <button
                      className={styles.link}
                      disabled={busy || p.id === defaultPatchId}
                      title={
                        p.id === defaultPatchId
                          ? "Select another default before removing this import"
                          : undefined
                      }
                      onClick={() => setRemoving(p.id)}
                    >
                      Remove import
                    </button>
                  ))}
              </div>
            )}
            {removing === p.id && (
              <div className={styles.editor}>
                <p>
                  Remove this import from new-game choices? Historical games and
                  matchups will keep it. You can restore it here.
                </p>
                <div className={styles.actions}>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await save(
                          { type: "removePatchImport", patchId: p.id },
                          "Import removed from new-game choices.",
                        )
                      )
                        setRemoving(null);
                    }}
                  >
                    Remove import
                  </button>
                  <button
                    className={styles.link}
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <h4>Add a patch manually</h4>
      <form
        className={styles.editor}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          if (
            await save(
              { type: "patch", name: data.get("name"), date: data.get("date") },
              "Patch added.",
            )
          )
            form.reset();
        }}
      >
        <div className="form-grid">
          <Field label="Patch name">
            <input
              name="name"
              required
              maxLength={100}
              disabled={busy}
              placeholder="e.g. Balance update"
            />
          </Field>
          <Field label="Patch release date">
            <input name="date" type="date" required disabled={busy} />
          </Field>
        </div>
        <button className="primary" disabled={busy}>
          Add patch
        </button>
      </form>
    </section>
  );
}
