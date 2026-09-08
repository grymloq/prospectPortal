"use client";
import { useMemo, useState } from "react";
import type { View } from "@/lib/types";
import {
  matrixWithManual,
  cellKey,
  layouts,
  type MatrixArmy,
} from "@/lib/matchups";
import { Empty, Modal, Field } from "./ui";
import { patchLabel } from "@/lib/patches";

import { ArmyFields, blank, type Choice } from "./journal";
import type { Mutate } from "./workspace";
type Filter = { factions: string[]; lists: string[] };
const emptyFilter = (): Filter => ({ factions: [], lists: [] });
function description(item: MatrixArmy) {
  return [
    item.army.listName || "",
    item.army.factionName,
    item.army.detachmentNames.join(" + ") || "No detachments",
    item.army.dispositionName,
  ]
    .filter(Boolean)
    .join(" · ");
}
function Picker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <details className="matrix-picker">
      <summary>
        {label}{" "}
        <span>{selected.length ? selected.length + " selected" : "All"}</span>
      </summary>
      <div className="matrix-options">
        <button
          type="button"
          className="text-button"
          onClick={() => onChange([])}
        >
          Show all (clear filter)
        </button>
        {options.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        ))}
        {!options.length && <p>No lists match these factions.</p>}
      </div>
    </details>
  );
}
function AxisFilter({
  axis,
  armies,
  value,
  onChange,
}: {
  axis: string;
  armies: MatrixArmy[];
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const factions = [
    ...new Map(
      armies.map((a) => [a.army.faction, a.army.factionName]),
    ).entries(),
  ].map(([id, label]) => ({ id, label }));
  const available = armies.filter(
    (a) => !value.factions.length || value.factions.includes(a.army.faction),
  );
  return (
    <section className="panel matrix-axis">
      <h3>{axis}</h3>
      <Picker
        label={axis + " factions"}
        options={factions}
        selected={value.factions}
        onChange={(factions) => onChange({ factions, lists: [] })}
      />
      <Picker
        label={axis + " army lists"}
        options={available.map((a) => ({ id: a.key, label: description(a) }))}
        selected={value.lists}
        onChange={(lists) => onChange({ ...value, lists })}
      />
    </section>
  );
}

function tone(average: number, count: number) {
  return !count
    ? "matrix-unknown"
    : average > 10
      ? "matrix-win"
      : average < 10
        ? "matrix-loss"
        : "matrix-draw";
}
export default function MatchupMatrix({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState<Choice>(blank());
  const [busy, setBusy] = useState(false);
  const [patch, setPatch] = useState(view.patches[0]?.id || "");
  const data = useMemo(
    () =>
      matrixWithManual(
        view.games,
        patch,
        view.matrixLists || [],
        view.manualEstimates || [],
      ),
    [view.games, view.matrixLists, view.manualEstimates, patch],
  );
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
  const toggle = (items: string[], key: string) =>
    items.includes(key) ? items.filter((i) => i !== key) : [...items, key];
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
    const values = opponents.flatMap((opponent) => {
      const cell = data.effective.get(cellKey(key, opponent));
      return layouts.flatMap((l) => (cell?.[l].count ? [cell[l].average] : []));
    });
    const average = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0;
    return (
      <span
        className={"matrix-average " + tone(average, values.length)}
        title="Mean of available A/B/C matchup scores against filtered opponents, including manual overrides. Each layout matchup has equal weight."
      >
        Avg {values.length ? average.toFixed(1) : "—"}
        <small>
          {values.length} {values.length === 1 ? "layout" : "layouts"}
        </small>
      </span>
    );
  }

  const cell = detail?.column
    ? data.cells.get(cellKey(detail.row.key, detail.column.key))
    : undefined;
  return (
    <div className="matrix-compact">
      <header className="page-heading">
        <div>
          <h1>Matchup matrix</h1>
          <p>
            {data.included} games · {data.armies.length} lists · Scores from the
            row army’s perspective
          </p>
        </div>
        <div>
          <button
            disabled={!patch}
            onClick={() => {
              setChoice(blank());
              setAdding(true);
            }}
          >
            Add army list
          </button>{" "}
          <button onClick={reset}>Reset filters</button>
        </div>
      </header>
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
          Each cell: <b>A · B · C</b> layout averages. Click a cell for counts
          and differences. Hover to trace axes; click list labels to pin
          highlights.
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
          <div
            className="matrix-scroll"
            role="region"
            tabIndex={0}
            aria-label="Compact matchup matrix"
          >
            <table
              className="matchup-table"
              onMouseLeave={() => setHover({})}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setHover({});
              }}
            >
              <caption className="sr-only">
                Average scores for row army against column army on layouts A, B,
                C
              </caption>
              <thead>
                <tr>
                  <th scope="col">Row ↓ / Opponent →</th>
                  {visibleColumns.map((a) => (
                    <th
                      scope="col"
                      key={a.key}
                      className={highlight(undefined, a.key)}
                      onMouseEnter={() => setHover({ column: a.key })}
                      onFocus={() => setHover({ column: a.key })}
                    >
                      <button
                        className="matrix-list-label"
                        title={description(a)}
                        aria-pressed={markedColumns.includes(a.key)}
                        onClick={() =>
                          setMarkedColumns(toggle(markedColumns, a.key))
                        }
                      >
                        <b>#{codes.get(a.key)}</b>
                        <span>{a.army.factionName}</span>
                        <small>{a.army.listName}</small>
                        <small>{a.army.detachmentNames.join(" + ")}</small>
                        <small>{a.army.dispositionName}</small>
                      </button>
                      {averageBadge(
                        a.key,
                        rows.map((r) => r.key),
                      )}
                      <div className="matrix-layout-labels">
                        <span>A</span>
                        <span>B</span>
                        <span>C</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      className={highlight(row.key)}
                      onMouseEnter={() => setHover({ row: row.key })}
                      onFocus={() => setHover({ row: row.key })}
                    >
                      <button
                        className="matrix-list-label"
                        title={description(row)}
                        aria-pressed={markedRows.includes(row.key)}
                        onClick={() =>
                          setMarkedRows(toggle(markedRows, row.key))
                        }
                      >
                        <b>#{codes.get(row.key)}</b>
                        <span>{row.army.factionName}</span>
                        <small>{row.army.listName}</small>
                        <small>{row.army.detachmentNames.join(" + ")}</small>
                        <small>{row.army.dispositionName}</small>
                      </button>
                      {averageBadge(
                        row.key,
                        columns.map((a) => a.key),
                      )}
                    </th>
                    {visibleColumns.map((col) => {
                      const cell = data.effective.get(
                        cellKey(row.key, col.key),
                      );
                      const label =
                        description(row) +
                        " versus " +
                        description(col) +
                        ". " +
                        layouts
                          .map(
                            (l) =>
                              l +
                              ": " +
                              (cell?.[l].count
                                ? cell[l].average.toFixed(1) +
                                  (data.manual.has(
                                    cellKey(row.key, col.key) + l,
                                  )
                                    ? " manual estimate"
                                    : " from " + cell[l].count + " games")
                                : "no games"),
                          )
                          .join(", ");
                      return (
                        <td
                          key={col.key}
                          className={highlight(row.key, col.key)}
                          onMouseEnter={() =>
                            setHover({ row: row.key, column: col.key })
                          }
                          onFocus={() =>
                            setHover({ row: row.key, column: col.key })
                          }
                        >
                          <button
                            className="matrix-cell"
                            aria-label={label}
                            title={label}
                            onClick={() => setDetail({ row, column: col })}
                          >
                            {layouts.map((l) => (
                              <span
                                className={tone(
                                  cell?.[l].average || 0,
                                  cell?.[l].count || 0,
                                )}
                                key={l}
                              >
                                {cell?.[l].count
                                  ? cell[l].average.toFixed(1) +
                                    (data.manual.has(
                                      cellKey(row.key, col.key) + l,
                                    )
                                      ? "*"
                                      : "")
                                  : "—"}
                              </span>
                            ))}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          logged averages and are marked *. Unplayed matchups without manual
          estimates are excluded. Clearing a manual estimate restores the logs.
          All-patches mode uses logs only. Click a marked label again to unpin
          it; multiple axes can stay marked.
        </p>
      </details>
      {adding && (
        <Modal
          title="Add or update shared army list"
          onClose={() => setAdding(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await mutate({
                type: "matrixList",
                patchId: patch,
                army: choice,
              });
              setBusy(false);
              if (ok) setAdding(false);
            }}
          >
            <p>
              Shared with the team for this patch. The same faction, detachments
              and disposition update the existing configuration’s name and link.
            </p>
            <ArmyFields
              title="Matrix army"
              value={choice}
              onChange={setChoice}
            />
            <button className="primary" disabled={busy}>
              Save army list
            </button>
          </form>
        </Modal>
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
                {c.army.detachmentNames.join(" + ")} · {c.army.dispositionName}{" "}
                · {c.authorName} · {new Date(c.updatedAt).toLocaleString()}
              </p>
            ))}
        </details>
      )}
      {detail && (
        <Modal
          title={detail.column ? "Matchup detail" : "Army configuration"}
          onClose={() => setDetail(null)}
        >
          <h3>
            #{codes.get(detail.row.key)} · {detail.row.army.factionName}
          </h3>
          <p>
            {detail.row.army.detachmentNames.join(" + ") || "No detachments"} ·{" "}
            {detail.row.army.dispositionName}
          </p>
          {detail.column && (
            <>
              <h3>
                vs #{codes.get(detail.column.key)} ·{" "}
                {detail.column.army.factionName}
              </h3>
              <p>
                {detail.column.army.detachmentNames.join(" + ") ||
                  "No detachments"}{" "}
                · {detail.column.army.dispositionName}
              </p>
              {!patch && (
                <p>
                  Select a single rules patch to view or edit manual estimates.
                </p>
              )}
              {patch && (
                <p>
                  Manual estimates override logs for the team. The reverse
                  matchup automatically uses 20 minus your estimate. * marks
                  manual scores.
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
                        {patch && (
                          <form
                            key={
                              patch +
                              detail.row.key +
                              detail.column!.key +
                              l +
                              JSON.stringify(view.manualEstimates)
                            }
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const raw = new FormData(e.currentTarget).get(
                                "score",
                              ) as string;
                              setBusy(true);
                              await mutate({
                                type: "manualEstimate",
                                patchId: patch,
                                own: detail.row.army,
                                enemy: detail.column!.army,
                                layout: l,
                                score: raw === "" ? null : Number(raw),
                              });
                              setBusy(false);
                            }}
                          >
                            <Field label={"Manual layout " + l}>
                              <input
                                name="score"
                                type="number"
                                min={0}
                                max={20}
                                step="0.1"
                                placeholder="Use logs"
                                defaultValue={
                                  data.manual.has(
                                    cellKey(
                                      detail.row.key,
                                      detail.column!.key,
                                    ) + l,
                                  )
                                    ? data.effective.get(
                                        cellKey(
                                          detail.row.key,
                                          detail.column!.key,
                                        ),
                                      )?.[l].average
                                    : ""
                                }
                              />
                            </Field>
                            <button disabled={busy}>Save {l}</button>
                            <button
                              type="button"
                              disabled={
                                busy ||
                                !data.manual.has(
                                  cellKey(detail.row.key, detail.column!.key) +
                                    l,
                                )
                              }
                              onClick={async () => {
                                setBusy(true);
                                await mutate({
                                  type: "manualEstimate",
                                  patchId: patch,
                                  own: detail.row.army,
                                  enemy: detail.column!.army,
                                  layout: l,
                                  score: null,
                                });
                                setBusy(false);
                              }}
                            >
                              Use logs {l}
                            </button>
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
                                  <small className="matrix-attribution">
                                    {change.authorName} ·{" "}
                                    {new Date(
                                      change.updatedAt,
                                    ).toLocaleString()}
                                  </small>
                                )
                              );
                            })()}
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Leave a manual value blank and save to restore the logged
                average.
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
