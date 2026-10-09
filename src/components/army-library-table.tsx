"use client";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ArmyLibraryDTO, LibraryQuery, LibraryTarget } from "@/lib/types";
import { FactionName } from "./faction-avatar";
import { Disposition } from "./disposition";
import styles from "./army-library-table.module.css";

export function ArmyLibraryTable({
  library,
  sort = "name",
  segmented,
  onSort,
  onOpen,
}: {
  library: ArmyLibraryDTO;
  sort?: LibraryQuery["sort"];
  segmented: boolean;
  onSort: (sort: LibraryQuery["sort"]) => void;
  onOpen: (target: LibraryTarget) => void;
}) {
  const lists = library.tab === "lists";
  const rows = lists ? library.lists : library.archetypes;
  function sortable(label: string, key: NonNullable<LibraryQuery["sort"]>) {
    const active = sort === key;
    const Icon = active ? (key === "name" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th
        scope="col"
        aria-sort={
          active ? (key === "name" ? "ascending" : "descending") : "none"
        }
      >
        <button
          type="button"
          className={styles.sort}
          aria-label={`Sort by ${label.toLowerCase()}`}
          onClick={() => onSort(key)}
        >
          {label}
          <Icon size={13} aria-hidden="true" />
        </button>
      </th>
    );
  }
  return (
    <>
      <div
        className={`table-scroll ${styles.scroll}`}
        tabIndex={0}
        role="region"
        aria-label={lists ? "Shared army list table" : "Army archetype table"}
      >
        <table className={styles.table}>
          <caption className="sr-only">
            {lists ? "Shared army lists" : "Consolidated army archetypes"}.
            Select a row to view details.
          </caption>
          <thead>
            <tr>
              {sortable(lists ? "Army list" : "Archetype", "name")}
              {lists && <th scope="col">Owner</th>}
              <th scope="col">Faction</th>
              <th scope="col">Detachments</th>
              <th scope="col">Disposition</th>
              <th scope="col">Ruleset</th>
              {lists ? (
                <th scope="col">Roster</th>
              ) : (
                <>
                  <th scope="col">Lists</th>
                  <th scope="col">Variations</th>
                </>
              )}
              {sortable("Average /20", "score")}
              {sortable("Matches", "matches")}
              <th scope="col">Contributors</th>
              <th scope="col">Recent trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const saved = "ownerName" in row;
              const target: LibraryTarget = {
                kind: lists ? "list" : "archetype",
                id: row.id,
              };
              const patchIds = saved ? [row.patchId] : row.patchIds;
              return (
                <tr
                  key={row.id}
                  className={styles.row}
                  tabIndex={0}
                  aria-label={`View ${row.name}`}
                  onClick={() => onOpen(target)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      onOpen(target);
                    }
                  }}
                >
                  <td className={styles.identity}>
                    <button
                      type="button"
                      className={styles.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(target);
                      }}
                    >
                      {row.name}
                    </button>
                    {saved && row.kind === "matrix" && (
                      <small>Configuration only</small>
                    )}
                  </td>
                  {saved && <td>{row.ownerName}</td>}
                  <td>
                    <FactionName name={row.army.factionName} />
                  </td>
                  <td>
                    {row.army.detachmentNames.length ? (
                      row.army.detachmentNames.map((name, index) => (
                        <span className={styles.line} key={`${index}:${name}`}>
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className={styles.muted}>
                        No recorded detachments
                      </span>
                    )}
                  </td>
                  <td>
                    <Disposition name={row.army.dispositionName} />
                  </td>
                  <td>
                    {patchIds.map((id) => {
                      const patch = library.patches.find((p) => p.id === id);
                      return (
                        <span className={styles.patch} key={id}>
                          {patch?.name || "Unknown ruleset"}
                          {patch && <small>{patch.date}</small>}
                        </span>
                      );
                    })}
                  </td>
                  {saved ? (
                    <td>
                      {row.kind === "matrix"
                        ? "No roster"
                        : row.compositionStatus === "complete"
                          ? "Complete"
                          : row.compositionStatus === "partial"
                            ? "Partial"
                            : "Unclassified"}
                    </td>
                  ) : (
                    <>
                      <td className={styles.number}>
                        {row.publicLists}
                        <small>{row.unclassifiedLists} unclassified</small>
                      </td>
                      <td className={styles.number}>{row.variations}</td>
                    </>
                  )}
                  <td className={styles.number}>
                    {segmented ? (
                      <span className={styles.muted}>By ruleset</span>
                    ) : row.metrics.averageScore === null ? (
                      <>
                        <span aria-label="No recorded average">—</span>
                        <small>No recorded score</small>
                      </>
                    ) : (
                      <strong>{row.metrics.averageScore.toFixed(1)}</strong>
                    )}
                  </td>
                  <td className={styles.number}>
                    {row.metrics.recordedMatches}
                    <small>{row.metrics.appearances} appearances</small>
                  </td>
                  <td className={styles.number}>{row.metrics.contributors}</td>
                  <td className={styles.trend}>
                    {segmented ? (
                      <span className={styles.muted}>By ruleset</span>
                    ) : row.recentTrend ? (
                      <>
                        <strong>
                          {row.recentTrend.change >= 0 ? "+" : ""}
                          {row.recentTrend.change.toFixed(1)} /20
                        </strong>
                        <small>
                          {row.recentTrend.from} → {row.recentTrend.to}
                        </small>
                        <small>
                          {row.recentTrend.previousMatches} →{" "}
                          {row.recentTrend.currentMatches} matches
                        </small>
                      </>
                    ) : (
                      <span className={styles.muted}>Insufficient data</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Scroll horizontally to view all columns. Matches are distinct recorded
        games; appearances count contributed army perspectives.{" "}
        {segmented
          ? "Scores and trends are separated by ruleset."
          : "Trend shows the change in observed average score."}
      </p>
    </>
  );
}
