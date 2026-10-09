"use client";
import { Fragment, useEffect, useState } from "react";
import type {
  ArmyLibraryDTO,
  LibraryArchetypeRow,
  LibraryListRow,
  LibraryQuery,
  LibraryTarget,
} from "@/lib/types";
import {
  ArmyLibraryTable,
  ArmyLibraryDataRow,
  ArmyLibraryFactionRow,
  ArmyLibraryInlineRow,
} from "./army-library-table";
import { ArmyListLink } from "./army-list-drawer";
import { ArmyLibraryUnitComparison } from "./army-library-unit-comparison";
import { ArmyRoster } from "./army-roster";
import styles from "./army-library-hierarchy.module.css";

type Navigation = {
  query: LibraryQuery;
  revision: object;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onSort: (sort: LibraryQuery["sort"]) => void;
  onOpen: (target: LibraryTarget, versionId?: string) => void;
  onDefault?: (row: LibraryListRow) => void;
  writing?: boolean;
};
function countLabel(count: number, noun: string) {
  return `${count} ${count === 1 ? noun.slice(0, -1) : noun}`;
}
function useLibrary(query: LibraryQuery, revision: object) {
  const key = JSON.stringify(query);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    revision: object;
    data?: ArmyLibraryDTO;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const current = JSON.parse(key) as LibraryQuery;
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(current)) {
      if (name === "target" || value === undefined || value === "") continue;
      if (Array.isArray(value)) value.forEach((id) => params.append(name, id));
      else params.set(name, String(value));
    }
    if (current.target) {
      params.set("targetKind", current.target.kind);
      params.set("targetId", current.target.id);
    }
    fetch(`/api/army-library?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not load shared armies.");
        if (!controller.signal.aborted)
          setResult({ key, attempt, revision, data: payload.library });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, attempt, revision, error: error.message });
      });
    return () => controller.abort();
  }, [key, attempt, revision]);
  const current =
    result?.key === key &&
    result.attempt === attempt &&
    result.revision === revision
      ? result
      : undefined;
  return { ...current, retry: () => setAttempt((n) => n + 1) };
}
function Pending({ error, retry }: { error?: string; retry: () => void }) {
  return error ? (
    <div role="alert" className={styles.status}>
      {error}{" "}
      <button className="small" onClick={retry}>
        Retry
      </button>
    </div>
  ) : (
    <p role="status" className={styles.status}>
      Loading shared armies…
    </p>
  );
}
function Pages({
  page,
  total,
  pageSize,
  name,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  name: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className={styles.pages}>
      <span>
        {countLabel(total, name)}
        {pages > 1 && ` · Page ${page} / ${pages}`}
      </span>
      {pages > 1 && (
        <>
          <button
            className="small"
            aria-label={`Previous ${name}`}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="small"
            aria-label={`Next ${name}`}
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
function ListPreview({
  row,
  navigation,
}: {
  row: LibraryListRow;
  navigation: Navigation;
}) {
  const { data, error, retry } = useLibrary(
    {
      ...navigation.query,
      faction: undefined,
      search: undefined,
      detachments: undefined,
      disposition: undefined,
      page: 1,
      relatedPage: 1,
      target: { kind: "list", id: row.id },
      versionId: row.versionId,
    },
    navigation.revision,
  );
  const detail = data?.detail;
  if (!detail) return <Pending error={error} retry={retry} />;
  return (
    <section
      className={styles.preview}
      aria-label={`List overview: ${row.name}`}
    >
      <div className={styles.actions}>
        <button
          className="small"
          onClick={() =>
            navigation.onOpen({ kind: "list", id: row.id }, row.versionId)
          }
        >
          View list details
        </button>
        {(detail.currentSourceUrl || detail.army.listUrl) && (
          <ArmyListLink
            url={detail.currentSourceUrl || detail.army.listUrl}
            name={detail.name}
          >
            View current external source
          </ArmyListLink>
        )}
      </div>
      <p className={styles.status}>
        Saved by {detail.ownerName || row.ownerName} ·{" "}
        {data.patches.find((p) => p.id === row.patchId)?.name ||
          "Unknown ruleset"}
      </p>
      <ArmyLibraryUnitComparison norm={detail.norm} />
      {detail.army.composition?.selections.length ? (
        <>
          <h4>
            Published roster
            {detail.army.composition.status === "partial" ? " · Partial" : ""}
          </h4>
          <ArmyRoster composition={detail.army.composition} />
        </>
      ) : (
        <p className={styles.status}>
          {row.kind === "matrix"
            ? "Configuration only; no imported roster."
            : "No imported roster is available for this published version."}
        </p>
      )}
    </section>
  );
}
function ArchetypeLists({
  row,
  navigation,
}: {
  row: LibraryArchetypeRow;
  navigation: Navigation;
}) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useLibrary(
    {
      ...navigation.query,
      target: { kind: "archetype", id: row.id },
      versionId: undefined,
      page: 1,
      relatedPage: page,
    },
    navigation.revision,
  );
  const detail = data?.detail;
  if (!data || !detail)
    return (
      <ArmyLibraryInlineRow>
        <Pending error={error} retry={retry} />
      </ArmyLibraryInlineRow>
    );
  const total = detail.relatedPagination?.lists ?? detail.lists.length;
  const pageSize = detail.relatedPagination?.pageSize || 20;
  return (
    <>
      {detail.lists.map((list) => {
        const key = `list:${row.id}:${list.id}:${list.versionId || "current"}`;
        const open = navigation.expanded[key] || false;
        return (
          <Fragment key={list.id}>
            <ArmyLibraryDataRow
              row={list}
              patches={data.patches}
              segmented={navigation.query.patchId === "all"}
              expanded={open}
              writing={navigation.writing}
              onDefault={
                navigation.onDefault && list.norm?.canSetDefault
                  ? () => navigation.onDefault!(list)
                  : undefined
              }
              onToggle={() => navigation.onToggle(key)}
              onDetails={() =>
                navigation.onOpen({ kind: "list", id: list.id }, list.versionId)
              }
            />
            {open && (
              <ArmyLibraryInlineRow>
                <ListPreview row={list} navigation={navigation} />
              </ArmyLibraryInlineRow>
            )}
          </Fragment>
        );
      })}
      {total > pageSize && (
        <ArmyLibraryInlineRow>
          <Pages
            page={detail.relatedPagination?.page || 1}
            total={total}
            pageSize={pageSize}
            name="lists"
            onPage={setPage}
          />
        </ArmyLibraryInlineRow>
      )}
    </>
  );
}
function FactionArchetypes({
  id,
  navigation,
}: {
  id: string;
  navigation: Navigation;
}) {
  const [page, setPage] = useState(1);
  const { data, error, retry } = useLibrary(
    {
      ...navigation.query,
      tab: "archetypes",
      target: undefined,
      versionId: undefined,
      faction: id,
      page,
      pageSize: 20,
      relatedPage: undefined,
    },
    navigation.revision,
  );
  if (!data)
    return (
      <ArmyLibraryInlineRow>
        <Pending error={error} retry={retry} />
      </ArmyLibraryInlineRow>
    );
  return (
    <>
      {data.archetypes.map((row) => {
        const key = `archetype:${row.id}`;
        const open = navigation.expanded[key] || false;
        return (
          <Fragment key={row.id}>
            <ArmyLibraryDataRow
              row={row}
              patches={data.patches}
              segmented={navigation.query.patchId === "all"}
              expanded={open}
              onToggle={() => navigation.onToggle(key)}
              onDetails={() =>
                navigation.onOpen({ kind: "archetype", id: row.id })
              }
            />
            {open && <ArchetypeLists row={row} navigation={navigation} />}
          </Fragment>
        );
      })}
      {data.total > data.pageSize && (
        <ArmyLibraryInlineRow>
          <Pages
            page={data.page}
            total={data.total}
            pageSize={data.pageSize}
            name="archetypes"
            onPage={setPage}
          />
        </ArmyLibraryInlineRow>
      )}
    </>
  );
}
export function ArmyLibraryHierarchy({
  library,
  ...navigation
}: Navigation & { library: ArmyLibraryDTO }) {
  return (
    <div className={styles.hierarchy}>
      <p className={styles.totals}>
        {countLabel(library.factionGroups.length, "factions")} ·{" "}
        {countLabel(library.total, "archetypes")}
      </p>
      <ArmyLibraryTable
        sort={navigation.query.sort}
        segmented={navigation.query.patchId === "all"}
        onSort={navigation.onSort}
      >
        {library.factionGroups.map((faction) => {
          const key = `faction:${faction.id}`;
          const open = navigation.expanded[key] || false;
          return (
            <Fragment key={faction.id}>
              <ArmyLibraryFactionRow
                row={faction}
                expanded={open}
                onToggle={() => navigation.onToggle(key)}
              />
              {open && (
                <FactionArchetypes id={faction.id} navigation={navigation} />
              )}
            </Fragment>
          );
        })}
      </ArmyLibraryTable>
    </div>
  );
}
