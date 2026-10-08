"use client";
import { useState } from "react";
import type { Scrim, ScrimEstimate, ScrimTeam, View } from "@/lib/types";
import { armyKey, cellKey, layouts, type Matchup } from "@/lib/matchups";
import { matchupDatabase } from "@/lib/matchup-database";
import MatchupTable, { MatrixAverageBadge } from "./matchup-table";
import MatchupMissions from "./matchup-missions";
import { onScrimTeam } from "@/lib/scrims";
import { Field, Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";
import { AxisFilter, emptyFilter, type Filter } from "./matrix-axis-filter";
import MatrixListEditor from "./matrix-list-editor";

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
  const [adding, setAdding] = useState(false);
  const [opponentFilter, setOpponentFilter] = useState<Filter>(emptyFilter);
  const [filterMode, setFilterMode] = useState(false);
  const ready = !!scrim.listsRevealed;
  const activeFilter = filterMode === ready ? opponentFilter : emptyFilter();
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
  const allColumns = opponents.map((entry) => ({
    key: entry.id,
    army: entry.army!,
  }));
  const columns = allColumns.filter(
    (column) =>
      (!activeFilter.factions.length ||
        activeFilter.factions.includes(column.army.faction)) &&
      (!activeFilter.lists.length || activeFilter.lists.includes(column.key)),
  );
  const effective = new Map<string, Matchup>();
  const cells = new Map<string, Matchup>();
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
      const logged = base.cells.get(
        cellKey(armyKey(own.army!), armyKey(enemy.army!)),
      );
      if (logged) cells.set(key, logged);
      // The server supplies shared plan defaults. Private logs are comparison
      // data only and must not silently become scores for other layouts.
      const scores = cell?.scores;
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
              : base.manual.has(
                    cellKey(armyKey(own.army!), armyKey(enemy.army!)) + layout,
                  ) && reference?.[layout]
                ? reference[layout]
                : { count: 0, total: 0, average: 0 },
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
      numberOnly
      data={{ effective }}
      keyId={key}
      opponents={opponents}
    />
  );
  const canEdit = !!team && onScrimTeam(team, view.me.id) && !scrim.cancelled;
  return (
    <section
      className={`matrix-compact ${styles.card} ${styles.compactMatrix}`}
    >
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
      {team && (
        <>
          <div className="row">
            <button onClick={() => setAdding(true)}>Add army list</button>
            <button onClick={() => setOpponentFilter(emptyFilter())}>
              Reset opponent filters
            </button>
          </div>
          <AxisFilter
            axis="Opponents (X)"
            armies={allColumns}
            value={activeFilter}
            onChange={(filter) => {
              setFilterMode(ready);
              setOpponentFilter(filter);
            }}
          />
        </>
      )}
      {!team ? (
        <p>Team plans will be revealed here when the scrim is complete.</p>
      ) : !submitted.length ? (
        <p>Submit a team list to start preparing matchups.</p>
      ) : !columns.length ? (
        <p>
          No opponent lists match. Clear the filters or add a shared list for
          this patch.
        </p>
      ) : (
        <>
          <p className={styles.muted}>
            A / B / C · {team.name}’s scores ·{" "}
            {ready ? "Opposing lists" : "All patch lists"} · Edits stay in this
            scrim. Click a layout to edit; Enter or click away saves. Clear a
            score to mark it unknown. Differences compare with your available
            logs.
          </p>
          <MatchupTable
            rowNames={Object.fromEntries(
              submitted.map((entry) => [entry.id, entry.name]),
            )}
            columnNames={
              ready
                ? Object.fromEntries(
                    opponents.map((entry) => [entry.id, entry.name]),
                  )
                : undefined
            }
            showAverages={false}
            averageAxes
            opponentDetails
            rows={rows}
            columns={columns}
            data={{ effective, manual, cells }}
            highlight={highlight}
            hoverChange={hoverChange}
            markedRows={markedRows}
            markedColumns={markedColumns}
            markRows={markRows}
            markColumns={markColumns}
            averageBadge={averageBadge}
            key={`${team.id}:${ready}`}
            onScore={
              canEdit
                ? async (row, column, layout, score) => {
                    const scores = Object.fromEntries(
                      layouts.map((l) => {
                        const value = effective.get(
                          cellKey(row.key, column.key),
                        )?.[l];
                        return [
                          l,
                          l === layout
                            ? score
                            : value?.count
                              ? value.average
                              : null,
                        ];
                      }),
                    );
                    let error = "Unable to save the estimate.";
                    const ok = await mutate(
                      {
                        type: "scrimEstimate",
                        scrimId: scrim.id,
                        revision: scrim.revision,
                        teamId: team.id,
                        ownId: row.key,
                        enemyId: column.key,
                        scores,
                      },
                      (message) => {
                        error = message;
                      },
                    );
                    if (!ok) throw new Error(error);
                  }
                : undefined
            }
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
      {adding && (
        <MatrixListEditor
          view={view}
          patchId={scrim.patchId}
          mutate={mutate}
          onClose={() => setAdding(false)}
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
      wide
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
      <p className={styles.muted}>
        {scrim.completedAt
          ? "Team plan · visible to all confirmed members"
          : `Private to ${team.name} until the scrim is complete`}
      </p>
      <MatchupMissions
        ownDisposition={own.army!.dispositionName}
        enemyDisposition={enemy.army!.dispositionName}
        ownLabel={own.name}
        enemyLabel={enemy.name}
      />
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
