"use client";
import { useState } from "react";
import { ChevronDown, Globe, Lock, Pencil, Star, Trash2 } from "lucide-react";
import styles from "./my-armies.module.css";
import type { View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { patchLabel } from "@/lib/patches";
import { ArmyFields, blank, type Choice } from "./journal";
import { Disposition } from "./disposition";
import { ArmyListLink } from "./army-list-drawer";
import { PageHeading, Field, Modal, Empty } from "./ui";
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
  const groups = Array.from(new Set(lists.map((a) => a.patchId)))
    .map((id) => {
      const patch = view.patches.find((p) => p.id === id);
      const armies = lists.filter((a) => a.patchId === id);
      const factions = Array.from(new Set(armies.map((a) => a.army.faction)))
        .map((faction) => {
          const entries = armies
            .filter((a) => a.army.faction === faction)
            .sort((a, b) =>
              (a.army.listName || a.army.factionName).localeCompare(
                b.army.listName || b.army.factionName,
              ),
            );
          return { id: faction, name: entries[0].army.factionName, entries };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return { id, patch, factions, count: armies.length };
    })
    .sort(
      (a, b) =>
        (b.patch?.date || "").localeCompare(a.patch?.date || "") ||
        (a.patch?.name || a.id).localeCompare(b.patch?.name || b.id),
    );
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
      <PageHeading
        title="My armies"
        description="Save army lists for a ruleset and reuse them in game logs."
      >
        <button className="primary" onClick={() => open("new")}>
          Add army list
        </button>
      </PageHeading>
      <div className={styles.library}>
        {!lists.length && (
          <section className="panel padded">
            <Empty
              title="No saved armies"
              description="Add an army list to use when logging games."
            />
          </section>
        )}
        {groups.map((group) => (
          <details className={`panel ${styles.patch}`} key={group.id} open>
            <summary className={styles.patchHeading}>
              <ChevronDown
                size={18}
                className={styles.chevron}
                aria-hidden="true"
              />
              <h2>{group.patch?.name || "Unknown ruleset"}</h2>
              {group.patch && (
                <span className={styles.date}>{group.patch.date}</span>
              )}
              {group.patch?.removedAt && (
                <span className={styles.tag}>Archived</span>
              )}
              {group.id === view.defaultPatchId && (
                <span className={styles.tag}>Current</span>
              )}
              <span className={styles.total}>
                {group.count} {group.count === 1 ? "army" : "armies"}
              </span>
            </summary>
            {group.factions.map((faction) => (
              <section
                className={styles.faction}
                key={faction.id}
                aria-label={faction.name}
              >
                <h3 className={styles.factionHeading}>
                  {faction.name}
                  <span>{faction.entries.length}</span>
                </h3>
                {faction.entries.map((a) => {
                  const name = a.army.listName || a.army.factionName;
                  const isDefault = view.me.defaultArmyId === a.id;
                  return (
                    <article
                      className={styles.army}
                      key={a.id}
                      aria-label={name}
                    >
                      <div className={styles.info}>
                        <div className={styles.nameRow}>
                          <h4>
                            {a.army.listUrl ? (
                              <ArmyListLink
                                url={a.army.listUrl}
                                name={name}
                                className={styles.listLink}
                                title={`Open ${name}`}
                              >
                                {name}
                              </ArmyListLink>
                            ) : (
                              name
                            )}
                          </h4>
                          {isDefault && (
                            <span className={styles.defaultTag}>Default</span>
                          )}
                          <Disposition name={a.army.dispositionName} />
                        </div>
                        <p className={styles.detachments}>
                          {a.army.detachmentNames.join(" + ") ||
                            "No detachment"}
                        </p>
                      </div>
                      <div className={styles.actions}>
                        <button
                          className={styles.action}
                          aria-label={`${isDefault ? "Clear default" : "Make default"}: ${name}`}
                          title={
                            isDefault
                              ? "Clear default army"
                              : "Make default army"
                          }
                          aria-pressed={isDefault}
                          disabled={!!group.patch?.removedAt}
                          onClick={() =>
                            void mutate({
                              type: "defaultArmy",
                              id: isDefault ? "" : a.id,
                            })
                          }
                        >
                          <Star
                            size={17}
                            fill={isDefault ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          className={styles.action}
                          aria-label={`${a.shared ? "Make private" : "Share with others"}: ${name}`}
                          title={
                            a.shared
                              ? "Shared with others · Make private"
                              : "Private · Share with others"
                          }
                          aria-pressed={a.shared}
                          onClick={() =>
                            void mutate({
                              type: "shareArmy",
                              id: a.id,
                              shared: !a.shared,
                            })
                          }
                        >
                          {a.shared ? <Globe size={17} /> : <Lock size={17} />}
                        </button>
                        <button
                          className={styles.action}
                          aria-label={`Edit: ${name}`}
                          title="Edit army"
                          onClick={() => open(a.id)}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className={`${styles.action} ${styles.remove}`}
                          aria-label={`Remove: ${name}`}
                          title="Remove army"
                          onClick={() =>
                            void mutate({ type: "deleteArmy", id: a.id })
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ))}
          </details>
        ))}
      </div>
      {editing && (
        <Modal
          title={editing === "new" ? "Add army list" : "Edit army list"}
          onClose={() => setEditing(null)}
          draftKey={`army:${editing}`}
          busy={saving || importing}
          draft={{
            value: { patchId, army, importUrl },
            restore: (saved) => {
              setPatchId(saved.patchId);
              setArmy(saved.army);
              setImportUrl(saved.importUrl);
            },
          }}
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
