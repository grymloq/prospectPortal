"use client";
import type { ReactNode, KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  ArmyLibraryDTO,
  LibraryArchetypeRow,
  LibraryListRow,
  LibraryQuery,
} from "@/lib/types";
import { FactionName } from "./faction-avatar";
import { Disposition } from "./disposition";
import { ArmyUnitChange } from "./army-unit-change";
import { ArmyLoadoutChanges } from "./army-loadout-changes";
import { DetachmentName, DetachmentNames } from "./detachment-name";
import styles from "./army-library-table.module.css";

type DataRow = LibraryListRow | LibraryArchetypeRow;
type FactionRow = ArmyLibraryDTO["factionGroups"][number];

function RowName({
  name,
  label,
  expanded,
  onToggle,
  children,
}: {
  name: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      className={styles.name}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}: ${name}`}
      aria-expanded={expanded}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Chevron size={14} aria-hidden="true" />
      <span>{children || name}</span>
    </button>
  );
}
function rowEvents(onToggle: () => void) {
  return {
    tabIndex: 0,
    onClick: onToggle,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (
        e.target === e.currentTarget &&
        (e.key === "Enter" || e.key === " ")
      ) {
        e.preventDefault();
        onToggle();
      }
    },
  };
}
export function ArmyLibraryFactionRow({
  row,
  expanded,
  onToggle,
}: {
  row: FactionRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      className={`${styles.row} ${styles.faction}`}
      data-level="faction"
      aria-label={`${expanded ? "Collapse" : "Expand"} faction: ${row.name}`}
      {...rowEvents(onToggle)}
    >
      <td>
        <RowName
          name={row.name}
          label="faction"
          expanded={expanded}
          onToggle={onToggle}
        >
          <FactionName name={row.name} />
        </RowName>
        <small>
          {row.archetypes} {row.archetypes === 1 ? "archetype" : "archetypes"}
        </small>
      </td>
      {Array.from({ length: 5 }, (_, i) => (
        <td key={i} />
      ))}
      <td className={styles.number}>{row.lists}</td>
      {Array.from({ length: 5 }, (_, i) => (
        <td key={i} />
      ))}
    </tr>
  );
}
export function ArmyLibraryDataRow({
  row,
  patches,
  segmented,
  expanded,
  onToggle,
  onDetails,
  onDefault,
  writing = false,
}: {
  row: DataRow;
  patches: ArmyLibraryDTO["patches"];
  segmented: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDetails: () => void;
  onDefault?: () => void;
  writing?: boolean;
}) {
  const list = "ownerName" in row;
  const level = list ? "list" : "archetype";
  const patchIds = list ? [row.patchId] : row.patchIds;
  const prefix = `${row.army.factionName} — `;
  const label =
    !list && row.name.startsWith(prefix) ? (
      <>
        <DetachmentNames
          names={row.army.detachmentNames}
          focusable={false}
          fallback="No recorded detachments"
        />{" "}
        — {row.army.dispositionName}
      </>
    ) : (
      row.name
    );
  return (
    <tr
      className={`${styles.row} ${list ? styles.list : styles.archetype}`}
      data-level={level}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${level}: ${row.name}`}
      {...rowEvents(onToggle)}
    >
      <td>
        <div className={list ? styles.listLabel : styles.archetypeLabel}>
          <RowName
            name={row.name}
            label={level}
            expanded={expanded}
            onToggle={onToggle}
          >
            {label}
          </RowName>
          <small>
            {list
              ? row.kind === "matrix"
                ? "Configuration only"
                : "List"
              : "Archetype"}
          </small>
          {list && (
            <button
              type="button"
              className={styles.details}
              aria-label={`View List: ${row.name}`}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                if (!expanded) onToggle();
              }}
            >
              View List
            </button>
          )}
          <button
            type="button"
            className={styles.details}
            aria-label={`View ${level} details: ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDetails();
            }}
          >
            Details
          </button>
          {list && onDefault && (
            <button
              type="button"
              className={styles.details}
              disabled={writing}
              aria-label={`${row.norm?.isDefault ? "Clear" : "Set"} archetype default: ${row.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onDefault();
              }}
            >
              {row.norm?.isDefault ? "Clear default" : "Set as default"}
            </button>
          )}
        </div>
      </td>
      <td>{list ? row.ownerName : null}</td>
      <td>
        {!list &&
          (row.army.detachmentNames.length ? (
            row.army.detachmentNames.map((name, index) => (
              <span className={styles.line} key={`${index}:${name}`}>
                <DetachmentName name={name} />
              </span>
            ))
          ) : (
            <span className={styles.muted}>No recorded detachments</span>
          ))}
      </td>
      <td>{!list && <Disposition name={row.army.dispositionName} />}</td>
      <td>
        {patchIds.map((id) => {
          const patch = patches.find((p) => p.id === id);
          return (
            <span className={styles.line} key={id}>
              {patch?.name || "Unknown ruleset"}
              {patch && <small>{patch.date}</small>}
            </span>
          );
        })}
      </td>
      <td>
        {list &&
          (row.norm?.isDefault ? (
            <strong>Default</strong>
          ) : row.norm?.status === "same" &&
            !row.norm.loadoutDeviations.length ? (
            <span>
              {row.norm.compositionMatches === false
                ? "Loadout differs"
                : "Standard units"}
            </span>
          ) : row.norm?.status === "different" ||
            row.norm?.status === "same" ? (
            <>
              {row.norm.deviations.map((unit) => (
                <span className={styles.line} key={unit.sourceId}>
                  <ArmyUnitChange unit={unit} />
                </span>
              ))}
              <ArmyLoadoutChanges changes={row.norm.loadoutDeviations} />
            </>
          ) : (
            <span className={styles.muted}>
              {row.norm?.status === "no-standard"
                ? "No standard yet"
                : row.compositionStatus === "partial"
                  ? "Incomplete unit data"
                  : "Unit data unavailable"}
            </span>
          ))}
      </td>
      <td className={styles.number}>
        {!list && (
          <>
            {row.publicLists}
            <small>{row.unclassifiedLists} unclassified</small>
          </>
        )}
      </td>
      <td className={styles.number}>{!list && row.variations}</td>
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
      <td className={styles.number}>
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
}
export function ArmyLibraryInlineRow({ children }: { children: ReactNode }) {
  return (
    <tr data-level="content">
      <td colSpan={12} className={styles.expanded}>
        <div>{children}</div>
      </td>
    </tr>
  );
}
export function ArmyLibraryTable({
  sort = "name",
  segmented,
  onSort,
  children,
}: {
  sort?: LibraryQuery["sort"];
  segmented: boolean;
  onSort: (sort: LibraryQuery["sort"]) => void;
  children: ReactNode;
}) {
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
        aria-label="Army library table"
      >
        <table className={styles.table}>
          <caption className="sr-only">
            Shared army library. Expand factions, archetypes and lists to browse
            their contents.
          </caption>
          <thead>
            <tr>
              {sortable("Army", "name")}
              <th scope="col">Owner</th>
              <th scope="col">Detachments</th>
              <th scope="col">Disposition</th>
              <th scope="col">Ruleset</th>
              <th scope="col">Unit changes</th>
              <th scope="col">Lists</th>
              <th scope="col">Variations</th>
              {sortable("Average /20", "score")}
              {sortable("Matches", "matches")}
              <th scope="col">Contributors</th>
              <th scope="col">Recent trend</th>
            </tr>
          </thead>
          <tbody>{children}</tbody>
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
