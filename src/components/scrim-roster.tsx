"use client";
import { FactionName } from "./faction-avatar";
import { isScrimCaptain } from "@/lib/scrims";
import { useState } from "react";
import type { Scrim, ScrimEntry, ScrimTeam, View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { onScrimTeam, rosterWarnings } from "@/lib/scrims";
import { ArmyFields, type Choice } from "./journal";
import { ArmyListLink } from "./army-list-drawer";
import { Disposition } from "./disposition";
import { Badge, Field, Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";
import { useScrimClock } from "./use-scrim-clock";
import ScrimStaff from "./scrim-staff";

export default function ScrimRoster({
  view,
  scrim,
  team,
  mutate,
  readOnly = false,
}: {
  view: View;
  scrim: Scrim;
  team: ScrimTeam;
  mutate: Mutate;
  readOnly?: boolean;
}) {
  const rules =
    view.patches.find((p) => p.id === scrim.patchId)?.catalogue || catalogue;
  const manage =
    !readOnly &&
    (view.me.role === "admin" ||
      isScrimCaptain(team, view.me.id) ||
      (team.external && isScrimCaptain(scrim.teams[0], view.me.id)));
  const now = useScrimClock();
  const locked =
    !!scrim.cancelled ||
    !!scrim.pairedAt ||
    now >= Date.parse(scrim.submissionDeadline);
  const canSeeLists = locked || manage || onScrimTeam(team, view.me.id);
  const [roster, setRoster] = useState(false);
  const [staff, setStaff] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [entry, setEntry] = useState<ScrimEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const warnings = rosterWarnings(scrim, team, rules.dispositions);
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2>{team.name}</h2>
          {manage && !scrim.cancelled && (
            <button
              type="button"
              className={styles.renameLink}
              onClick={() => {
                setRenameError("");
                setRenaming(true);
              }}
              aria-label={`Rename ${team.name}`}
            >
              Rename team
            </button>
          )}
          <p className={styles.muted}>
            {team.external
              ? "External roster · managed by our captain"
              : `Captain: ${team.captainName}${team.entries.some((e) => e.userId === team.captainId) ? " · playing" : " · non-playing"}`}
          </p>
          {team.additionalCaptains?.length ? (
            <p className={styles.muted}>
              Additional captains:{" "}
              {team.additionalCaptains.map((p) => p.name).join(", ")}
            </p>
          ) : null}
          {team.coaches?.length ? (
            <p className={styles.muted}>
              Non-playing coaches: {team.coaches.map((p) => p.name).join(", ")}
            </p>
          ) : null}
          {!readOnly &&
            view.me.role === "admin" &&
            !team.external &&
            !scrim.cancelled &&
            !scrim.completedAt && (
              <button type="button" onClick={() => setStaff(true)}>
                Manage captains and coaches
              </button>
            )}
        </div>
        <Badge tone={team.finalizedAt ? "green" : "amber"}>
          {team.finalizedAt ? "Submitted" : "Draft"} · {team.entries.length}/
          {scrim.teamSize}
        </Badge>
      </div>
      {staff && (
        <ScrimStaff
          view={view}
          scrim={scrim}
          team={team}
          mutate={mutate}
          onClose={() => setStaff(false)}
        />
      )}
      {canSeeLists && !team.finalizedAt && warnings.length > 0 && (
        <div className={styles.warning}>
          <strong>Before final submission</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {!canSeeLists && (
        <p className={styles.muted}>
          Opponent lists are revealed at the submission deadline.
        </p>
      )}
      {team.entries.map((player) => (
        <div className={styles.player} key={player.id}>
          <div className={styles.playerDetails}>
            <strong>
              {player.name}
              {player.army && (
                <>
                  {" - "}
                  <FactionName name={player.army.factionName} />
                  {" - "}
                  <Disposition name={player.army.dispositionName} />
                </>
              )}
            </strong>
            {player.army ? (
              player.army.listUrl ||
              player.army.listText ||
              player.army.summary ? (
                <div>
                  <ArmyListLink
                    url={player.army.listUrl}
                    text={player.army.listText}
                    summary={player.army.summary}
                    name={`${player.name}'s army list`}
                  >
                    View list
                  </ArmyListLink>
                </div>
              ) : (
                <small>List not provided</small>
              )
            ) : canSeeLists ? (
              <small>List not submitted</small>
            ) : null}
          </div>
          {!readOnly &&
            !locked &&
            !team.finalizedAt &&
            (manage || player.userId === view.me.id) && (
              <button onClick={() => setEntry(player)}>
                {player.army ? "Change list" : "Submit list"}
              </button>
            )}
        </div>
      ))}
      {!team.entries.length && (
        <p className={styles.muted}>
          The captain can assign players to this team.
        </p>
      )}
      {manage && !locked && (
        <div className={styles.actions}>
          {!team.finalizedAt && (
            <button onClick={() => setRoster(true)}>Assign players</button>
          )}
          <button
            className={team.finalizedAt ? "" : "primary"}
            disabled={busy || (!team.finalizedAt && warnings.length > 0)}
            onClick={async () => {
              setBusy(true);
              await mutate({
                type: "scrimFinalize",
                scrimId: scrim.id,
                revision: scrim.revision,
                teamId: team.id,
                finalized: !team.finalizedAt,
              });
              setBusy(false);
            }}
          >
            {team.finalizedAt
              ? "Reopen submission"
              : "Finalize team submission"}
          </button>
        </div>
      )}
      {renaming && (
        <Modal
          title="Rename team"
          onClose={() => setRenaming(false)}
          draftKey={`scrim:${scrim.id}:name:${team.id}`}
          busy={busy}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("name");
              setBusy(true);
              const ok = await mutate(
                {
                  type: "scrimTeamName",
                  scrimId: scrim.id,
                  revision: scrim.revision,
                  teamId: team.id,
                  name,
                },
                setRenameError,
              );
              setBusy(false);
              if (ok) setRenaming(false);
            }}
          >
            <Field label="Team name">
              <input
                name="name"
                defaultValue={team.name}
                required
                maxLength={150}
              />
            </Field>
            {renameError && <p role="alert">{renameError}</p>}
            <button className="primary" disabled={busy}>
              Save team name
            </button>
          </form>
        </Modal>
      )}
      {roster && (
        <RosterEditor
          key={team.id}
          view={view}
          scrim={scrim}
          team={team}
          mutate={mutate}
          onClose={() => setRoster(false)}
        />
      )}
      {entry && (
        <ListEditor
          key={entry.id}
          view={view}
          scrim={scrim}
          team={team}
          entry={entry}
          mutate={mutate}
          onClose={() => setEntry(null)}
        />
      )}
    </section>
  );
}

function RosterEditor({
  view,
  scrim,
  team,
  mutate,
  onClose,
}: {
  view: View;
  scrim: Scrim;
  team: ScrimTeam;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [revision] = useState(scrim.revision);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(team.entries.map((e) => e.userId!));
  const [external, setExternal] = useState(
    Array.from({ length: scrim.teamSize }, (_, i) => ({
      id: team.entries[i]?.id,
      name: team.entries[i]?.name || "",
    })),
  );
  const [busy, setBusy] = useState(false);
  const other = scrim.teams.find((t) => t.id !== team.id)!;
  const players = [
    { id: view.me.id, name: view.me.name },
    ...view.playerOptions,
  ].filter(
    (p) =>
      !onScrimTeam(other, p.id) &&
      !team.coaches?.some((coach) => coach.userId === p.id),
  );
  return (
    <Modal
      title={`Assign players · ${team.name}`}
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:roster:${team.id}`}
      busy={busy}
      draft={{
        value: { selected, external },
        restore: (saved) => {
          setSelected(saved.selected);
          setExternal(saved.external);
        },
      }}
    >
      <p>
        {team.external
          ? "Enter the opposing players. They do not need portal accounts."
          : `Choose up to ${scrim.teamSize} players. The captain only uses a slot if selected here.`}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await mutate(
            {
              type: "scrimRoster",
              scrimId: scrim.id,
              revision,
              teamId: team.id,
              entries: team.external
                ? external.filter((p) => p.name.trim())
                : selected.map((userId) => ({ userId })),
            },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        {team.external ? (
          external.map((p, i) => (
            <Field key={i} label={`Player ${i + 1}`}>
              <input
                maxLength={100}
                value={p.name}
                onChange={(e) =>
                  setExternal(
                    external.map((v, j) =>
                      i === j ? { ...v, name: e.target.value } : v,
                    ),
                  )
                }
              />
            </Field>
          ))
        ) : (
          <div className={styles.choices}>
            {players.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  disabled={
                    !selected.includes(p.id) &&
                    selected.length >= scrim.teamSize
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, p.id]
                        : selected.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
                {p.id === team.captainId ? " (captain)" : ""}
              </label>
            ))}
          </div>
        )}
        <button className="primary" disabled={busy}>
          Save roster
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

function ListEditor({
  view,
  scrim,
  team,
  entry,
  mutate,
  onClose,
}: {
  view: View;
  scrim: Scrim;
  team: ScrimTeam;
  entry: ScrimEntry;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [revision] = useState(scrim.revision);
  const [method, setMethod] = useState<"saved" | "import" | "own" | "">("");
  const [listText, setListText] = useState(entry.army?.listText || "");
  const [importedArmy, setImportedArmy] = useState<Choice | null>(null);
  const [savedId, setSavedId] = useState(entry.savedArmyId || "");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const rules =
    view.patches.find((p) => p.id === scrim.patchId)?.catalogue || catalogue;
  const saved = (view.savedArmies || [])
    .filter((a) => a.userId === entry.userId && a.patchId === scrim.patchId)
    .sort((a, b) =>
      (a.army.listName || a.army.factionName).localeCompare(
        b.army.listName || b.army.factionName,
      ),
    );
  const selected = saved.find((a) => a.id === savedId);
  const army =
    method === "saved"
      ? selected?.army
      : method === "import"
        ? importedArmy
        : null;
  return (
    <Modal
      wide
      title={`${entry.army ? "Change list" : "Submit list"} · ${entry.name}`}
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:list:${entry.id}`}
      busy={busy}
      draft={{
        value: { method, listText, importedArmy, savedId, url },
        restore: (draft) => {
          setMethod(draft.method);
          setListText(draft.listText);
          setImportedArmy(draft.importedArmy);
          setSavedId(draft.savedId);
          setUrl(draft.url);
        },
      }}
    >
      <p>
        Rules: {view.patches.find((p) => p.id === scrim.patchId)?.name}.{" "}
        {entry.userId
          ? "A list entered here is also saved privately in this player's My Armies."
          : "This list belongs to the external roster."}
      </p>
      <div
        className={styles.listMethods}
        role="group"
        aria-label="Choose how to submit your list"
      >
        {(
          [
            ["saved", "Choose from your armies"],
            ["import", "Import"],
            ["own", "Enter own"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            aria-pressed={method === value}
            onClick={() => {
              setMethod(value);
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "saved" && (
        <>
          {saved.length ? (
            <fieldset className={styles.savedListChoices} disabled={busy}>
              <legend>
                {entry.userId === view.me.id
                  ? "Your armies"
                  : "Available saved armies"}
              </legend>
              {saved.map((list) => (
                <label key={list.id}>
                  <input
                    type="radio"
                    name="savedArmyId"
                    value={list.id}
                    checked={savedId === list.id}
                    onChange={() => setSavedId(list.id)}
                  />
                  <span>
                    <strong>
                      {list.army.listName || list.army.factionName}
                    </strong>
                    <small>
                      {list.army.factionName} ·{" "}
                      {list.army.detachmentNames.join(" + ")} ·{" "}
                      {list.army.dispositionName}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className={styles.muted}>
              {entry.userId === view.me.id
                ? "You have no saved armies for this rules patch. Import a list or choose Enter own."
                : "No saved armies are available for this player and rules patch. Private armies are only available to their owner."}
            </p>
          )}
        </>
      )}
      {method === "import" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setImportedArmy(null);
            try {
              const r = await fetch("/api/army-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, patchId: scrim.patchId }),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              setImportedArmy(data.army);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="New Recruit shared-list link">
            <input
              type="url"
              required
              maxLength={2000}
              placeholder="https://www.newrecruit.eu/app/list/…"
              value={url}
              disabled={busy}
              onChange={(e) => {
                setUrl(e.target.value);
                setImportedArmy(null);
                setError("");
              }}
            />
          </Field>
          <button disabled={busy || !url.trim()}>
            Import from New Recruit
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {method && (method !== "import" || importedArmy) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (method === "own" ? !listText.trim() : !army) return;
            setBusy(true);
            setError("");
            const ok = await mutate(
              {
                type: "scrimSubmit",
                scrimId: scrim.id,
                revision,
                teamId: team.id,
                entryId: entry.id,
                ...(method === "saved"
                  ? { savedArmyId: savedId }
                  : method === "own"
                    ? { listText }
                    : { army }),
              },
              setError,
            );
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <fieldset className={styles.listFields} disabled={busy}>
            {method === "own" ? (
              <>
                <Field label="Army-list text">
                  <textarea
                    autoFocus
                    required
                    rows={14}
                    maxLength={100000}
                    className={styles.listText}
                    placeholder="Paste your New Recruit list export here…"
                    value={listText}
                    onChange={(e) => setListText(e.target.value)}
                  />
                </Field>
                <p className={styles.muted}>
                  Paste the complete New Recruit export, including its faction,
                  detachments and force disposition. Your text and line breaks
                  are kept as entered.
                </p>
              </>
            ) : method === "import" && importedArmy ? (
              <>
                <Field label="Army-list name">
                  <input
                    required
                    maxLength={100}
                    value={importedArmy.listName || ""}
                    onChange={(e) =>
                      setImportedArmy({
                        ...importedArmy,
                        listName: e.target.value,
                      })
                    }
                  />
                </Field>
                <ArmyFields
                  title="Submitted army"
                  value={importedArmy}
                  onChange={setImportedArmy}
                  rules={rules}
                  maxDP={3}
                  hideListName
                />
              </>
            ) : army ? (
              <div className={styles.listSummary}>
                <strong>{army.listName || "Army list"}</strong>
                <p>{rules.factions.find((f) => f.id === army.faction)?.name}</p>
                <p>
                  {army.detachments
                    .map(
                      (id) =>
                        rules.factions
                          .find((f) => f.id === army.faction)
                          ?.detachments.find((d) => d.id === id)?.name,
                    )
                    .filter(Boolean)
                    .join(" + ")}
                </p>
                <p>
                  {
                    rules.dispositions.find((d) => d.id === army.disposition)
                      ?.name
                  }
                </p>
                {(army.listUrl || army.listText || army.summary) && (
                  <ArmyListLink
                    url={army.listUrl}
                    text={army.listText}
                    summary={army.summary}
                    name={army.listName}
                  >
                    View list
                  </ArmyListLink>
                )}
              </div>
            ) : null}
            <button
              className="primary"
              disabled={
                busy ||
                (method !== "own" && !army) ||
                (method === "saved" && !selected) ||
                (method === "own" && !listText.trim())
              }
            >
              {busy ? "Saving…" : "Save submitted list"}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
