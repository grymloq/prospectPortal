"use client";
import { useState } from "react";
import type { View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { patchLabel } from "@/lib/patches";
import { ArmyFields, blank, type Choice } from "./journal";
import { Disposition } from "./disposition";
import { Field, Modal, Empty } from "./ui";
import type { Mutate } from "./workspace";
export default function MyArmies({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [patchId, setPatchId] = useState(view.defaultPatchId || "");
  const [army, setArmy] = useState<Choice>(blank(view.me.faction));
  const [saving, setSaving] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  async function importList() {
    setImporting(true);
    setImportError("");
    try {
      const response = await fetch("/api/army-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl, patchId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setArmy(data.army);
    } catch (error) {
      setImportError((error as Error).message);
    } finally {
      setImporting(false);
    }
  }
  const lists = (view.savedArmies || []).filter((a) => a.userId === view.me.id);
  const rules =
    view.patches.find((p) => p.id === patchId)?.catalogue || catalogue;
  function open(id: string) {
    const saved = lists.find((a) => a.id === id);
    setPatchId(saved?.patchId || view.defaultPatchId || "");
    setArmy(
      saved?.army || blank(view.me.preferredFactions?.[0] || view.me.faction),
    );
    setEditing(id);
    setImportUrl("");
    setImportError("");
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>My armies</h1>
          <p>Save army lists for a ruleset and reuse them in game logs.</p>
        </div>
        <button className="primary" onClick={() => open("new")}>
          Add army list
        </button>
      </header>
      <section className="panel padded">
        {!lists.length && (
          <Empty
            title="No saved armies"
            description="Add an army list to use when logging games."
          />
        )}
        {lists.map((a) => (
          <article className="saved-army-card" key={a.id}>
            <div>
              <h3>{a.army.listName}</h3>
              <p>
                {a.army.factionName} · {a.army.detachmentNames.join(" + ")}
              </p>
              <p>
                <Disposition name={a.army.dispositionName} /> ·{" "}
                {view.patches.find((p) => p.id === a.patchId)
                  ? patchLabel(view.patches.find((p) => p.id === a.patchId)!)
                  : "Unknown ruleset"}
              </p>
              {a.army.listUrl && (
                <a href={a.army.listUrl} target="_blank" rel="noreferrer">
                  Open army list
                </a>
              )}
            </div>
            <div className="saved-army-actions">
              <button onClick={() => open(a.id)}>Edit</button>
              <button
                aria-pressed={a.shared}
                onClick={() =>
                  void mutate({
                    type: "shareArmy",
                    id: a.id,
                    shared: !a.shared,
                  })
                }
              >
                {a.shared ? "Make private" : "Make available for others"}
              </button>
              <button
                onClick={() => void mutate({ type: "deleteArmy", id: a.id })}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </section>
      {editing && (
        <Modal
          title={editing === "new" ? "Add army list" : "Edit army list"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              const ok = await mutate({
                type: "saveArmy",
                id: editing === "new" ? undefined : editing,
                patchId,
                army,
              });
              setSaving(false);
              if (ok) setEditing(null);
            }}
          >
            <Field label="Ruleset">
              <select
                required
                disabled={importing}
                value={patchId}
                onChange={(e) => {
                  setPatchId(e.target.value);
                  setArmy({ ...blank(army.faction), listName: army.listName });
                }}
              >
                <option value="" disabled>
                  Choose a ruleset
                </option>
                {view.patches
                  .filter((p) => !p.removedAt)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {patchLabel(p)}
                    </option>
                  ))}
              </select>
            </Field>
            <div className="panel padded">
              <Field label="Import from New Recruit">
                <input
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://www.newrecruit.eu/app/list/…"
                />
              </Field>
              <button
                type="button"
                disabled={importing || saving || !importUrl || !patchId}
                onClick={() => void importList()}
              >
                {importing ? "Importing…" : "Import army list"}
              </button>
              {importError && <p role="alert">{importError}</p>}
            </div>
            <Field label="Army-list name">
              <input
                required
                maxLength={100}
                value={army.listName || ""}
                onChange={(e) => setArmy({ ...army, listName: e.target.value })}
              />
            </Field>
            <ArmyFields
              title="Army configuration"
              value={army}
              onChange={(c) =>
                setArmy({ ...c, listName: c.listName ?? army.listName })
              }
              rules={rules}
              maxDP={3}
              preferredFactions={view.me.preferredFactions ?? [view.me.faction]}
              hideListName
            />
            <button className="primary" disabled={saving || importing}>
              {saving ? "Saving…" : "Save army list"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
