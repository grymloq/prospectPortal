"use client";
import { useState } from "react";
import type { Patch } from "@/lib/types";
import { Trash2 } from "lucide-react";
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
          ? "Imports Warmind’s current detachments, dispositions, and MFM version."
          : "Imports New Recruit’s current detachments, dispositions, and catalogue revisions."}{" "}
        Both sources update the army choices for that ruleset.
      </p>
      {notice && <p role="status">{notice}</p>}
      <p className={styles.help}>
        The team default is preselected for everyone’s new games.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Rules patches">
          <tbody>
            {patches
              .filter((p) => !p.removedAt)
              .map((p) => (
                <tr key={p.id}>
                  <td className={styles.patchName}>
                    <span className={styles.date}>{p.date}</span> - {p.name}
                  </td>
                  <td>
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
                          <button
                            className="primary"
                            disabled={busy || !name.trim()}
                          >
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
                        {p.id === defaultPatchId ? (
                          <span className={styles.default}>Default</span>
                        ) : (
                          <button
                            className={styles.link}
                            disabled={busy}
                            onClick={() =>
                              void save(
                                { type: "defaultPatch", patchId: p.id },
                                "Team default saved.",
                              )
                            }
                          >
                            Make default
                          </button>
                        )}
                        <button
                          className={styles.remove}
                          disabled={busy || p.id === defaultPatchId}
                          title={
                            p.id === defaultPatchId
                              ? "Choose another default before removing this patch"
                              : "Remove patch"
                          }
                          aria-label={`Remove ${p.name}`}
                          onClick={() => {
                            setRemoving(p.id);
                            setEditing(null);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                    {removing === p.id && (
                      <div className={styles.editor}>
                        <p>
                          Remove this patch from new-game choices? Historical
                          games and matchups will keep it.
                        </p>
                        <div className={styles.actions}>
                          <button
                            disabled={busy}
                            onClick={async () => {
                              if (
                                await save(
                                  { type: "removePatchImport", patchId: p.id },
                                  "Patch removed from new-game choices.",
                                )
                              )
                                setRemoving(null);
                            }}
                          >
                            Remove patch
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
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
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
