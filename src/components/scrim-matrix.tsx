"use client";
import { useState } from "react";
import type { Scrim, ScrimEstimate, ScrimTeam, View } from "@/lib/types";
import { layouts } from "@/lib/matchups";
import { onScrimTeam } from "@/lib/scrims";
import { Field, Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";
import { useScrimClock } from "./use-scrim-clock";

export default function ScrimMatrix({
  view,
  scrim,
  mutate,
}: {
  view: View;
  scrim: Scrim;
  mutate: Mutate;
}) {
  const visible = scrim.teams.filter(
    (t) => scrim.completedAt || onScrimTeam(t, view.me.id),
  );
  const [selectedTeam, setSelectedTeam] = useState(visible[0]?.id || "");
  const team = visible.find((t) => t.id === selectedTeam) || visible[0];
  const other = scrim.teams.find((t) => t.id !== team?.id);
  const [editing, setEditing] = useState<ScrimEstimate | null>(null);
  const now = useScrimClock();
  const ready =
    now >= Date.parse(scrim.submissionDeadline) &&
    scrim.teams.every((t) => t.finalizedAt);
  const canEdit = !!team && onScrimTeam(team, view.me.id) && !scrim.cancelled;
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2>Team matchup matrix</h2>
          <p className={styles.muted}>
            {scrim.completedAt
              ? "Both team plans are now visible for review."
              : "Estimates and planning comments stay inside your team until all games are completed."}
          </p>
        </div>
        {visible.length > 1 && (
          <Field label="Team perspective">
            <select
              value={team?.id}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              {visible.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {!ready ? (
        <p>
          Available after both teams finalize their lists and the submission
          deadline passes.
        </p>
      ) : !team ? (
        <p>Team plans will be revealed here when the scrim is complete.</p>
      ) : (
        <>
          <p className={styles.muted}>
            Scores are from {team.name}’s perspective. Each cell shows A / B /
            C. Shared matrix estimates provide the starting values; changes here
            affect only this scrim.
          </p>
          <div
            className={styles.tableScroll}
            tabIndex={0}
            role="region"
            aria-label={`${team.name} matchup matrix, scroll horizontally for all players`}
          >
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th scope="col">
                    {team.name} ↓<br />
                    {other?.name} →
                  </th>
                  {other?.entries.map((entry) => (
                    <th scope="col" key={entry.id}>
                      {entry.name}
                      <small>{entry.army?.factionName}</small>
                      <small>
                        {entry.army?.listName} · {entry.army?.dispositionName}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.entries.map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">
                      {entry.name}
                      <small>{entry.army?.factionName}</small>
                      <small>
                        {entry.army?.listName} · {entry.army?.dispositionName}
                      </small>
                    </th>
                    {other?.entries.map((enemy) => {
                      const cell = team.estimates.find(
                        (c) => c.ownId === entry.id && c.enemyId === enemy.id,
                      );
                      return (
                        <td key={enemy.id}>
                          {cell ? (
                            <button
                              aria-label={`${entry.name} versus ${enemy.name}, estimates and comments`}
                              onClick={() => setEditing(cell)}
                            >
                              <span>
                                {layouts
                                  .map(
                                    (l) =>
                                      `${l}: ${cell.scores[l] === null ? "—" : Math.round(cell.scores[l]! * 10) / 10}`,
                                  )
                                  .join(" / ")}
                              </span>
                              <small>
                                {cell.comments.length
                                  ? `${cell.comments.length} comment${cell.comments.length === 1 ? "" : "s"}`
                                  : "Estimates & comments"}
                              </small>
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && team && (
        <EstimateEditor
          key={`${team.id}-${editing.ownId}-${editing.enemyId}`}
          scrim={scrim}
          team={team}
          cell={editing}
          canEdit={canEdit}
          mutate={mutate}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function EstimateEditor({
  scrim,
  team,
  cell,
  canEdit,
  mutate,
  onClose,
}: {
  scrim: Scrim;
  team: ScrimTeam;
  cell: ScrimEstimate;
  canEdit: boolean;
  mutate: Mutate;
  onClose: () => void;
}) {
  const own = team.entries.find((e) => e.id === cell.ownId)!;
  const enemy = scrim.teams
    .flatMap((t) => t.entries)
    .find((e) => e.id === cell.enemyId)!;
  const [revision] = useState(scrim.revision);
  const [error, setError] = useState("");
  const [scores, setScores] = useState(
    Object.fromEntries(
      layouts.map((l) => [
        l,
        cell.scores[l] === null ? "" : String(cell.scores[l]),
      ]),
    ),
  );
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const base = {
    scrimId: scrim.id,
    revision,
    teamId: team.id,
    ownId: own.id,
    enemyId: enemy.id,
  };
  return (
    <Modal title={`${own.name} vs ${enemy.name}`} onClose={onClose}>
      <p>
        {own.army?.listName} vs {enemy.army?.listName}
      </p>
      <p className={styles.muted}>
        {scrim.completedAt
          ? "Team plan · visible to all confirmed members"
          : `Private to ${team.name} until the scrim is complete`}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await mutate(
            {
              type: "scrimEstimate",
              ...base,
              scores: Object.fromEntries(
                layouts.map((l) => [
                  l,
                  scores[l] === "" ? null : Number(scores[l]),
                ]),
              ),
            },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <div className={styles.scoreInputs}>
          {layouts.map((l) => (
            <Field key={l} label={`Layout ${l}`}>
              <input
                type="number"
                min={0}
                max={20}
                step="any"
                placeholder="Unknown"
                value={scores[l]}
                disabled={!canEdit}
                onChange={(e) => setScores({ ...scores, [l]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        {cell.updatedBy && (
          <p className={styles.muted}>
            Last edited by {cell.updatedBy} ·{" "}
            {new Date(cell.updatedAt!).toLocaleString("en-GB", {
              timeZone: "Europe/Stockholm",
            })}
          </p>
        )}
        {canEdit && (
          <button className="primary" disabled={busy}>
            Save estimates
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
      {!!cell.history?.length && (
        <details>
          <summary>Estimate history ({cell.history.length})</summary>
          {[...cell.history].reverse().map((h, i) => (
            <p key={i} className={styles.muted}>
              {layouts.map((l) => `${l}: ${h.scores[l] ?? "—"}`).join(" / ")} ·{" "}
              {h.authorName} ·{" "}
              {new Date(h.createdAt).toLocaleString("en-GB", {
                timeZone: "Europe/Stockholm",
              })}
            </p>
          ))}
        </details>
      )}
      <h3>Pairing comments</h3>
      {cell.comments.map((c) => (
        <div className={styles.comment} key={c.id}>
          <strong>{c.authorName}</strong>
          <p>{c.text}</p>
          <small>
            {new Date(c.createdAt).toLocaleString("en-GB", {
              timeZone: "Europe/Stockholm",
            })}
          </small>
        </div>
      ))}
      {!cell.comments.length && (
        <p className={styles.muted}>No planning comments yet.</p>
      )}
      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await mutate(
              {
                type: "scrimPlanComment",
                ...base,
                text: comment,
              },
              setError,
            );
            setBusy(false);
            if (ok) onClose();
          }}
        >
          <Field label="Add a planning comment">
            <textarea
              required
              maxLength={3000}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <button disabled={busy}>Add comment</button>
        </form>
      )}
    </Modal>
  );
}
