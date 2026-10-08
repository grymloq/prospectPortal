"use client";
import { useState, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  cellKey,
  layouts,
  type MatrixArmy,
  type Matchup,
} from "@/lib/matchups";
import type { Layout } from "@/lib/types";
import MatrixLayoutScore from "./matrix-layout-score";
import { Disposition } from "./disposition";
import { ArmyListLink } from "./army-list-drawer";
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
                  {item.army.factionName} -{" "}
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
  opponentDetails = false,
  preferredRow,
}: {
  preferredRow?: string;
  rowNames?: Record<string, string>;
  columnNames?: Record<string, string>;
  showAverages?: boolean;
  averageAxes?: boolean;
  opponentDetails?: boolean;
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
            onMouseLeave={() => setHover({})}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setHover({});
            }}
          >
            <caption className="sr-only">
              Average scores for row army against column army on layouts A, B, C
            </caption>
            <thead>
              <tr>
                <th scope="col">Row ↓ / Opponent →</th>
                {averageAxes && (
                  <th scope="col" className="matrix-average-axis">
                    <span className="sr-only">Player average</span>
                  </th>
                )}
                {visibleColumns.map((a) => (
                  <th
                    scope="col"
                    key={a.key}
                    className={highlight(undefined, a.key)}
                    onMouseEnter={() => setHover({ column: a.key })}
                    onFocus={() => setHover({ column: a.key })}
                  >
                    <ArmyListLink
                      url={a.army.listUrl}
                      name={description(a)}
                      className="matrix-list-label"
                      title={description(a)}
                      pressed={markedColumns.includes(a.key)}
                      onActivate={() =>
                        setMarkedColumns(toggle(markedColumns, a.key))
                      }
                    >
                      {opponentDetails ? (
                        <>
                          <span>{a.army.factionName}</span>
                          <span>
                            {a.army.detachmentNames.join(" + ") ||
                              "No detachments"}
                          </span>
                          <span className="matrix-army-heading">
                            <Disposition name={a.army.dispositionName} />
                          </span>
                        </>
                      ) : columnNames?.[a.key] ? (
                        <>
                          <span className="matrix-team-name">
                            {columnNames[a.key]} - {a.army.factionName}
                          </span>
                          <span className="matrix-army-heading">
                            <Disposition name={a.army.dispositionName} />
                          </span>
                        </>
                      ) : (
                        <>
                          {" "}
                          <span className="matrix-army-heading">
                            {a.army.factionName} -{" "}
                            <Disposition name={a.army.dispositionName} />
                          </span>
                          <small>{a.army.listName || a.army.factionName}</small>
                        </>
                      )}
                    </ArmyListLink>
                    {showAverages &&
                      averageBadge(
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
              {averageAxes && (
                <tr className="matrix-average-row">
                  <th scope="row">
                    <span className="sr-only">Opponent averages</span>
                  </th>
                  <td className="matrix-average-axis" />
                  {visibleColumns.map((column) => (
                    <td key={column.key}>
                      {averageBadge(
                        column.key,
                        rows.map((row) => row.key),
                      )}
                    </td>
                  ))}
                </tr>
              )}
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
                    <ArmyListLink
                      url={row.army.listUrl}
                      name={description(row)}
                      className="matrix-list-label"
                      title={description(row)}
                      pressed={markedRows.includes(row.key)}
                      onActivate={() =>
                        setMarkedRows(toggle(markedRows, row.key))
                      }
                    >
                      {rowNames?.[row.key] ? (
                        <>
                          <span className="matrix-team-name">
                            {rowNames[row.key]} - {row.army.factionName}
                          </span>
                          <span className="matrix-army-heading">
                            <Disposition name={row.army.dispositionName} />
                          </span>
                        </>
                      ) : (
                        <>
                          {" "}
                          <span className="matrix-army-heading">
                            {row.army.factionName} -{" "}
                            <Disposition name={row.army.dispositionName} />
                          </span>
                          <small>
                            {row.army.listName || row.army.factionName}
                          </small>
                        </>
                      )}
                    </ArmyListLink>
                    {showAverages &&
                      averageBadge(
                        row.key,
                        columns.map((a) => a.key),
                      )}
                  </th>
                  {averageAxes && (
                    <td className="matrix-average-axis">
                      {averageBadge(
                        row.key,
                        columns.map((column) => column.key),
                      )}
                    </td>
                  )}
                  {visibleColumns.map((col) => {
                    const cell = data.effective.get(cellKey(row.key, col.key));
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
