"use client";
import { useMemo, useState } from "react";
import type { View } from "@/lib/types";
import { cellKey, layouts, type MatrixArmy } from "@/lib/matchups";
import { PageHeading, Empty, Modal } from "./ui";
import { matchupDatabase } from "@/lib/matchup-database";
import MatchupTable, { MatrixAverageBadge } from "./matchup-table";
import MatchupMissions from "./matchup-missions";
import { Disposition } from "./disposition";
import { patchLabel } from "@/lib/patches";

import { blank, type Choice } from "./journal";
import { AxisFilter, emptyFilter, type Filter } from "./matrix-axis-filter";
import MatrixListEditor from "./matrix-list-editor";
import matrixStyles from "./scrims.module.css";
import type { Mutate } from "./workspace";
export default function MatchupMatrix({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const [adding, setAdding] = useState(false);
  const [editingListKey, setEditingListKey] = useState("new");
  const [choice, setChoice] = useState<Choice>(blank());
  const [patch, setPatch] = useState(
    view.defaultPatchId || view.patches.find((p) => !p.removedAt)?.id || "",
  );
  const data = useMemo(() => matchupDatabase(view, patch), [view, patch]);
  const [y, setY] = useState<Filter>(emptyFilter),
    [x, setX] = useState<Filter>(emptyFilter);
  const [yPage, setYPage] = useState(0),
    [xPage, setXPage] = useState(0);
  const [detail, setDetail] = useState<{
    row: MatrixArmy;
    column?: MatrixArmy;
  } | null>(null);
  const [hover, setHover] = useState<{ row?: string; column?: string }>({});
  const [markedRows, setMarkedRows] = useState<string[]>([]);
  const [markedColumns, setMarkedColumns] = useState<string[]>([]);
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
  const codes = new Map(
    data.armies.map((a, i) => [a.key, String(i + 1).padStart(2, "0")]),
  );
  const filtered = (f: Filter) =>
    data.armies.filter(
      (a) =>
        (!f.factions.length || f.factions.includes(a.army.faction)) &&
        (!f.lists.length || f.lists.includes(a.key)),
    );
  const rows = filtered(y),
    columns = filtered(x),
    size = 24;
  const yp = Math.min(yPage, Math.max(0, Math.ceil(rows.length / size) - 1)),
    xp = Math.min(xPage, Math.max(0, Math.ceil(columns.length / size) - 1));
  const visibleRows = rows.slice(yp * size, (yp + 1) * size),
    visibleColumns = columns.slice(xp * size, (xp + 1) * size);
  function reset() {
    setMarkedRows([]);
    setMarkedColumns([]);
    setHover({});
    setY(emptyFilter());
    setX(emptyFilter());
    setYPage(0);
    setXPage(0);
  }
  function averageBadge(key: string, opponents: string[]) {
    return (
      <MatrixAverageBadge
        numberOnly
        data={data}
        keyId={key}
        opponents={opponents}
      />
    );
  }

  const cell = detail?.column
    ? data.cells.get(cellKey(detail.row.key, detail.column.key))
    : undefined;
  return (
    <div
      className={`matrix-compact ${matrixStyles.compactMatrix} ${matrixStyles.matrixPage}`}
    >
      <PageHeading
        title="Matchup matrix"
        description={
          <>
            {data.included} games · {data.armies.length} lists · Scores from the
            row army’s perspective
          </>
        }
      >
        <button
          disabled={!patch}
          onClick={() => {
            setChoice(blank());
            setEditingListKey("new");
            setAdding(true);
          }}
        >
          Add army list
        </button>
        <button onClick={reset}>Reset filters</button>
      </PageHeading>
      <div className="matrix-toolbar">
        <label className="matrix-patch">
          Rules patch
          <select
            aria-label="Matrix rules patch"
            value={patch}
            onChange={(e) => {
              setPatch(e.target.value);
              reset();
            }}
          >
            {view.patches.map((p) => (
              <option value={p.id} key={p.id}>
                {patchLabel(p)}
              </option>
            ))}
            <option value="">All patches combined</option>
          </select>
        </label>
        <div className="matrix-legend">
          <span className="matrix-win">Above 10</span>
          <span className="matrix-draw">10 draw</span>
          <span className="matrix-loss">Below 10</span>
          <span>— no games</span>
        </div>
      </div>
      <div className="matrix-filters">
        <AxisFilter
          axis="Rows (Y)"
          armies={data.armies}
          value={y}
          onChange={(v) => {
            setY(v);
            setYPage(0);
          }}
        />
        <AxisFilter
          axis="Columns (X)"
          armies={data.armies}
          value={x}
          onChange={(v) => {
            setX(v);
            setXPage(0);
          }}
        />
      </div>
      <div className="matrix-caption">
        <span>
          Each cell: <b>A · B · C</b> layout scores. Click a layout to edit;
          Enter or click away to save, Escape to cancel. Clear a score to use
          logs. Differences such as (+2) compare manual scores with logs. Hover
          to trace axes; click list labels to pin highlights.
        </span>
        <span>
          {view.me.role === "admin"
            ? "All logs + shared team estimates"
            : "Your logs + shared team estimates"}
        </span>
      </div>
      <button
        className="text-button"
        disabled={!markedRows.length && !markedColumns.length}
        onClick={() => {
          setMarkedRows([]);
          setMarkedColumns([]);
        }}
      >
        Clear highlights ({markedRows.length + markedColumns.length})
      </button>
      {data.missingLayout > 0 && (
        <p className="matrix-warning">
          {data.missingLayout} games excluded: no layout recorded.
        </p>
      )}
      <section className="panel">
        {(rows.length > size || columns.length > size) && (
          <div className="matrix-navigation">
            {[
              ["Rows", yp, rows.length, setYPage],
              ["Columns", xp, columns.length, setXPage],
            ].map(([label, page, count, setter]) => (
              <div key={String(label)}>
                <span>
                  {String(label)} {Number(page) * size + 1}–
                  {Math.min((Number(page) + 1) * size, Number(count))} /{" "}
                  {Number(count)}
                </span>
                <button
                  aria-label={"Previous " + label}
                  disabled={page === 0}
                  onClick={() => {
                    (setter as (v: number) => void)(Number(page) - 1);
                  }}
                >
                  ←
                </button>
                <button
                  aria-label={"Next " + label}
                  disabled={(Number(page) + 1) * size >= Number(count)}
                  onClick={() => {
                    (setter as (v: number) => void)(Number(page) + 1);
                  }}
                >
                  →
                </button>
              </div>
            ))}
          </div>
        )}
        {!rows.length || !columns.length ? (
          <Empty
            title="No matchups to display"
            description="Select another patch or change the army filters."
          />
        ) : (
          <MatchupTable
            opponentDetails
            averageAxes
            showAverages={false}
            rows={rows}
            columns={columns}
            visibleRows={visibleRows}
            visibleColumns={visibleColumns}
            data={data}
            highlight={highlight}
            hoverChange={setHover}
            markedRows={markedRows}
            markedColumns={markedColumns}
            markRows={setMarkedRows}
            markColumns={setMarkedColumns}
            averageBadge={averageBadge}
            onScore={
              patch
                ? async (row, column, layout, score) => {
                    let error = "Unable to save the estimate.";
                    const ok = await mutate(
                      {
                        type: "manualEstimate",
                        patchId: patch,
                        own: row.army,
                        enemy: column.army,
                        layout,
                        score,
                      },
                      (message) => {
                        error = message;
                      },
                    );
                    if (!ok) throw new Error(error);
                  }
                : undefined
            }
            key={patch}
            onCell={(row, column) => setDetail({ row, column })}
          />
        )}
      </section>
      <details className="matrix-method">
        <summary>How to read this matrix</summary>
        <p>
          Army configurations group faction + unordered detachments +
          disposition. List URLs do not split groups. Scores are observed
          averages, not predictions for unplayed games. Opponent perspective
          uses 20 minus the recorded score. Identical-list mirrors pool both
          sides at 10 and count each game once. Counts represent journal
          entries, including demo games. Patch filtering keeps rules versions
          separate. Row and column averages show that army’s own score, weighted
          equally across available layout matchups and opponents matching the
          opposite axis filter (including other pages). Manual estimates replace
          logged averages. Signed differences compare with logs; * marks
          estimates without a difference to show. Unplayed matchups without
          manual estimates are excluded. Clearing a manual estimate restores the
          logs. All-patches mode uses logs only. Click a marked label again to
          unpin it; multiple axes can stay marked.
        </p>
      </details>
      {adding && (
        <MatrixListEditor
          view={view}
          patchId={patch}
          draftId={editingListKey}
          initialArmy={choice}
          mutate={mutate}
          onClose={() => setAdding(false)}
        />
      )}
      {!!view.matrixLists?.length && (
        <details className="matrix-method">
          <summary>Shared army lists — edit and attribution</summary>
          {view.matrixLists
            .filter((l) => !patch || l.patchId === patch)
            .map((l) => (
              <div key={l.id}>
                <b>{l.army.listName || l.army.factionName}</b> · {l.authorName}{" "}
                · {new Date(l.updatedAt).toLocaleString()}{" "}
                <button
                  disabled={!patch}
                  onClick={() => {
                    setChoice(l.army);
                    setEditingListKey(l.id);
                    setAdding(true);
                  }}
                >
                  Edit list
                </button>
              </div>
            ))}
        </details>
      )}
      {!!view.matrixListHistory?.length && (
        <details className="matrix-method">
          <summary>Army list change history</summary>
          {view.matrixListHistory
            .filter((c) => !patch || c.patchId === patch)
            .slice()
            .reverse()
            .map((c, i) => (
              <p key={i}>
                {c.army.listName || c.army.factionName} ·{" "}
                {c.army.detachmentNames.join(" + ")} ·{" "}
                <Disposition name={c.army.dispositionName} /> · {c.authorName} ·{" "}
                {new Date(c.updatedAt).toLocaleString()}
              </p>
            ))}
        </details>
      )}
      {detail && (
        <Modal
          wide
          title={detail.column ? "Matchup detail" : "Army configuration"}
          onClose={() => setDetail(null)}
          draftKey={`matrix:${patch}:${detail.row.key}:${detail.column?.key || ""}`}
        >
          {!detail.column && (
            <>
              <h3>
                #{codes.get(detail.row.key)} · {detail.row.army.factionName}
              </h3>
              <p>
                {detail.row.army.detachmentNames.join(" + ") ||
                  "No detachments"}{" "}
                · <Disposition name={detail.row.army.dispositionName} />
              </p>
            </>
          )}
          {detail.column && (
            <>
              <MatchupMissions
                ownDisposition={detail.row.army.dispositionName}
                enemyDisposition={detail.column.army.dispositionName}
                ownLabel={`Row army · ${detail.row.army.factionName}`}
                enemyLabel={`Opponent · ${detail.column.army.factionName}`}
              />
              {!patch && (
                <p>
                  Select a single rules patch to view or edit manual estimates.
                </p>
              )}
              {patch && (
                <p>
                  Manual estimates override logs for the team. The reverse
                  matchup automatically uses 20 minus your estimate. Edit each
                  layout directly in the matrix.
                </p>
              )}
              <table className="matrix-detail">
                <thead>
                  <tr>
                    <th>Layout</th>
                    <th>Logged avg /20</th>
                    <th>Games</th>
                    <th>Manual /20</th>
                  </tr>
                </thead>
                <tbody>
                  {layouts.map((l) => (
                    <tr key={l}>
                      <th>{l}</th>
                      <td>
                        {cell?.[l].count ? cell[l].average.toFixed(1) : "—"}
                      </td>
                      <td>{cell?.[l].count || 0}</td>
                      <td>
                        {patch &&
                        data.manual.has(
                          cellKey(detail.row.key, detail.column!.key) + l,
                        )
                          ? data.effective
                              .get(cellKey(detail.row.key, detail.column!.key))
                              ?.[l].average.toFixed(1)
                          : "—"}
                        {(() => {
                          const change = (view.matrixChanges || [])
                            .filter(
                              (c) =>
                                c.patchId === patch &&
                                c.layout === l &&
                                ((c.row === detail.row.key &&
                                  c.column === detail.column!.key) ||
                                  (c.column === detail.row.key &&
                                    c.row === detail.column!.key)),
                            )
                            .at(-1);
                          return (
                            change && (
                              <small>
                                {change.authorName} ·{" "}
                                {new Date(change.updatedAt).toLocaleString(
                                  "en-GB",
                                  { timeZone: "Europe/Stockholm" },
                                )}
                              </small>
                            )
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Clear a layout score directly in the matrix to restore its
                logged average.
              </p>
              <details>
                <summary>Estimate change history</summary>
                {(view.matrixChanges || [])
                  .filter(
                    (c) =>
                      c.patchId === patch &&
                      ((c.row === detail.row.key &&
                        c.column === detail.column!.key) ||
                        (c.column === detail.row.key &&
                          c.row === detail.column!.key)),
                  )
                  .slice()
                  .reverse()
                  .map((c, i) => (
                    <p key={i}>
                      {c.layout}:{" "}
                      {c.score === null
                        ? "Restored logs"
                        : (c.row === detail.row.key
                            ? c.score
                            : 20 - c.score
                          ).toFixed(1)}{" "}
                      · {c.authorName} ·{" "}
                      {new Date(c.updatedAt).toLocaleString()}
                    </p>
                  ))}
              </details>
              <p>
                Layout difference:{" "}
                {(() => {
                  const es = layouts
                    .map(
                      (l) =>
                        data.effective.get(
                          cellKey(detail.row.key, detail.column!.key),
                        )?.[l],
                    )
                    .filter((e) => e && e.count);
                  return es.length > 1
                    ? (
                        Math.max(...es.map((e) => e!.average)) -
                        Math.min(...es.map((e) => e!.average))
                      ).toFixed(1) + " points"
                    : "Not enough layouts recorded";
                })()}
              </p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
