"use client";
import { useId, useState } from "react";
import {
  cellKey,
  layouts,
  type MatrixArmy,
  type Matchup,
} from "@/lib/matchups";
import type { Layout } from "@/lib/types";
import { Disposition } from "./disposition";
import { ArmyListLink } from "./army-list-drawer";
import MatrixLayoutScore from "./matrix-layout-score";
import styles from "./mobile-matchups.module.css";

export default function MobileMatchups({
  rows,
  columns,
  data,
  rowNames,
  columnNames,
  preferredRow,
  full,
  onFull,
  onCell,
  onScore,
  onError,
}: {
  rows: MatrixArmy[];
  columns: MatrixArmy[];
  data: {
    effective: Map<string, Matchup>;
    manual: Set<string>;
    cells?: Map<string, Matchup>;
  };
  rowNames?: Record<string, string>;
  columnNames?: Record<string, string>;
  preferredRow?: string;
  full: boolean;
  onFull: (full: boolean) => void;
  onCell: (row: MatrixArmy, column: MatrixArmy) => void;
  onScore?: (
    row: MatrixArmy,
    column: MatrixArmy,
    layout: Layout,
    score: number | null,
  ) => Promise<void>;
  onError: (message: string) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(preferredRow || "");
  const [sort, setSort] = useState("name");
  const row =
    rows.find((r) => r.key === selected) ||
    rows.find((r) => r.key === preferredRow) ||
    rows[0];
  const name = (army: MatrixArmy, names?: Record<string, string>) =>
    names?.[army.key]
      ? `${names[army.key]} · ${army.army.factionName}`
      : army.army.listName || army.army.factionName;
  function average(column: MatrixArmy) {
    const cell = data.effective.get(cellKey(row.key, column.key));
    const scores = layouts.flatMap((layout) =>
      cell?.[layout]?.count ? [cell[layout].average] : [],
    );
    return scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null;
  }
  const opponents = [...columns].sort((a, b) => {
    if (sort === "name")
      return name(a, columnNames).localeCompare(name(b, columnNames));
    const av = average(a),
      bv = average(b);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return sort === "best" ? bv - av : av - bv;
  });
  return (
    <div className={styles.mobile}>
      <div className={styles.tabs} aria-label="Matrix display">
        <button
          type="button"
          aria-pressed={!full}
          onClick={() => onFull(false)}
        >
          Player view
        </button>
        <button type="button" aria-pressed={full} onClick={() => onFull(true)}>
          Full matrix
        </button>
      </div>
      {!full && row && (
        <>
          <label htmlFor={id}>Your player / army</label>
          <select
            id={id}
            value={row.key}
            onChange={(e) => setSelected(e.target.value)}
          >
            {rows.map((r) => (
              <option key={r.key} value={r.key}>
                {name(r, rowNames)}
              </option>
            ))}
          </select>
          <div className={styles.own}>
            <ArmyListLink url={row.army.listUrl} name={name(row, rowNames)}>
              {row.army.factionName}
            </ArmyListLink>
            <Disposition name={row.army.dispositionName} />
          </div>
          <label htmlFor={`${id}-sort`}>Sort opponents</label>
          <select
            id={`${id}-sort`}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="best">Best matchup</option>
            <option value="hardest">Hardest matchup</option>
          </select>
          <div className={styles.opponents}>
            {opponents.map((column) => {
              const key = cellKey(row.key, column.key);
              const cell = data.effective.get(key);
              const avg = average(column);
              return (
                <article
                  className={styles.opponent}
                  key={`${row.key}:${column.key}`}
                >
                  <div className={styles.heading}>
                    <div>
                      <ArmyListLink
                        url={column.army.listUrl}
                        name={name(column, columnNames)}
                        className={styles.listHeading}
                      >
                        <strong>{name(column, columnNames)}</strong>
                        <span>{column.army.factionName}</span>
                      </ArmyListLink>
                      <Disposition name={column.army.dispositionName} />
                      <p>{column.army.detachmentNames.join(" + ")}</p>
                    </div>
                    <div className={styles.average}>
                      <strong>
                        {avg === null ? "—" : Math.round(avg * 10) / 10}
                      </strong>
                      <small>Average</small>
                    </div>
                  </div>
                  <div className={styles.scores}>
                    {layouts.map((layout) => (
                      <div key={layout}>
                        <small>Layout {layout}</small>
                        <MatrixLayoutScore
                          label={`Layout ${layout}: ${name(row, rowNames)} versus ${name(column, columnNames)}`}
                          value={cell?.[layout]}
                          logged={data.cells?.get(key)?.[layout]}
                          manual={data.manual.has(key + layout)}
                          onSave={
                            onScore
                              ? (score) => onScore(row, column, layout, score)
                              : undefined
                          }
                          onError={onError}
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => onCell(row, column)}
                      aria-label={`Matchup details against ${name(column, columnNames)}`}
                    >
                      Details
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
