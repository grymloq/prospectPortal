"use client";
import { useState } from "react";
import type { Scrim, ScrimEstimate, ScrimTeam, View } from "@/lib/types";
import { armyKey, cellKey, layouts, type Matchup } from "@/lib/matchups";
import { matchupDatabase } from "@/lib/matchup-database";
import MatchupTable, { MatrixAverageBadge } from "./matchup-table";
import { onScrimTeam } from "@/lib/scrims";
import { Field, Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";

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
    (t) => !t.external && (scrim.completedAt || onScrimTeam(t, view.me.id)),
  );
  const [selectedTeam, setSelectedTeam] = useState(visible[0]?.id || "");
  const team = visible.find((t) => t.id === selectedTeam) || visible[0];
  const other = scrim.teams.find((t) => t.id !== team?.id);
  const [editing, setEditing] = useState<ScrimEstimate | null>(null);
  const ready = !!scrim.listsRevealed;
  const opponents = ready
    ? other?.entries.filter((entry) => entry.army) || []
    : scrim.databaseEntries || [];
  const submitted = team?.entries.filter((entry) => entry.army) || [];
  const base = matchupDatabase(view, scrim.patchId);
  const rows = submitted.map((entry) => ({
    key: entry.id,
    army: {
      ...entry.army!,
      listName: `${entry.name} · ${entry.army!.listName || entry.army!.factionName}`,
    },
  }));
  const columns = opponents.map((entry) => ({
    key: entry.id,
    army: entry.army!,
  }));
  const effective = new Map<string, Matchup>();
  const manual = new Set<string>();
  for (const own of submitted)
    for (const enemy of opponents) {
      const cell = team!.estimates.find(
        (c) => c.ownId === own.id && c.enemyId === enemy.id,
      );
      const key = cellKey(own.id, enemy.id);
      const reference = base.effective.get(
        cellKey(armyKey(own.army!), armyKey(enemy.army!)),
      );
      const scores = ready || cell?.history?.length ? cell?.scores : undefined;
      const matchup = Object.fromEntries(
        layouts.map((layout) => {
          const value = scores?.[layout];
          if (value !== undefined && value !== null) manual.add(key + layout);
          return [
            layout,
            scores
              ? {
                  count: value === null || value === undefined ? 0 : 1,
                  total: value || 0,
                  average: value || 0,
                }
              : reference?.[layout] || { count: 0, total: 0, average: 0 },
          ];
        }),
      ) as Matchup;
      effective.set(key, matchup);
      effective.set(
        cellKey(enemy.id, own.id),
        Object.fromEntries(
          layouts.map((layout) => [
            layout,
            {
              ...matchup[layout],
              average: matchup[layout].count ? 20 - matchup[layout].average : 0,
              total: matchup[layout].count
                ? (20 - matchup[layout].average) * matchup[layout].count
                : 0,
            },
          ]),
        ) as Matchup,
      );
    }
  const [markedRows, markRows] = useState<string[]>([]);
  const [markedColumns, markColumns] = useState<string[]>([]);
  const [hover, hoverChange] = useState<{ row?: string; column?: string }>({});
  const highlight = (row?: string, column?: string) =>
    [
      (row && markedRows.includes(row)) ||
      (column && markedColumns.includes(column))
        ? "matrix-marked"
        : "",
      (row && hover.row === row) || (column && hover.column === column)
        ? "matrix-hovered"
        : "",
    ].join(" ");
  const averageBadge = (key: string, opponents: string[]) => (
    <MatrixAverageBadge
      data={{ effective }}
      keyId={key}
      opponents={opponents}
    />
  );
  const canEdit = !!team && onScrimTeam(team, view.me.id) && !scrim.cancelled;
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2>Team matchup matrix</h2>
          <p className={styles.muted}>
            {scrim.completedAt
              ? "Team plans are now visible for review."
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
      {!team ? (
        <p>Team plans will be revealed here when the scrim is complete.</p>
      ) : !submitted.length ? (
        <p>Submit a team list to start preparing matchups.</p>
      ) : !opponents.length ? (
        <p>
          No lists are available in the matchup database for this rules patch.
        </p>
      ) : (
        <>
          <p className={styles.muted}>
            Scores are from {team.name}’s perspective. Each cell shows A / B /
            C.{" "}
            {ready
              ? "Shared matrix estimates provide the starting values; changes here affect only this scrim."
              : "Your submitted lists are shown against all accessible lists in the matchup database for this rules patch. Shared estimates provide starting scores; your edits and comments stay private to this team and scrim. Once opposing lists are revealed, only that team's lists will appear."}
          </p>
          <MatchupTable
            rows={rows}
            columns={columns}
            data={{ effective, manual }}
            highlight={highlight}
            hoverChange={hoverChange}
            markedRows={markedRows}
            markedColumns={markedColumns}
            markRows={markRows}
            markColumns={markColumns}
            averageBadge={averageBadge}
            onCell={(row, column) => {
              const cell = team.estimates.find(
                (c) => c.ownId === row.key && c.enemyId === column.key,
              );
              if (cell)
                setEditing({
                  ...cell,
                  scores: Object.fromEntries(
                    layouts.map((layout) => {
                      const value = effective.get(
                        cellKey(row.key, column.key),
                      )?.[layout];
                      return [layout, value?.count ? value.average : null];
                    }),
                  ) as ScrimEstimate["scores"],
                });
            }}
          />
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
  const enemy = [
    ...scrim.teams.flatMap((t) => t.entries),
    ...(scrim.databaseEntries || []),
  ].find((e) => e.id === cell.enemyId)!;
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
    <Modal
      title={`${own.name} vs ${enemy.name}`}
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:matrix:${team.id}:${own.id}:${enemy.id}`}
      busy={busy}
      draft={{
        value: { scores, comment },
        restore: (saved) => {
          setScores(saved.scores);
          setComment(saved.comment);
        },
      }}
    >
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
