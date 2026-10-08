"use client";
import { isScrimCaptain } from "@/lib/scrims";
import { useState } from "react";
import type { Scrim, ScrimEntry, ScrimTeam, View } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { onScrimTeam, rosterWarnings } from "@/lib/scrims";
import { ArmyFields, blank, type Choice } from "./journal";
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
                  {` - ${player.army.factionName} - `}
                  <Disposition name={player.army.dispositionName} />
                </>
              )}
            </strong>
            {player.army ? (
              player.army.listUrl ? (
                <div>
                  <ArmyListLink
                    url={player.army.listUrl}
                    name={`${player.name}'s army list`}
                  >
                    View list
                  </ArmyListLink>
                </div>
              ) : (
                <small>List link not provided</small>
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
  const [army, setArmy] = useState<Choice>(
    entry.army || blank(view.me.faction),
  );
  const [savedId, setSavedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const rules =
    view.patches.find((p) => p.id === scrim.patchId)?.catalogue || catalogue;
  const saved = (view.savedArmies || []).filter(
    (a) => a.userId === entry.userId && a.patchId === scrim.patchId,
  );
  return (
    <Modal
      wide
      title={`Submit list · ${entry.name}`}
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:list:${entry.id}`}
      busy={busy}
      draft={{
        value: { army, savedId, url },
        restore: (saved) => {
          setArmy(saved.army);
          setSavedId(saved.savedId);
          setUrl(saved.url);
        },
      }}
    >
      <p>
        Rules: {view.patches.find((p) => p.id === scrim.patchId)?.name}.{" "}
        {entry.userId
          ? "A list entered here is also saved privately in this player's My Armies."
          : "This list belongs to the external roster."}
      </p>
      <Field label="Use a saved army">
        <select
          value={savedId}
          onChange={(e) => {
            setSavedId(e.target.value);
            const list = saved.find((a) => a.id === e.target.value);
            if (list) setArmy(list.army);
          }}
        >
          <option value="">Enter or import a list</option>
          {saved.map((a) => (
            <option key={a.id} value={a.id}>
              {a.army.listName} · {a.army.factionName}
            </option>
          ))}
        </select>
      </Field>
      {!savedId && (
        <>
          <Field label="New Recruit shared-list link">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <button
            disabled={busy || !url}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/army-import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ url, patchId: scrim.patchId }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                setArmy(data.army);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Import from New Recruit
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await mutate(
            {
              type: "scrimSubmit",
              scrimId: scrim.id,
              revision,
              teamId: team.id,
              entryId: entry.id,
              ...(savedId ? { savedArmyId: savedId } : { army }),
            },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        {savedId ? (
          <div className={styles.player}>
            <strong>{army.listName}</strong>
            <p>{rules.factions.find((f) => f.id === army.faction)?.name}</p>
            <p>
              {rules.dispositions.find((d) => d.id === army.disposition)?.name}
            </p>
          </div>
        ) : (
          <>
            <Field label="Army-list name">
              <input
                required
                maxLength={100}
                value={army.listName || ""}
                onChange={(e) => setArmy({ ...army, listName: e.target.value })}
              />
            </Field>
            <ArmyFields
              title="Submitted army"
              value={army}
              onChange={setArmy}
              rules={rules}
              maxDP={3}
              hideListName
            />
          </>
        )}
        <button className="primary" disabled={busy}>
          Save submitted list
        </button>
      </form>
    </Modal>
  );
}
