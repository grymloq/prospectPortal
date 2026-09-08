"use client";
import { useMemo, useState } from "react";
import type { View } from "@/lib/types";
import {
  buildMatchups,
  cellKey,
  layouts,
  type MatrixArmy,
  type Matchup,
} from "@/lib/matchups";
import { Empty } from "./ui";

type Filter = { factions: string[]; lists: string[] };
const emptyFilter = (): Filter => ({ factions: [], lists: [] });
function description(item: MatrixArmy) {
  return [
    item.army.factionName,
    item.army.detachmentNames.join(" + ") || "No detachments",
    item.army.dispositionName,
  ].join(" · ");
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
function ArmyLabel({ item }: { item: MatrixArmy }) {
  return (
    <div className="matrix-army">
      <strong>{item.army.factionName}</strong>
      <span>{item.army.detachmentNames.join(" + ") || "No detachments"}</span>
      <small>{item.army.dispositionName}</small>
    </div>
  );
}
function Estimates({ cell }: { cell?: Matchup }) {
  const observed = cell
    ? layouts.map((l) => cell[l]).filter((e) => e.count)
    : [];
  const spread =
    observed.length > 1
      ? Math.max(...observed.map((e) => e.average)) -
        Math.min(...observed.map((e) => e.average))
      : null;
  return (
    <div className="matrix-estimates">
      {layouts.map((layout) => {
        const e = cell?.[layout],
          has = !!e?.count;
        return (
          <div
            key={layout}
            className={
              has
                ? e.average > 10
                  ? "matrix-win"
                  : e.average < 10
                    ? "matrix-loss"
                    : "matrix-draw"
                : "matrix-unknown"
            }
          >
            <span>Layout {layout}</span>
            <strong>{has ? e.average.toFixed(1) : "—"}</strong>
            <small>
              {has
                ? e.count + " " + (e.count === 1 ? "game" : "games")
                : "No games"}
            </small>
          </div>
        );
      })}
      <small className="matrix-spread">
        {spread === null
          ? "Layout difference: —"
          : "Layout difference: " + spread.toFixed(1) + " pts"}
      </small>
    </div>
  );
}
export default function MatchupMatrix({ view }: { view: View }) {
  const data = useMemo(() => buildMatchups(view.games), [view.games]);
  const [y, setY] = useState<Filter>(emptyFilter),
    [x, setX] = useState<Filter>(emptyFilter);
  const [yPage, setYPage] = useState(0),
    [xPage, setXPage] = useState(0);
  function filtered(filter: Filter) {
    return data.armies.filter(
      (a) =>
        (!filter.factions.length || filter.factions.includes(a.army.faction)) &&
        (!filter.lists.length || filter.lists.includes(a.key)),
    );
  }
  const rows = filtered(y),
    columns = filtered(x),
    rowSize = 12,
    columnSize = 6;
  const yp = Math.min(yPage, Math.max(0, Math.ceil(rows.length / rowSize) - 1)),
    xp = Math.min(
      xPage,
      Math.max(0, Math.ceil(columns.length / columnSize) - 1),
    );
  const visibleRows = rows.slice(yp * rowSize, (yp + 1) * rowSize),
    visibleColumns = columns.slice(xp * columnSize, (xp + 1) * columnSize);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MATCHUP INTELLIGENCE</div>
          <h1>Matchup matrix</h1>
          <p>Average team scores, split by table layout.</p>
        </div>
        <button
          onClick={() => {
            setY(emptyFilter());
            setX(emptyFilter());
            setYPage(0);
            setXPage(0);
          }}
        >
          Reset filters
        </button>
      </div>
      <section className="panel padded matrix-intro">
        <strong>
          {data.included} games with a layout · {data.armies.length} army
          configurations
        </strong>
        <p>
          Scores are out of 20, from the{" "}
          <strong>row (Y) army’s perspective</strong> against the column (X)
          army. Reverse matchups use 20 minus the recorded score.
        </p>
        <p>
          {view.me.role === "admin"
            ? "Based on all players’ game logs."
            : "Based on your own game logs."}{" "}
          These are observed averages, not predictions for unplayed matchups.
          Counts are journal entries.
        </p>
        {data.missingLayout > 0 && (
          <p className="matrix-warning">
            {data.missingLayout} older games have no layout recorded and are
            excluded from the estimates. Edit those game logs to include them.
          </p>
        )}
      </section>
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
      <section className="panel">
        <div className="matrix-navigation">
          <div>
            <span>
              Rows {rows.length ? yp * rowSize + 1 : 0}–
              {Math.min((yp + 1) * rowSize, rows.length)} of {rows.length}
            </span>
            <button
              aria-label="Previous matrix rows"
              disabled={yp === 0}
              onClick={() => setYPage(yp - 1)}
            >
              ←
            </button>
            <button
              aria-label="Next matrix rows"
              disabled={(yp + 1) * rowSize >= rows.length}
              onClick={() => setYPage(yp + 1)}
            >
              →
            </button>
          </div>
          <div>
            <span>
              Columns {columns.length ? xp * columnSize + 1 : 0}–
              {Math.min((xp + 1) * columnSize, columns.length)} of{" "}
              {columns.length}
            </span>
            <button
              aria-label="Previous matrix columns"
              disabled={xp === 0}
              onClick={() => setXPage(xp - 1)}
            >
              ←
            </button>
            <button
              aria-label="Next matrix columns"
              disabled={(xp + 1) * columnSize >= columns.length}
              onClick={() => setXPage(xp + 1)}
            >
              →
            </button>
          </div>
        </div>
        {!rows.length || !columns.length ? (
          <Empty
            title="No matchups to display"
            description="Log games with layouts A, B, or C, or adjust the axis filters."
          />
        ) : (
          <div
            className="matrix-scroll"
            tabIndex={0}
            role="region"
            aria-label="Matchup scores by row and column army"
          >
            <table className="matchup-table">
              <caption className="sr-only">
                Average scores for each row army against each column army, by
                layout A, B, and C.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Your score: Y → X</th>
                  {visibleColumns.map((a) => (
                    <th scope="col" key={a.key}>
                      <ArmyLabel item={a} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">
                      <ArmyLabel item={row} />
                    </th>
                    {visibleColumns.map((col) => (
                      <td key={col.key}>
                        <Estimates
                          cell={data.cells.get(cellKey(row.key, col.key))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="matrix-footnote">
          Army lists are grouped by faction + the same detachments +
          disposition. Detachment order and list links do not split a group.
          Layout difference is the highest minus lowest observed layout average.
          Identical-list mirrors average both sides (10 points) and count each
          game once.
        </p>
      </section>
    </>
  );
}
