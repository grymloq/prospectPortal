"use client";
import { FactionName } from "./faction-avatar";
import { useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  armyKey,
  cellKey,
  layouts,
  type MatrixArmy,
  type Matchup,
} from "@/lib/matchups";
import type { Layout } from "@/lib/types";
import MatrixLayoutScore from "./matrix-layout-score";
import { Disposition } from "./disposition";
import { MatrixArmyLabel, useMatrixArchetypes } from "./matrix-army-label";
import MobileMatchups from "./mobile-matchups";
import mobileStyles from "./mobile-matchups.module.css";
function MatchupTooltip({
  row,
  column,
  children,
}: {
  row: MatrixArmy;
  column: MatrixArmy;
  children: (id?: string) => ReactNode;
}) {
  const id = useId();
  const [anchor, setAnchor] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  function show(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setAnchor({
      left: Math.max(
        8,
        Math.min(
          rect.left,
          window.innerWidth - Math.min(360, window.innerWidth - 16) - 8,
        ),
      ),
      ...(rect.top > 220
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
    });
  }
  return (
    <div
      className="matrix-tooltip-target"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setAnchor(null)}
      onClickCapture={() => setAnchor(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setAnchor(null);
      }}
    >
      {children(anchor ? id : undefined)}
      {anchor &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="matrix-matchup-tooltip"
            style={anchor}
          >
            {[row, column].map((item, i) => (
              <div className="matrix-tooltip-army" key={i}>
                <div className="matrix-tooltip-heading">
                  <FactionName name={item.army.factionName} /> -{" "}
                  <Disposition name={item.army.dispositionName} />
                </div>
                <div>
                  {item.army.detachmentNames.join(" + ") || "No detachments"}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
function armyDescription(item: MatrixArmy) {
  return [
    item.army.listName || "",
    item.army.factionName,
    item.army.detachmentNames.join(" + ") || "No detachments",
    item.army.dispositionName,
  ]
    .filter(Boolean)
    .join(" · ");
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
const toggle = (keys: string[], key: string) =>
  keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
export default function MatchupTable({
  rows,
  columns,
  visibleRows = rows,
  visibleColumns = columns,
  data,
  highlight,
  hoverChange: setHover,
  markedRows,
  markedColumns,
  markRows: setMarkedRows,
  markColumns: setMarkedColumns,
  averageBadge,
  onCell,
  onScore,
  rowNames,
  columnNames,
  showAverages = true,
  averageAxes = false,
  patchId,
  revision,
  preferredRow,
}: {
  preferredRow?: string;
  rowNames?: Record<string, string>;
  columnNames?: Record<string, string>;
  showAverages?: boolean;
  averageAxes?: boolean;
  patchId?: string;
  revision?: object;
  // Data and callbacks stay own-first; the table renders opponents as rows.
  rows: MatrixArmy[];
  columns: MatrixArmy[];
  visibleRows?: MatrixArmy[];
  visibleColumns?: MatrixArmy[];
  data: {
    effective: Map<string, Matchup>;
    manual: Set<string>;
    cells?: Map<string, Matchup>;
  };
  highlight: (row?: string, column?: string) => string;
  hoverChange: (value: { row?: string; column?: string }) => void;
  markedRows: string[];
  markedColumns: string[];
  markRows: (keys: string[]) => void;
  markColumns: (keys: string[]) => void;
  averageBadge: (key: string, opponents: string[]) => ReactNode;
  onCell: (row: MatrixArmy, column: MatrixArmy) => void;
  onScore?: (
    row: MatrixArmy,
    column: MatrixArmy,
    layout: Layout,
    score: number | null,
  ) => Promise<void>;
}) {
  const description = (item: MatrixArmy) =>
    [rowNames?.[item.key] || columnNames?.[item.key], armyDescription(item)]
      .filter(Boolean)
      .join(" · ");
  const archetypes = useMatrixArchetypes(patchId, revision);
  const [error, setError] = useState("");
  const [fullMobile, setFullMobile] = useState(false);
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <MobileMatchups
        rows={rows}
        columns={columns}
        data={data}
        rowNames={rowNames}
        columnNames={columnNames}
        archetypes={archetypes}
        preferredRow={preferredRow}
        full={fullMobile}
        onFull={setFullMobile}
        onCell={onCell}
        onScore={onScore}
        onError={setError}
      />
      <div className={fullMobile ? mobileStyles.full : mobileStyles.desktop}>
        <div
          className="matrix-scroll"
          role="region"
          tabIndex={0}
          aria-label="Compact matchup matrix"
        >
          <table
            className="matchup-table"
            style={{
              minWidth: 190 + (averageAxes ? 40 : 0) + visibleRows.length * 140,
            }}
            onMouseLeave={() => setHover({})}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setHover({});
            }}
          >
            <caption className="sr-only">
              Scores from our players’ perspective against opponents on layouts
              A, B, C
            </caption>
            <colgroup>
              <col style={{ width: 190 }} />
              {averageAxes && <col style={{ width: 40 }} />}
              {visibleRows.map((own) => (
                <col key={own.key} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Opponents ↓ / Our players →</th>
                {averageAxes && (
                  <th scope="col" className="matrix-average-axis">
                    <span className="sr-only">Opponent average</span>
                  </th>
                )}
                {visibleRows.map((a) => (
                  <th
                    scope="col"
                    key={a.key}
                    className={`matrix-markable-heading ${highlight(a.key)}`}
                    onMouseEnter={() => setHover({ row: a.key })}
                    onFocus={() => setHover({ row: a.key })}
                  >
                    <button
                      type="button"
                      className="matrix-heading-highlight"
                      aria-label={`Highlight column ${description(a)}`}
                      aria-pressed={markedRows.includes(a.key)}
                      onClick={() => setMarkedRows(toggle(markedRows, a.key))}
                    />
                    <MatrixArmyLabel
                      item={a}
                      name={rowNames?.[a.key]}
                      side="own"
                    />
                    {showAverages &&
                      averageBadge(
                        a.key,
                        columns.map((r) => r.key),
                      )}
                    <div className="matrix-layout-labels">
                      <span>A</span>
                      <span>B</span>
                      <span>C</span>
                    </div>
                  </th>
                ))}
              </tr>
              {averageAxes && (
                <tr className="matrix-average-row">
                  <th scope="row">
                    <span className="sr-only">Player averages</span>
                  </th>
                  <td className="matrix-average-axis" />
                  {visibleRows.map((row) => (
                    <td key={row.key}>
                      {averageBadge(
                        row.key,
                        columns.map((column) => column.key),
                      )}
                    </td>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {visibleColumns.map((col) => (
                <tr key={col.key}>
                  <th
                    scope="row"
                    className={`matrix-markable-heading ${highlight(undefined, col.key)}`}
                    onMouseEnter={() => setHover({ column: col.key })}
                    onFocus={() => setHover({ column: col.key })}
                  >
                    <button
                      type="button"
                      className="matrix-heading-highlight"
                      aria-label={`Highlight row ${description(col)}`}
                      aria-pressed={markedColumns.includes(col.key)}
                      onClick={() =>
                        setMarkedColumns(toggle(markedColumns, col.key))
                      }
                    />
                    <MatrixArmyLabel
                      item={col}
                      name={columnNames?.[col.key]}
                      side="opponent"
                      archetype={archetypes[armyKey(col.army)]}
                    />
                    {showAverages &&
                      averageBadge(
                        col.key,
                        rows.map((a) => a.key),
                      )}
                  </th>
                  {averageAxes && (
                    <td className="matrix-average-axis">
                      {averageBadge(
                        col.key,
                        rows.map((row) => row.key),
                      )}
                    </td>
                  )}
                  {visibleRows.map((row) => {
                    const cell = data.effective.get(cellKey(row.key, col.key));
                    return (
                      <td
                        key={row.key}
                        className={highlight(row.key, col.key)}
                        onMouseEnter={() =>
                          setHover({ row: row.key, column: col.key })
                        }
                        onFocus={() =>
                          setHover({ row: row.key, column: col.key })
                        }
                      >
                        <MatchupTooltip row={row} column={col}>
                          {(tooltipId) => (
                            <div className="matrix-cell-group">
                              <div
                                className="matrix-cell"
                                aria-describedby={tooltipId}
                              >
                                {layouts.map((layout) => (
                                  <MatrixLayoutScore
                                    key={layout}
                                    label={`Layout ${layout}: ${description(row)} versus ${description(col)}`}
                                    value={cell?.[layout]}
                                    logged={
                                      data.cells?.get(
                                        cellKey(row.key, col.key),
                                      )?.[layout]
                                    }
                                    manual={data.manual.has(
                                      cellKey(row.key, col.key) + layout,
                                    )}
                                    onSave={
                                      onScore
                                        ? (score) =>
                                            onScore(row, col, layout, score)
                                        : undefined
                                    }
                                    onError={setError}
                                  />
                                ))}
                              </div>
                              <button
                                type="button"
                                className="matrix-cell-details"
                                aria-label={`Details: ${description(row)} versus ${description(col)}`}
                                aria-describedby={tooltipId}
                                onClick={() => onCell(row, col)}
                              >
                                ···
                              </button>
                            </div>
                          )}
                        </MatchupTooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function MatrixAverageBadge({
  data,
  keyId: key,
  opponents,
  numberOnly = false,
}: {
  data: { effective: Map<string, Matchup> };
  keyId: string;
  opponents: string[];
  numberOnly?: boolean;
}) {
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
      {!numberOnly && "Avg "}
      {values.length ? average.toFixed(1) : numberOnly ? "" : "—"}
    </span>
  );
}
