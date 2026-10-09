"use client";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type {
  ArmyLibraryDTO,
  LibraryArchetypeRow,
  LibraryListRow,
  LibraryQuery,
  LibraryTarget,
  RosterSelection,
} from "@/lib/types";
import { ArmyLibraryTable } from "./army-library-table";
import { FactionName } from "./faction-avatar";
import { ArmyListLink } from "./army-list-drawer";
import { Disposition } from "./disposition";
import styles from "./army-library-hierarchy.module.css";

type Navigation = {
  query: LibraryQuery;
  revision: object;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onSort: (sort: LibraryQuery["sort"]) => void;
  onOpen: (target: LibraryTarget, versionId?: string) => void;
  renderComposition: (selections: RosterSelection[]) => ReactNode;
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
      <div className={styles.configuration}>
        <FactionName name={detail.army.factionName} />
        <span>
          {detail.army.detachmentNames.join(" + ") || "No recorded detachments"}
        </span>
        <Disposition name={detail.army.dispositionName} />
      </div>
      <p className={styles.status}>
        Saved by {detail.ownerName || row.ownerName} ·{" "}
        {data.patches.find((p) => p.id === row.patchId)?.name ||
          "Unknown ruleset"}
      </p>
      {detail.army.composition?.selections.length ? (
        <>
          <h4>
            Published roster
            {detail.army.composition.status === "partial" ? " · Partial" : ""}
          </h4>
          {navigation.renderComposition(detail.army.composition.selections)}
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
  if (!data || !detail) return <Pending error={error} retry={retry} />;
  const key = (list: LibraryListRow) =>
    `list:${row.id}:${list.id}:${list.versionId || "current"}`;
  return (
    <section aria-label={`Lists in ${row.name}`}>
      <div className={styles.actions}>
        <strong>Army lists</strong>
        <button
          className="small"
          onClick={() => navigation.onOpen({ kind: "archetype", id: row.id })}
        >
          View archetype details
        </button>
      </div>
      <ArmyLibraryTable
        library={{ ...data, tab: "lists", lists: detail.lists }}
        showNote={false}
        sort={navigation.query.sort}
        segmented={navigation.query.patchId === "all"}
        onSort={navigation.onSort}
        onOpen={navigation.onOpen}
        expansion={{
          isOpen: (entry) =>
            navigation.expanded[key(entry as LibraryListRow)] || false,
          toggle: (entry) => navigation.onToggle(key(entry as LibraryListRow)),
          content: (entry) => (
            <ListPreview
              row={entry as LibraryListRow}
              navigation={navigation}
            />
          ),
        }}
      />
      <Pages
        page={detail.relatedPagination?.page || 1}
        total={detail.relatedPagination?.lists ?? detail.lists.length}
        pageSize={detail.relatedPagination?.pageSize || 20}
        name="lists"
        onPage={setPage}
      />
    </section>
  );
}
function FactionArchetypes({
  id,
  name,
  navigation,
}: {
  id: string;
  name: string;
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
  if (!data) return <Pending error={error} retry={retry} />;
  return (
    <section className={styles.children} aria-label={`Archetypes for ${name}`}>
      <ArmyLibraryTable
        library={data}
        sort={navigation.query.sort}
        segmented={navigation.query.patchId === "all"}
        onSort={navigation.onSort}
        onOpen={navigation.onOpen}
        expansion={{
          isOpen: (row) => navigation.expanded[`archetype:${row.id}`] || false,
          toggle: (row) => navigation.onToggle(`archetype:${row.id}`),
          content: (row) => (
            <ArchetypeLists
              row={row as LibraryArchetypeRow}
              navigation={navigation}
            />
          ),
        }}
      />
      <Pages
        page={data.page}
        total={data.total}
        pageSize={data.pageSize}
        name="archetypes"
        onPage={setPage}
      />
    </section>
  );
}
export function ArmyLibraryHierarchy({
  library,
  ...navigation
}: Navigation & { library: ArmyLibraryDTO }) {
  const id = useId();
  return (
    <div className={styles.hierarchy}>
      <p className={styles.totals}>
        {countLabel(library.factionGroups.length, "factions")} ·{" "}
        {countLabel(library.total, "archetypes")}
      </p>
      {library.factionGroups.map((faction) => {
        const open = navigation.expanded[`faction:${faction.id}`] || false;
        const contentId = `${id}-${faction.id}`;
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <section className={styles.faction} key={faction.id}>
            <button
              className={styles.heading}
              aria-label={`${open ? "Collapse" : "Expand"} faction: ${faction.name}`}
              aria-expanded={open}
              aria-controls={contentId}
              onClick={() => navigation.onToggle(`faction:${faction.id}`)}
            >
              <Chevron size={17} aria-hidden="true" />
              <strong>
                <FactionName name={faction.name} />
              </strong>
              <span className={styles.counts}>
                {countLabel(faction.archetypes, "archetypes")} ·{" "}
                {countLabel(faction.lists, "lists")}
              </span>
            </button>
            <div id={contentId} hidden={!open}>
              {open && (
                <FactionArchetypes
                  id={faction.id}
                  name={faction.name}
                  navigation={navigation}
                />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
