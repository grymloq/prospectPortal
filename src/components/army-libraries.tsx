"use client";
import { DetachmentNames } from "./detachment-name";
import { FactionName } from "./faction-avatar";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import type {
  Army,
  ArmyLibraryDTO,
  ConsolidationPreview,
  LibraryDiscussion,
  LibraryMetrics,
  LibraryListRow,
  LibraryQuery,
  LibraryTarget,
  RosterSelection,
  View,
} from "@/lib/types";
import { PageHeading, Field, Badge, Empty, Modal, dateLabel } from "./ui";
import { Disposition } from "./disposition";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import { ArmyLibraryHierarchy } from "./army-library-hierarchy";
import { ArmyLibraryUnitComparison } from "./army-library-unit-comparison";
import { ArmyRoster } from "./army-roster";
import { ArmySummary } from "./army-summary";
import { ArmyListLink } from "./army-list-drawer";
import type { Mutate } from "./workspace";
import styles from "./army-libraries.module.css";

type Location = {
  query: LibraryQuery;
  section: string;
  returnQuery?: LibraryQuery;
};
const sections = [
  "Overview",
  "Matchups",
  "Trends",
  "Discussion",
  "History",
  "Variations",
];
function restoredLocation(key: string): Location {
  try {
    const saved = JSON.parse(
      localStorage.getItem(key) || "null",
    ) as Location | null;
    if (saved && ["lists", "archetypes"].includes(saved.query?.tab || ""))
      return {
        query: { ...saved.query, tab: "archetypes" },
        returnQuery: saved.returnQuery,
        section: sections.includes(saved.section) ? saved.section : "Overview",
      };
  } catch {
    /* Unavailable storage does not block navigation. */
  }
  return {
    query: { tab: "archetypes", page: 1, pageSize: 20, sort: "name" },
    section: "Overview",
  };
}
function score(metrics: LibraryMetrics) {
  return metrics.averageScore === null
    ? "No recorded score"
    : `${metrics.averageScore.toFixed(1)} /20`;
}
function Metrics({
  metrics,
  compact = false,
  segmented = false,
}: {
  metrics: LibraryMetrics;
  compact?: boolean;
  segmented?: boolean;
}) {
  return (
    <div className={compact ? styles.compactMetrics : styles.metrics}>
      <strong>
        {segmented ? "Scores separated by ruleset" : score(metrics)}
      </strong>
      <span>
        {metrics.recordedMatches} matches · {metrics.appearances} appearances ·{" "}
        {metrics.contributors} contributors
      </span>
      {!compact && !segmented && (
        <>
          <span>
            {metrics.wins} wins · {metrics.draws} draws · {metrics.losses}{" "}
            losses ·{" "}
            {metrics.winRate === null
              ? "Win rate unknown"
              : `${(metrics.winRate * 100).toFixed(0)}% win rate`}
          </span>
          {metrics.scoreInterval && (
            <span>
              95% score interval {metrics.scoreInterval[0].toFixed(1)}–
              {metrics.scoreInterval[1].toFixed(1)} /20
            </span>
          )}
          {metrics.singleContributor && (
            <small>Results from one contributing player.</small>
          )}
        </>
      )}
    </div>
  );
}
function Configuration({ army }: { army: Army }) {
  return (
    <div className={styles.configuration}>
      <strong>
        <FactionName name={army.factionName} />
      </strong>
      <span>
        <DetachmentNames
          names={army.detachmentNames}
          fallback="No recorded detachments"
        />
      </span>
      <Disposition name={army.dispositionName} />
    </div>
  );
}
function selectionKey(
  selection: RosterSelection,
  includeQuantity = true,
): string {
  return JSON.stringify({
    id: selection.sourceId,
    kind: selection.kind,
    ...(includeQuantity ? { quantity: selection.quantity } : {}),
    children: selection.selections.map((s) => selectionKey(s)).sort(),
  });
}
/** Compare exact namespaced selections and nesting, never approximate unit names. */
function rosterDifferences(
  reference: RosterSelection[],
  compared: RosterSelection[],
): string[] {
  function roots(selections: RosterSelection[]) {
    const map = new Map<
      string,
      { quantity: number; selection: RosterSelection }
    >();
    for (const selection of selections) {
      const key = selectionKey(selection, false);
      const existing = map.get(key);
      if (existing) existing.quantity += selection.quantity;
      else map.set(key, { quantity: selection.quantity, selection });
    }
    return map;
  }
  const from = roots(reference),
    to = roots(compared);
  const differences: string[] = [];
  for (const key of new Set([...from.keys(), ...to.keys()])) {
    const previous = from.get(key),
      next = to.get(key);
    const delta = (next?.quantity || 0) - (previous?.quantity || 0);
    if (!delta) continue;
    const selection = (next || previous)!.selection;
    const options = selection.selections
      .map((s) => `${s.quantity} × ${s.name}`)
      .join(", ");
    differences.push(
      `${delta > 0 ? "Added" : "Removed"} ${Math.abs(delta)} × ${selection.name}${options ? ` (${options})` : ""}`,
    );
  }
  return differences;
}
export default function ArmyLibraries({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const storageKey = `team-sweden:library:v1:${view.accessPreview?.active ? "preview:" : ""}${view.me.id}:${view.me.role}`;
  const [location, setLocation] = useState<Location>(() =>
    restoredLocation(storageKey),
  );
  const { query, section } = location;
  const restoredTarget = useRef(query.target?.id);
  const requestedSearch = useRef(query.search || "");
  const [library, setLibrary] = useState<ArmyLibraryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<ConsolidationPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [discussionText, setDiscussionText] = useState("");
  const [replyId, setReplyId] = useState("");
  const [editingDiscussion, setEditingDiscussion] =
    useState<LibraryDiscussion | null>(null);
  const [contextVersion, setContextVersion] = useState("");
  const [contextVariation, setContextVariation] = useState("");
  const [contextOpponent, setContextOpponent] = useState("");
  const [contextPatch, setContextPatch] = useState("");
  const [writing, setWriting] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState("");
  const [comparisonId, setComparisonId] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const readOnly = !!view.accessPreview?.active;
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(location));
    } catch {
      /* Browser preferences are optional. */
    }
  }, [storageKey, location]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "target" || value === undefined || value === "") continue;
      if (Array.isArray(value)) value.forEach((id) => params.append(key, id));
      else params.set(key, String(value));
    }
    if (query.target) {
      params.set("targetKind", query.target.kind);
      params.set("targetId", query.target.id);
    }
    let live = true;
    const timer = window.setTimeout(
      () => {
        requestedSearch.current = query.search || "";
        fetch(`/api/army-library?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        })
          .then(async (response) => {
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.error || "Could not load Army libraries.");
            return data.library as ArmyLibraryDTO;
          })
          .then((data) => {
            if (live) {
              const detachments = query.detachments?.filter((id) =>
                data.facets.detachments.some((d) => d.id === id),
              );
              const changedDetachments =
                detachments?.length !== query.detachments?.length;
              const invalidDisposition =
                query.disposition &&
                !data.facets.dispositions.some(
                  (d) => d.id === query.disposition,
                );
              if (changedDetachments || invalidDisposition) {
                setLocation((current) => ({
                  ...current,
                  query: {
                    ...current.query,
                    detachments,
                    disposition: undefined,
                    page: 1,
                    relatedPage: 1,
                  },
                }));
                return;
              }
              restoredTarget.current = undefined;
              setLibrary(data);
              setError("");
              setLoading(false);
            }
          })
          .catch((e: Error) => {
            if (live && e.name !== "AbortError") {
              if (
                restoredTarget.current &&
                query.target?.id === restoredTarget.current &&
                /unavailable/i.test(e.message)
              ) {
                restoredTarget.current = undefined;
                setLocation((c) => ({
                  query: {
                    ...(c.returnQuery || c.query),
                    tab: "archetypes",
                    target: undefined,
                    versionId: undefined,
                  },
                  section: "Overview",
                }));
                return;
              }
              setLibrary(null);
              setError(e.message);
              setLoading(false);
            }
          });
      },
      requestedSearch.current !== (query.search || "") ? 250 : 0,
    );
    return () => {
      live = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    query,
    refresh,
    view.games,
    view.savedArmies,
    view.matrixLists,
    view.me.id,
    view.me.role,
    view.accessPreview?.active,
  ]);
  function changeQuery(patch: Partial<LibraryQuery>) {
    setLoading(true);
    setError("");
    setLocation((current) => ({
      ...current,
      query: { ...current.query, page: 1, relatedPage: 1, ...patch },
    }));
  }
  function open(target: LibraryTarget, versionId?: string) {
    setDiscussionText("");
    setReplyId("");
    setEditingDiscussion(null);
    setContextVersion("");
    setContextVariation("");
    setContextOpponent("");
    setContextPatch("");
    setLocation((current) => ({
      returnQuery: current.returnQuery || current.query,
      query: {
        ...current.query,
        ...(versionId
          ? {
              faction: undefined,
              search: undefined,
              detachments: undefined,
              disposition: undefined,
            }
          : {}),
        tab: "archetypes",
        target,
        versionId,
        relatedPage: 1,
      },
      section: "Overview",
    }));
    setLoading(true);
  }
  function backToLibrary() {
    setLoading(true);
    setError("");
    setLocation((current) => ({
      query: {
        ...(current.returnQuery || current.query),
        tab: "archetypes",
        target: undefined,
        versionId: undefined,
        relatedPage: 1,
      },
      section: "Overview",
    }));
  }
  async function write(command: object) {
    setWriting(true);
    const ok = await mutate(command, setError);
    setWriting(false);
    if (ok) {
      setLoading(true);
      setRefresh((n) => n + 1);
    }
    return ok;
  }
  async function setArchetypeDefault(row: LibraryListRow) {
    await write({
      type: "libraryArchetypeDefault",
      archetypeId: row.archetypeId,
      patchId: row.patchId,
      versionId: row.norm?.isDefault ? undefined : row.versionId,
      expectedRevision: row.norm?.defaultRevision || 0,
    });
  }
  async function importStoredLists() {
    setImportBusy(true);
    setError("");
    setImportReport("");
    try {
      let offset: number | undefined = 0;
      const totals = {
        updated: 0,
        complete: 0,
        partial: 0,
        failed: 0,
        unsupported: 0,
        skipped: 0,
      };
      while (offset !== undefined) {
        const response = await fetch("/api/army-library/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not import stored lists.");
        for (const key of Object.keys(totals) as (keyof typeof totals)[])
          totals[key] += payload.report[key];
        setImportReport(
          `${totals.updated} saved lists updated; ${totals.complete} complete roster sources, ${totals.partial} partial, ${totals.failed} failed, ${totals.unsupported} unsupported, ${totals.skipped} skipped. Historical snapshots were preserved.`,
        );
        const next = payload.nextOffset as number | undefined;
        if (next !== undefined && next <= offset)
          throw new Error(
            "Import batch did not advance. Run the import again.",
          );
        offset = next;
      }
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  }
  async function loadPreview() {
    setPreviewBusy(true);
    setError("");
    try {
      const response = await fetch(
        "/api/army-library?action=consolidationPreview",
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPreview(data.preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }
  const detail = library?.detail;
  const comparison =
    detail?.variations.find((v) => v.id === comparisonId) ||
    detail?.variations[0];
  const patchName = (id: string) =>
    library?.patches.find((p) => p.id === id)?.name || "Unknown ruleset";
  const activeSections = sections.filter(
    (s) => s !== "Variations" || detail?.target.kind === "archetype",
  );
  function discussion(row: LibraryDiscussion) {
    const children = detail!.discussions.filter((d) => d.parentId === row.id);
    return (
      <article key={row.id} className={styles.discussion}>
        <div className="row">
          <strong>{row.authorName}</strong>
          <small>
            {dateLabel(row.createdAt)}
            {row.updatedAt ? " · edited" : ""}
          </small>
        </div>
        {row.context && (
          <small>
            {row.context.patchId && patchName(row.context.patchId)}
            {row.context.versionId &&
              ` · Version ${detail!.versions.find((v) => v.id === row.context?.versionId)?.number || "recorded"}`}
            {row.context.variationId && " · Variation context"}
            {row.context.opponentArchetypeId && " · Opponent context"}
          </small>
        )}
        <p className="preserve">
          {row.deletedAt ? "Comment removed" : row.text}
        </p>
        {!readOnly && !row.deletedAt && (
          <div className="row">
            <button
              className="small"
              onClick={() => {
                setReplyId(row.id);
                setEditingDiscussion(null);
                setDiscussionText("");
              }}
            >
              Reply
            </button>
            {row.authorId === view.me.id && (
              <button
                className="small"
                onClick={() => {
                  setEditingDiscussion(row);
                  setReplyId("");
                  setDiscussionText(row.text);
                }}
              >
                Edit
              </button>
            )}
            {(row.authorId === view.me.id || view.me.role === "admin") && (
              <button
                className="small danger"
                disabled={writing}
                onClick={() =>
                  void write({ type: "libraryDiscussionDelete", id: row.id })
                }
              >
                Delete
              </button>
            )}
          </div>
        )}
        {children.length > 0 && (
          <div className={styles.replies}>{children.map(discussion)}</div>
        )}
      </article>
    );
  }
  return (
    <div className={styles.library}>
      <PageHeading
        title="Army libraries"
        description="Shared lists, archetypes and recorded results."
      >
        {view.me.role === "admin" && (
          <button
            disabled={importBusy || readOnly || writing}
            onClick={() => void importStoredLists()}
          >
            {importBusy ? "Importing lists…" : "Import stored lists"}
          </button>
        )}
        {view.me.role === "admin" && (
          <button
            disabled={previewBusy || readOnly}
            onClick={() => void loadPreview()}
          >
            {previewBusy ? "Preparing…" : "Consolidate army lists"}
          </button>
        )}
        <button
          aria-label="Refresh Army libraries"
          onClick={() => {
            setLoading(true);
            setRefresh((n) => n + 1);
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </PageHeading>
      {importReport && <p role="status">{importReport}</p>}
      <section
        className={`panel padded ${styles.filters}`}
        aria-label="Library filters"
      >
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search Army libraries"
            placeholder="Search names or factions…"
            maxLength={120}
            value={query.search || ""}
            onChange={(e) => changeQuery({ search: e.target.value })}
          />
        </label>
        <Field label="Ruleset">
          <select
            value={query.patchId || ""}
            onChange={(e) =>
              changeQuery({
                patchId: e.target.value || undefined,
                versionId: undefined,
                detachments: undefined,
                disposition: undefined,
              })
            }
          >
            <option value="">Current team default</option>
            <option value="all">All rulesets</option>
            {library?.patches.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.date}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Faction">
          <select
            value={query.faction || ""}
            onChange={(e) =>
              changeQuery({
                faction: e.target.value,
                detachments: undefined,
                disposition: undefined,
              })
            }
          >
            <option value="">All factions</option>
            {library?.facets.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <MultiSelectDropdown
          label="Detachment combination"
          options={library?.facets.detachments || []}
          selected={query.detachments || []}
          disabled={loading}
          onChange={(detachments) =>
            changeQuery({ detachments, disposition: undefined })
          }
        />
        <Field label="Disposition">
          <select
            value={query.disposition || ""}
            disabled={loading}
            onChange={(e) => changeQuery({ disposition: e.target.value })}
          >
            <option value="">All dispositions</option>
            {library?.facets.dispositions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort">
          <select
            value={query.sort || "name"}
            onChange={(e) =>
              changeQuery({ sort: e.target.value as LibraryQuery["sort"] })
            }
          >
            <option value="name">Name</option>
            <option value="score">Average score</option>
            <option value="matches">Recorded matches</option>
          </select>
        </Field>
        <small className={styles.full}>
          {query.patchId === "all"
            ? "Performance is separated by ruleset."
            : "Older public lists may be hidden. Choose All rulesets to find them."}
        </small>
        {query.detachments?.length ||
        query.search ||
        query.faction ||
        query.disposition ? (
          <button
            className="small"
            onClick={() =>
              changeQuery({
                search: undefined,
                faction: undefined,
                disposition: undefined,
                detachments: undefined,
              })
            }
          >
            Clear list filters
          </button>
        ) : null}
      </section>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button onClick={backToLibrary}>Return to library</button>
          <button
            onClick={() => {
              setLoading(true);
              setRefresh((n) => n + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {loading && <p role="status">Loading Army libraries…</p>}
      {!loading && library && !query.target && (
        <section className="panel padded">
          {library.total > 0 && (
            <ArmyLibraryHierarchy
              library={library}
              query={query}
              revision={library}
              expanded={expanded}
              onToggle={(key) =>
                setExpanded((current) => ({ ...current, [key]: !current[key] }))
              }
              onSort={(sort) => changeQuery({ sort })}
              onOpen={open}
              writing={writing}
              onDefault={
                view.me.role === "admin" && !readOnly
                  ? setArchetypeDefault
                  : undefined
              }
            />
          )}
          {library.total === 0 && (
            <Empty
              title="No shared armies in this scope"
              description="Choose All rulesets or clear filters. Lists without games are still eligible."
            />
          )}
        </section>
      )}
      {!loading && detail && (
        <>
          <button className={styles.back} onClick={backToLibrary}>
            <ArrowLeft size={16} />
            Back to army library
          </button>
          <section className="panel padded">
            <h2>{detail.name}</h2>
            <Configuration army={detail.army} />
            {detail.target.kind === "list" && (
              <ArmySummary summary={detail.army.summary} />
            )}
            {detail.ownerName && <p>Saved by {detail.ownerName}</p>}
            <div className={styles.filters}>
              {detail.target.kind === "list" && detail.versions.length > 0 && (
                <Field label="Published version">
                  <select
                    value={query.versionId || ""}
                    onChange={(e) =>
                      changeQuery({ versionId: e.target.value || undefined })
                    }
                  >
                    <option value="">
                      All published versions in this scope
                    </option>
                    {query.versionId &&
                      !detail.versions.some(
                        (v) => v.id === query.versionId,
                      ) && (
                        <option value={query.versionId}>
                          Selected historical version
                        </option>
                      )}
                    {detail.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Version {v.number} · {patchName(v.patchId)} ·{" "}
                        {dateLabel(v.createdAt)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Opponent faction">
                <select
                  value={query.opponentFaction || ""}
                  onChange={(e) =>
                    changeQuery({ opponentFaction: e.target.value })
                  }
                >
                  <option value="">All opponents</option>
                  {library.facets.factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              {(
                [
                  ["opponentArchetypeId", "Opponent archetype", "archetype"],
                  ["opponentListId", "Opponent list", "list"],
                  ["opponentVariationId", "Opponent variation", "variation"],
                  ["deploymentId", "Deployment", "deployment"],
                  ["missionId", "Mission", "mission"],
                ] as const
              ).map(([key, label, dimension]) => (
                <Field key={key} label={label}>
                  <select
                    value={query[key] || ""}
                    onChange={(e) => changeQuery({ [key]: e.target.value })}
                  >
                    <option value="">All {label.toLowerCase()}s</option>
                    {detail.matchups
                      .filter((m) => m.dimension === dimension)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    {query[key] &&
                      !detail.matchups.some(
                        (m) => m.dimension === dimension && m.id === query[key],
                      ) && (
                        <option value={query[key]}>
                          Selected {label.toLowerCase()}
                        </option>
                      )}
                  </select>
                </Field>
              ))}
              <Field label="From date">
                <input
                  type="date"
                  value={query.dateFrom || ""}
                  onChange={(e) => changeQuery({ dateFrom: e.target.value })}
                />
              </Field>
              <Field label="To date">
                <input
                  type="date"
                  value={query.dateTo || ""}
                  onChange={(e) => changeQuery({ dateTo: e.target.value })}
                />
              </Field>
              <button
                onClick={() =>
                  changeQuery({
                    opponentFaction: undefined,
                    opponentArchetypeId: undefined,
                    opponentListId: undefined,
                    opponentVariationId: undefined,
                    deploymentId: undefined,
                    missionId: undefined,
                    dateFrom: undefined,
                    dateTo: undefined,
                  })
                }
              >
                Clear result filters
              </button>
            </div>
          </section>
          <div
            className={`tabs ${styles.tabs}`}
            aria-label="Army detail sections"
          >
            {activeSections.map((s) => (
              <button
                key={s}
                aria-pressed={s === section}
                className={s === section ? "active" : ""}
                onClick={() => setLocation((c) => ({ ...c, section: s }))}
              >
                {s}
              </button>
            ))}
          </div>
          <section className="panel padded">
            {detail.relatedPagination &&
              detail.relatedPagination.totalPages > 1 && (
                <div className={styles.pagination}>
                  <span>
                    Related records · Page {detail.relatedPagination.page} /{" "}
                    {detail.relatedPagination.totalPages} ·{" "}
                    {detail.relatedPagination.versions} versions ·{" "}
                    {detail.relatedPagination.variations} variations ·{" "}
                    {detail.relatedPagination.lists} lists ·{" "}
                    {detail.relatedPagination.discussions || 0} discussion
                    records
                  </span>
                  <button
                    disabled={detail.relatedPagination.page <= 1}
                    onClick={() =>
                      changeQuery({
                        relatedPage: detail.relatedPagination!.page - 1,
                      })
                    }
                  >
                    Previous records
                  </button>
                  <button
                    disabled={
                      detail.relatedPagination.page >=
                      detail.relatedPagination.totalPages
                    }
                    onClick={() =>
                      changeQuery({
                        relatedPage: detail.relatedPagination!.page + 1,
                      })
                    }
                  >
                    Next records
                  </button>
                </div>
              )}
            {section === "Overview" && (
              <>
                <Metrics
                  metrics={detail.metrics}
                  segmented={query.patchId === "all"}
                />
                {detail.target.kind === "list" && (
                  <p>
                    <button
                      className="small"
                      onClick={() =>
                        open({ kind: "archetype", id: detail.archetypeId })
                      }
                    >
                      View configuration archetype
                    </button>
                  </p>
                )}
                {(detail.currentSourceUrl ||
                  detail.army.listUrl ||
                  detail.army.listText) && (
                  <p>
                    <ArmyListLink
                      url={detail.currentSourceUrl || detail.army.listUrl}
                      text={detail.army.listText}
                      summary={detail.army.summary}
                      name={detail.name}
                    >
                      View current external source
                    </ArmyListLink>
                    <small className={styles.note}>
                      The external source may change; recorded versions retain
                      their saved snapshots.
                    </small>
                  </p>
                )}
                <p>
                  {detail.army.scope?.systemId
                    ? `System ${detail.army.scope.systemId}`
                    : "System unknown"}{" "}
                  ·{" "}
                  {detail.army.scope?.edition
                    ? `Edition ${detail.army.scope.edition}`
                    : "Edition unknown"}{" "}
                  · {detail.army.scope?.battleSize || "Battle size unknown"}
                </p>
                <p>
                  Roster: {detail.army.composition?.status || "unavailable"}
                  {detail.army.composition?.status !== "complete"
                    ? " · Unclassified"
                    : ""}
                </p>
                {detail.army.composition?.reasons.length ? (
                  <p>{detail.army.composition.reasons.join("; ")}</p>
                ) : null}
                {detail.army.composition && (
                  <>
                    {detail.target.kind === "list" && (
                      <ArmyLibraryUnitComparison norm={detail.norm} />
                    )}
                    <ArmyRoster composition={detail.army.composition} />
                  </>
                )}
                {detail.target.kind === "archetype" &&
                  detail.standards?.map((standard) => (
                    <p key={standard.patchId}>
                      Standard: <strong>{standard.name}</strong> ·{" "}
                      {patchName(standard.patchId)} ·{" "}
                      {standard.selection === "marked"
                        ? "Marked default"
                        : "Most repeated variant"}{" "}
                      · {standard.repetitions} lists
                    </p>
                  ))}
                <p className={styles.note}>
                  {detail.coverage.unclassifiedAppearances} unclassified
                  appearances · {detail.coverage.missingDeployment} missing
                  deployments · {detail.coverage.missingMission} missing
                  missions · {detail.coverage.conflicts} excluded conflicts
                </p>
                {query.patchId === "all" && (
                  <>
                    <h3>Ruleset segments</h3>
                    {detail.segments.map((s) => (
                      <article className={styles.row} key={s.patchId}>
                        <div>
                          <strong>{patchName(s.patchId)}</strong>
                          <small>
                            {s.variations} variations · {s.publicLists} lists
                          </small>
                        </div>
                        <Metrics metrics={s.metrics} compact />
                      </article>
                    ))}
                  </>
                )}
              </>
            )}
            {section === "Matchups" && (
              <>
                <p className={styles.note}>
                  {library.policy.uncertainty}. Recorded results only; thin
                  evidence stays uncertain. Player and event concentration can
                  affect results.
                </p>
                {(["good", "bad", "uncertain"] as const).map(
                  (classification) => (
                    <section key={classification}>
                      <h3>
                        {classification === "good"
                          ? "Good matchups"
                          : classification === "bad"
                            ? "Bad matchups"
                            : "Uncertain / insufficient data"}
                      </h3>
                      {detail.matchups
                        .filter(
                          (m) =>
                            m.classification === classification && !m.mirror,
                        )
                        .map((m) => (
                          <article
                            className={styles.row}
                            key={`${m.dimension}:${m.id}`}
                          >
                            <div>
                              <strong>
                                {m.dimension === "faction" ? (
                                  <FactionName name={m.label} />
                                ) : (
                                  m.label
                                )}
                              </strong>
                              <small>{m.dimension}</small>
                            </div>
                            <Metrics metrics={m.metrics} />
                          </article>
                        ))}
                      {!detail.matchups.some(
                        (m) => m.classification === classification && !m.mirror,
                      ) && <p>No recorded evidence in this group.</p>}
                    </section>
                  ),
                )}
                {detail.matchups.some((m) => m.mirror) && (
                  <section>
                    <h3>Mirror results</h3>
                    {detail.matchups
                      .filter((m) => m.mirror)
                      .map((m) => (
                        <article
                          className={styles.row}
                          key={`${m.dimension}:${m.id}`}
                        >
                          <strong>
                            {m.dimension === "faction" ? (
                              <FactionName name={m.label} />
                            ) : (
                              m.label
                            )}
                          </strong>
                          <Metrics metrics={m.metrics} />
                        </article>
                      ))}
                  </section>
                )}
              </>
            )}
            {section === "Trends" && (
              <>
                <h3>Monthly recorded results</h3>
                <p>
                  Each row keeps its ruleset and sample count. Empty periods
                  remain gaps.
                </p>
                {detail.trends.length ? (
                  <div className="table-scroll">
                    <table>
                      <caption className={styles.note}>
                        Average team score and win rate by month and ruleset
                      </caption>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Ruleset</th>
                          <th>Average /20</th>
                          <th>Win rate</th>
                          <th>W / D / L</th>
                          <th>Matches / appearances</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.trends.map((t) => (
                          <tr key={`${t.patchId}:${t.month}`}>
                            <td>{t.month}</td>
                            <td>{patchName(t.patchId)}</td>
                            <td>
                              {t.metrics.averageScore?.toFixed(1) ?? "Unknown"}
                            </td>
                            <td>
                              {t.metrics.winRate === null
                                ? "Unknown"
                                : `${(t.metrics.winRate * 100).toFixed(0)}%`}
                            </td>
                            <td>
                              {t.metrics.wins} / {t.metrics.draws} /{" "}
                              {t.metrics.losses}
                            </td>
                            <td>
                              {t.metrics.recordedMatches} /{" "}
                              {t.metrics.appearances}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No trend yet"
                    description="Eligible contributed results will appear here without filling missing periods with zero scores."
                  />
                )}
              </>
            )}
            {section === "History" && (
              <>
                <h3>
                  {detail.target.kind === "list"
                    ? "Published immutable versions"
                    : "Ruleset membership history"}
                </h3>
                {detail.target.kind === "list" ? (
                  detail.versions.map((v, i) => {
                    const earlier = detail.versions[i + 1];
                    return (
                      <article className={styles.history} key={v.id}>
                        <div className="section-heading">
                          <strong>
                            Version {v.number} · {patchName(v.patchId)}
                          </strong>
                          <small>{dateLabel(v.createdAt)}</small>
                        </div>
                        <Configuration army={v.army} />
                        <Metrics metrics={v.metrics} compact />
                        <p className={styles.note}>
                          {earlier
                            ? [
                                v.patchId !== earlier.patchId
                                  ? "Ruleset changed"
                                  : "Same ruleset",
                                v.army.composition?.fingerprint &&
                                earlier.army.composition?.fingerprint
                                  ? v.army.composition.fingerprint ===
                                    earlier.army.composition.fingerprint
                                    ? "Known composition unchanged"
                                    : "Known composition changed"
                                  : "Roster differences unknown",
                              ].join(" · ")
                            : detail.relatedPagination &&
                                detail.relatedPagination.page <
                                  detail.relatedPagination.totalPages
                              ? "Earlier published snapshots may appear on the next records page."
                              : "Earliest published snapshot; earlier private versions are not shown."}
                        </p>
                        <button
                          className="small"
                          onClick={() => {
                            changeQuery({ versionId: v.id });
                            setLocation((c) => ({ ...c, section: "Overview" }));
                          }}
                        >
                          View this version
                        </button>
                      </article>
                    );
                  })
                ) : (
                  <>
                    {detail.segments.map((s) => (
                      <article className={styles.history} key={s.patchId}>
                        <h4>{patchName(s.patchId)}</h4>
                        <p>
                          {s.variations} known variations · {s.publicLists}{" "}
                          public lists
                        </p>
                        <Metrics metrics={s.metrics} />
                      </article>
                    ))}
                    <h3>Public list snapshots in this configuration</h3>
                    {detail.lists.map((l) => (
                      <p key={`${l.id}:${l.versionId}`}>
                        <button
                          className="small"
                          onClick={() => open({ kind: "list", id: l.id })}
                        >
                          {l.name}
                        </button>{" "}
                        · {patchName(l.patchId)} · {l.ownerName}
                      </p>
                    ))}
                  </>
                )}
              </>
            )}
            {section === "Variations" && (
              <>
                <h3>Variation comparisons</h3>
                <p>
                  {detail.relatedPagination?.variations ??
                    detail.variations.length}{" "}
                  known variations ·{" "}
                  {detail.relatedPagination?.lists ??
                    new Set(detail.lists.map((l) => l.id)).size}{" "}
                  public lists. Unclassified lists remain listed without a
                  variation.
                </p>
                <p className={styles.note}>
                  Leading observed variation uses average score and the active
                  filters, with at least {library.policy.leadingMinimumMatches}{" "}
                  distinct matches. It is not proof of roster superiority.
                  Pooled variation results include independently public
                  identical rosters.
                </p>
                {!detail.variations.some((v) => v.leading) && (
                  <p>
                    {detail.relatedPagination &&
                    detail.relatedPagination.totalPages > 1
                      ? "No leading observed variation on this page; inspect the remaining records."
                      : "Insufficient or indistinguishable evidence for a leading observed variation."}
                  </p>
                )}
                {detail.variations.filter((v) => v.leading).length > 1 && (
                  <p>
                    Several observed leaders have overlapping uncertainty
                    intervals; no unique leader is established.
                  </p>
                )}
                {detail.variations.length > 1 && (
                  <Field label="Compare roster differences against">
                    <select
                      value={comparison?.id || ""}
                      onChange={(e) => setComparisonId(e.target.value)}
                    >
                      {detail.variations.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          Variation {i + 1}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {detail.variations.map((v, i) => (
                  <article className={styles.history} key={v.id}>
                    <h4>
                      Variation {i + 1}{" "}
                      {v.leading && (
                        <Badge tone="blue">Leading observed variation</Badge>
                      )}
                    </h4>
                    <Metrics
                      metrics={v.metrics}
                      segmented={query.patchId === "all"}
                    />
                    <details>
                      <summary>Recorded roster</summary>
                      <ArmyRoster composition={v.composition} />
                    </details>
                    {comparison && comparison.id !== v.id && (
                      <details>
                        <summary>
                          Known selection differences from variation{" "}
                          {detail.variations.indexOf(comparison) + 1}
                        </summary>
                        <ul className={styles.composition}>
                          {rosterDifferences(
                            comparison.composition.selections,
                            v.composition.selections,
                          ).map((difference, n) => (
                            <li key={n}>{difference}</li>
                          ))}
                        </ul>
                        <p className={styles.note}>
                          Exact recorded selections and quantities only. Changed
                          nested loadouts appear as removed and added
                          configurations.
                        </p>
                      </details>
                    )}
                    <p>Public lists using this variation</p>
                    {detail.lists
                      .filter((l) => v.listIds.includes(l.id))
                      .map((l) => (
                        <button
                          className="small"
                          key={l.id}
                          onClick={() => open({ kind: "list", id: l.id })}
                        >
                          {l.name} · {l.ownerName}
                        </button>
                      ))}
                  </article>
                ))}
                {!detail.variations.length && (
                  <Empty
                    title={
                      detail.relatedPagination?.variations
                        ? "No variations on this records page"
                        : "No complete classified rosters"
                    }
                    description={
                      detail.relatedPagination?.variations
                        ? "Use Previous records to review the available variations."
                        : "Configuration-only and partial lists remain discoverable without invented variations."
                    }
                  />
                )}
              </>
            )}
            {section === "Discussion" && (
              <div className="conversation">
                <h3>
                  {detail.target.kind === "list"
                    ? "List discussion"
                    : "Archetype discussion"}
                </h3>
                {detail.discussions.filter((d) => !d.parentId).map(discussion)}
                {!detail.discussions.length && (
                  <Empty
                    title="No discussion yet"
                    description="Discuss this shared army without publishing private journal reflections."
                  />
                )}
                {!readOnly && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const context = {
                        ...(contextPatch ? { patchId: contextPatch } : {}),
                        ...(contextVersion
                          ? { versionId: contextVersion }
                          : {}),
                        ...(contextVariation
                          ? { variationId: contextVariation }
                          : {}),
                        ...(contextOpponent
                          ? { opponentArchetypeId: contextOpponent }
                          : {}),
                      };
                      const ok = await write(
                        editingDiscussion
                          ? {
                              type: "libraryDiscussionEdit",
                              id: editingDiscussion.id,
                              text: discussionText,
                            }
                          : {
                              type: "libraryDiscussion",
                              target: detail.target,
                              ...(replyId ? { parentId: replyId } : {}),
                              ...(Object.keys(context).length
                                ? { context }
                                : {}),
                              text: discussionText,
                            },
                      );
                      if (ok) {
                        setDiscussionText("");
                        setReplyId("");
                        setEditingDiscussion(null);
                      }
                    }}
                  >
                    {(replyId || editingDiscussion) && (
                      <p>
                        {editingDiscussion
                          ? "Editing your comment"
                          : "Replying to a comment"}{" "}
                        <button
                          type="button"
                          className="small"
                          onClick={() => {
                            setReplyId("");
                            setEditingDiscussion(null);
                            setDiscussionText("");
                          }}
                        >
                          Cancel
                        </button>
                      </p>
                    )}
                    {!editingDiscussion && (
                      <div className={styles.filters}>
                        <Field label="Discussion ruleset (optional)">
                          <select
                            value={contextPatch}
                            onChange={(e) => setContextPatch(e.target.value)}
                          >
                            <option value="">No ruleset context</option>
                            {library.patches.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Discussion version (optional)">
                          <select
                            value={contextVersion}
                            onChange={(e) => setContextVersion(e.target.value)}
                          >
                            <option value="">No version context</option>
                            {detail.versions.map((v) => (
                              <option key={v.id} value={v.id}>
                                Version {v.number} · {patchName(v.patchId)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {detail.target.kind === "archetype" && (
                          <Field label="Discussion variation (optional)">
                            <select
                              value={contextVariation}
                              onChange={(e) =>
                                setContextVariation(e.target.value)
                              }
                            >
                              <option value="">No variation context</option>
                              {detail.variations.map((v, i) => (
                                <option key={v.id} value={v.id}>
                                  Variation {i + 1}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <Field label="Discussion opponent (optional)">
                          <select
                            value={contextOpponent}
                            onChange={(e) => setContextOpponent(e.target.value)}
                          >
                            <option value="">No matchup context</option>
                            {detail.matchups
                              .filter((m) => m.dimension === "archetype")
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                          </select>
                        </Field>
                      </div>
                    )}
                    <Field
                      label={
                        editingDiscussion
                          ? "Edit comment"
                          : replyId
                            ? "Reply"
                            : "New discussion"
                      }
                    >
                      <textarea
                        required
                        maxLength={4000}
                        value={discussionText}
                        onChange={(e) => setDiscussionText(e.target.value)}
                      />
                    </Field>
                    <button
                      className="primary"
                      disabled={writing || !discussionText.trim()}
                    >
                      {writing
                        ? "Saving…"
                        : editingDiscussion
                          ? "Save comment"
                          : "Post comment"}
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {preview && (
        <Modal
          title="Consolidation preview"
          busy={writing}
          onClose={() => setPreview(null)}
        >
          <p>Classification {preview.classificationVersion}</p>
          <p>
            {preview.newArchetypes} new archetypes ·{" "}
            {preview.existingArchetypes} existing archetypes ·{" "}
            {preview.newVariations} new variations ·{" "}
            {preview.duplicateCompositions} duplicate compositions
            {" · "}
            {preview.membershipChanges || 0} membership changes
          </p>
          <p>{preview.unclassified.length} unclassified list snapshots</p>
          {preview.unclassified.length > 0 && (
            <details>
              <summary>Reasons for unclassified snapshots</summary>
              <ul>
                {preview.unclassified.map((u, i) => (
                  <li key={`${u.listId}:${i}`}>{u.reason}</li>
                ))}
              </ul>
            </details>
          )}
          <p>
            Consolidation groups saved lists and preserves ownership,
            publication and original snapshots.
          </p>
          <div className="form-footer">
            <button data-modal-close>Cancel</button>
            <button
              className="primary"
              disabled={writing || readOnly}
              onClick={async () => {
                if (
                  await write({
                    type: "libraryConsolidationApply",
                    sourceRevision: preview.sourceRevision,
                  })
                )
                  setPreview(null);
              }}
            >
              Apply classification
            </button>
          </div>
          {error && (
            <p role="alert">{error} Refresh the preview before retrying.</p>
          )}
          <button
            disabled={previewBusy || writing}
            onClick={() => void loadPreview()}
          >
            Refresh preview
          </button>
        </Modal>
      )}
    </div>
  );
}
