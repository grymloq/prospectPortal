"use client";
import { DetachmentNames } from "./detachment-name";
import { FactionName } from "./faction-avatar";
import { patchLabel } from "@/lib/patches";
import { useState, useEffect } from "react";
import { Plus, Search, Pencil, Trash2, Check } from "lucide-react";
import type { Army, Game, View, RecordedGameContext } from "@/lib/types";
import {
  catalogue,
  dispositionsFor,
  defaultDisposition,
  type Catalogue,
} from "@/lib/catalogue";
import { Disposition } from "./disposition";
import { DispositionPicker } from "./disposition-picker";
import { ArmyListLink } from "./army-list-drawer";
import type { Mutate } from "./workspace";
import { PageHeading, Badge, Field, Modal, Empty, dateLabel } from "./ui";
import ScrimReport from "./scrim-report";
import RecordedContextFields from "./game-context-fields";
export type Choice = Pick<
  Army,
  | "faction"
  | "detachments"
  | "disposition"
  | "listUrl"
  | "listName"
  | "listText"
  | "composition"
  | "scope"
  | "summary"
>;
export function blank(faction = catalogue.factions[0].id): Choice {
  return { faction, detachments: [], disposition: "", listUrl: "" };
}
function GameArmyFields({
  view,
  patchId,
  opponent = false,
  value,
  onChange,
  rules,
  selected,
  setSelected,
  opponentUserId = "",
}: {
  view: View;
  patchId: string;
  opponent?: boolean;
  value: Choice;
  onChange: (c: Choice) => void;
  rules: Catalogue;
  selected: string;
  setSelected: (id: string) => void;
  opponentUserId?: string;
}) {
  const lists = (view.savedArmies || [])
    .filter(
      (a) =>
        a.patchId === patchId &&
        (opponent ? a.shared : a.userId === view.me.id),
    )
    .sort(
      (a, b) =>
        Number(b.userId === opponentUserId) -
        Number(a.userId === opponentUserId),
    );
  const saved = lists.find((a) => a.id === selected);
  return (
    <div>
      <Field label={opponent ? "Saved opponent army" : "My saved armies"}>
        <select
          value={saved?.id || ""}
          onChange={(e) => {
            const list = lists.find((a) => a.id === e.target.value);
            if (list)
              onChange({
                ...list.army,
                detachments: [...list.army.detachments],
              });
            setSelected(e.target.value);
          }}
        >
          <option value="">Enter army manually</option>
          {lists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.army.listName} · {a.army.factionName}
              {opponent ? ` · ${a.ownerName}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {saved ? (
        <div className="army-summary">
          <strong>{value.listName}</strong>
          <p>
            <FactionName name={saved.army.factionName} /> ·{" "}
            <DetachmentNames names={saved.army.detachmentNames} />
          </p>
          <Disposition name={saved.army.dispositionName} />
          <p>
            <button type="button" onClick={() => setSelected("")}>
              Customize army
            </button>
          </p>
        </div>
      ) : (
        <ArmyFields
          title={opponent ? "Opponent's army" : "Your army"}
          value={value}
          onChange={onChange}
          rules={rules}
          maxDP={3}
          preferredFactions={view.me.preferredFactions ?? [view.me.faction]}
        />
      )}
    </div>
  );
}
export function ArmyFields({
  title,
  value,
  onChange,
  rules = catalogue,
  preferredFactions = [],
  maxDP = Infinity,
  hideListName = false,
}: {
  title: string;
  value: Choice;
  onChange: (c: Choice) => void;
  rules?: Catalogue;
  preferredFactions?: string[];
  maxDP?: number;
  hideListName?: boolean;
}) {
  const faction = rules.factions.find((f) => f.id === value.faction),
    available = dispositionsFor(value.faction, value.detachments, rules);
  const points =
    faction?.detachments
      .filter((d) => value.detachments.includes(d.id))
      .reduce((sum, d) => sum + d.points, 0) || 0;
  const preferred = rules.factions.filter((f) =>
    preferredFactions.includes(f.id),
  );
  const others = rules.factions.filter(
    (f) => !preferredFactions.includes(f.id),
  );
  useEffect(() => {
    if (!available.some((d) => d.id === value.disposition)) {
      const disposition = defaultDisposition(available);
      if (disposition !== value.disposition)
        onChange({ ...value, disposition });
    }
  }, [available, value, onChange]);
  return (
    <fieldset className="army-fields">
      <legend>{title}</legend>
      <Field label="Army">
        <select
          value={value.faction}
          onChange={(e) => onChange(blank(e.target.value))}
        >
          {!faction && (
            <option value={value.faction}>
              Choose an army for this ruleset
            </option>
          )}
          {preferred.length > 0 && (
            <optgroup label="Preferred armies">
              {preferred.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
          {others.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="field">
        <span>
          Detachments{" "}
          <small>
            ({value.detachments.length}/3
            {Number.isFinite(maxDP) ? ` · ${points}/${maxDP} DP` : ""})
          </small>
        </span>
        <div className="detachment-options">
          {faction?.detachments.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={value.detachments.includes(d.id)}
                disabled={
                  !value.detachments.includes(d.id) &&
                  (value.detachments.length >= 3 || points + d.points > maxDP)
                }
                onChange={(e) => {
                  const selected = e.target.checked
                    ? [...value.detachments, d.id]
                    : value.detachments.filter((id) => id !== d.id);
                  onChange({
                    ...value,
                    composition: undefined,
                    detachments: selected,
                    disposition: defaultDisposition(
                      dispositionsFor(value.faction, selected, rules),
                    ),
                  });
                }}
              />
              <span>{d.name}</span>
              <small>{d.points} DP</small>
            </label>
          ))}
        </div>
      </div>
      <DispositionPicker
        available={available}
        value={value.disposition}
        onChange={(disposition) =>
          onChange({ ...value, disposition, composition: undefined })
        }
      />
      {!hideListName && (
        <Field label="Army-list name (optional)">
          <input
            maxLength={100}
            value={value.listName || ""}
            onChange={(e) => onChange({ ...value, listName: e.target.value })}
          />
        </Field>
      )}
      <Field label="Army-list link (optional)">
        <input
          type="url"
          placeholder="https://www.newrecruit.eu/…"
          value={value.listUrl}
          onChange={(e) => onChange({ ...value, listUrl: e.target.value })}
        />
      </Field>
      <small>
        {rules.source} ·{" "}
        {rules.source === "Warmind"
          ? `updated ${faction?.updatedAt.slice(0, 10) || "unavailable"}`
          : `catalogue revision ${faction?.revision ?? "unavailable"}`}
      </small>
    </fieldset>
  );
}
export default function Journal({
  view,
  mutate,
  userId,
  embedded = false,
  startOpen = false,
}: {
  view: View;
  mutate: Mutate;
  userId?: string;
  embedded?: boolean;
  startOpen?: boolean;
}) {
  const defaultArmy = (view.savedArmies || []).find(
    (a) =>
      a.id === view.me.defaultArmyId &&
      a.userId === view.me.id &&
      view.patches.some((p) => p.id === a.patchId && !p.removedAt),
  );
  const [opponentName, setOpponentName] = useState("");
  const [scrimReport, setScrimReport] = useState<{
    scrimId: string;
    pairingId: string;
  } | null>(null);
  const reportingScrim = view.scrims?.find(
    (s) => s.id === scrimReport?.scrimId,
  );
  const [opponentUserId, setOpponentUserId] = useState("");
  const mentionQuery =
    !opponentUserId && opponentName.startsWith("@")
      ? opponentName.slice(1).toLowerCase()
      : null;
  const mentions =
    mentionQuery === null
      ? []
      : view.playerOptions
          .filter((p) => p.name.toLowerCase().includes(mentionQuery))
          .slice(0, 8);
  const [query, setQuery] = useState(""),
    [outcome, setOutcome] = useState(""),
    [patchFilter, setPatchFilter] = useState(
      () =>
        view.patches
          .filter((p) => !p.removedAt)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.id || "",
    ),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [player, setPlayer] = useState("");
  const [edit, setEdit] = useState<Game | "new" | null>(
      startOpen ? "new" : null,
    ),
    [detail, setDetail] = useState<Game | null>(null),
    [own, setOwn] = useState<Choice>(
      defaultArmy?.army || blank(view.me.faction),
    ),
    [enemy, setEnemy] = useState<Choice>(blank()),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [score, setScore] = useState("10");
  const [ownSavedId, setOwnSavedId] = useState(defaultArmy?.id || "");
  const [enemySavedId, setEnemySavedId] = useState("");
  const [ownVersionId, setOwnVersionId] = useState(
    defaultArmy?.currentVersionId || "",
  );
  const [enemyVersionId, setEnemyVersionId] = useState("");
  const [libraryContribution, setLibraryContribution] = useState(false);
  const [gameContext, setGameContext] = useState<RecordedGameContext>({
    version: "1",
  });
  const [consentBusy, setConsentBusy] = useState(false);
  const [rulesPatch, setRulesPatch] = useState(
    defaultArmy?.patchId ||
      view.defaultPatchId ||
      view.patches.find((p) => !p.removedAt)?.id ||
      "",
  );
  const rules =
    view.patches.find((p) => p.id === rulesPatch)?.catalogue || catalogue;
  function open(game: Game | "new") {
    if (game !== "new" && game.scrimId && game.scrimPairingId) {
      setScrimReport({ scrimId: game.scrimId, pairingId: game.scrimPairingId });
      setEdit(null);
      setDetail(null);
      return;
    }
    setRulesPatch(
      game === "new"
        ? defaultArmy?.patchId ||
            view.defaultPatchId ||
            view.patches.find((p) => !p.removedAt)?.id ||
            ""
        : game.patchId || "",
    );
    setScore(String(game === "new" ? 10 : game.score));
    setOwn(
      game === "new" ? defaultArmy?.army || blank(view.me.faction) : game.own,
    );
    setOpponentName(game === "new" ? "" : game.opponent);
    setOpponentUserId(game === "new" ? "" : game.opponentUserId || "");
    setEnemy(game === "new" ? blank() : game.enemy);
    setOwnSavedId(game === "new" ? defaultArmy?.id || "" : "");
    setEnemySavedId("");
    setOwnVersionId(
      game === "new"
        ? defaultArmy?.currentVersionId || ""
        : game.ownListVersionId || "",
    );
    setEnemyVersionId(game === "new" ? "" : game.enemyListVersionId || "");
    setLibraryContribution(game === "new" ? false : !!game.libraryContribution);
    setGameContext(
      game === "new" ? { version: "1" } : game.gameContext || { version: "1" },
    );
    setEdit(game);
  }
  const canLog = !userId || userId === view.me.id;
  const columns = [
    "Date",
    "Player",
    "Your army",
    "Opponent",
    "Opponent army",
    "Result",
    "Context",
  ] as const;
  const [sort, setSort] = useState<{
    column: (typeof columns)[number];
    ascending: boolean;
  }>({ column: "Date", ascending: false });
  const sortValue = (game: Game): string | number => {
    switch (sort.column) {
      case "Date":
        return game.date;
      case "Player":
        return view.users.find((u) => u.id === game.userId)?.name || "";
      case "Your army":
        return game.own.factionName;
      case "Opponent":
        return game.opponent;
      case "Opponent army":
        return game.enemy.factionName;
      case "Result":
        return game.score;
      case "Context":
        return game.context;
    }
  };
  const games = view.games
    .filter(
      (g) =>
        (!userId || g.userId === userId) &&
        (!player || g.userId === player) &&
        (!outcome || g.outcome === outcome) &&
        (!patchFilter || g.patchId === patchFilter) &&
        (!from || g.date >= from) &&
        (!to || g.date <= to) &&
        `${g.opponent} ${g.own.factionName} ${g.enemy.factionName} ${g.context}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const left = sortValue(a),
        right = sortValue(b);
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              sensitivity: "base",
              numeric: true,
            });
      return comparison
        ? comparison * (sort.ascending ? 1 : -1)
        : b.date.localeCompare(a.date);
    });
  return (
    <>
      {!embedded && (
        <PageHeading
          title="Game journal"
          description="Record games and review results for team training."
        >
          {canLog && (
            <button className="primary" onClick={() => open("new")}>
              <Plus size={17} />
              Log a game
            </button>
          )}
        </PageHeading>
      )}
      <section className="panel padded">
        {embedded && (
          <div className="section-heading">
            <h3>Game journal</h3>
            {canLog && (
              <button className="primary" onClick={() => open("new")}>
                <Plus size={16} />
                Log a game
              </button>
            )}
          </div>
        )}
        <div className="filters">
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Search games"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search opponents, armies, or context…"
            />
          </label>
          {view.me.role === "admin" && !userId && (
            <select
              aria-label="Filter player"
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
            >
              <option value="">All players</option>
              {view.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Filter outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="">All results</option>
            {["Win", "Draw", "Loss"].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <select
            aria-label="Filter rules patch"
            value={patchFilter}
            onChange={(e) => setPatchFilter(e.target.value)}
          >
            <option value="">All rules patches</option>
            {view.patches
              .filter(
                (p) =>
                  !p.removedAt ||
                  view.games.some(
                    (g) =>
                      g.patchId === p.id && (!userId || g.userId === userId),
                  ),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {patchLabel(p)}
                </option>
              ))}
          </select>
        </div>
        <div className="date-filters">
          <Field label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <span>
            {games.length} games ·{" "}
            {games.length
              ? (games.reduce((n, g) => n + g.score, 0) / games.length).toFixed(
                  1,
                )
              : "—"}{" "}
            average /20
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={
                      sort.column === column
                        ? sort.ascending
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      type="button"
                      className="journal-sort"
                      onClick={() =>
                        setSort({
                          column,
                          ascending:
                            sort.column === column ? !sort.ascending : true,
                        })
                      }
                    >
                      {column}
                      <span aria-hidden="true">
                        {sort.column === column
                          ? sort.ascending
                            ? " ↑"
                            : " ↓"
                          : " ↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr
                  key={g.id}
                  className="journal-game-row"
                  tabIndex={0}
                  aria-label={`Open game from ${g.date} against ${g.opponent}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, dialog"))
                      return;
                    setDetail(g);
                    setDeleting(false);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      setDetail(g);
                      setDeleting(false);
                    }
                  }}
                >
                  <td>{dateLabel(g.date)}</td>
                  <td>{view.users.find((u) => u.id === g.userId)?.name}</td>
                  <td>
                    <strong>
                      {g.own.listUrl || g.own.listText || g.own.summary ? (
                        <ArmyListLink
                          url={g.own.listUrl}
                          text={g.own.listText}
                          summary={g.own.summary}
                          name={g.own.listName || g.own.factionName}
                        >
                          <FactionName name={g.own.factionName} />
                        </ArmyListLink>
                      ) : (
                        <FactionName name={g.own.factionName} />
                      )}
                    </strong>
                    <small>
                      <DetachmentNames names={g.own.detachmentNames} />
                    </small>
                    <small>
                      <Disposition name={g.own.dispositionName} />
                    </small>
                  </td>
                  <td>{g.opponent}</td>
                  <td>
                    <small>
                      {g.enemy.listUrl ||
                      g.enemy.listText ||
                      g.enemy.summary ? (
                        <ArmyListLink
                          url={g.enemy.listUrl}
                          text={g.enemy.listText}
                          summary={g.enemy.summary}
                          name={g.enemy.listName || g.enemy.factionName}
                        >
                          <FactionName name={g.enemy.factionName} />
                        </ArmyListLink>
                      ) : (
                        <FactionName name={g.enemy.factionName} />
                      )}
                    </small>
                    <small>
                      <DetachmentNames names={g.enemy.detachmentNames} />
                    </small>
                    <small>
                      <Disposition name={g.enemy.dispositionName} />
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        g.outcome === "Win"
                          ? "green"
                          : g.outcome === "Loss"
                            ? "red"
                            : "neutral"
                      }
                    >
                      {g.score}/20 · {g.outcome}
                    </Badge>
                  </td>
                  <td>
                    {g.context}
                    <small>Layout {g.layout || "not recorded"}</small>
                    <small>
                      {view.patches.find((p) => p.id === g.patchId)?.name ||
                        "Unknown patch"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!games.length && (
          <Empty
            title="No games to show yet"
            description="Log your first game or change the filters to see more results."
          />
        )}
      </section>
      {reportingScrim && scrimReport && (
        <ScrimReport
          key={scrimReport.pairingId}
          view={view}
          scrim={reportingScrim}
          pairingId={scrimReport.pairingId}
          mutate={mutate}
          onClose={() => setScrimReport(null)}
        />
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "Log a game" : "Edit game"}
          wide
          onClose={() => setEdit(null)}
          draftKey={`game:${edit === "new" ? "new" : edit.id}`}
          busy={saving}
          draft={{
            value: {
              own,
              enemy,
              score,
              rulesPatch,
              opponentName,
              opponentUserId,
              ownSavedId,
              enemySavedId,
              ownVersionId,
              enemyVersionId,
              libraryContribution,
              gameContext,
            },
            restore: (saved) => {
              setOwn(saved.own);
              setEnemy(saved.enemy);
              setScore(saved.score);
              setRulesPatch(saved.rulesPatch);
              setOpponentName(saved.opponentName);
              setOpponentUserId(saved.opponentUserId);
              setOwnSavedId(saved.ownSavedId);
              setEnemySavedId(saved.enemySavedId);
              setOwnVersionId(saved.ownVersionId);
              setEnemyVersionId(saved.enemyVersionId);
              setLibraryContribution(saved.libraryContribution);
              setGameContext(saved.gameContext);
            },
          }}
        >
          {edit === "new" && (
            <Field label="Scrim (optional)">
              <select
                defaultValue=""
                onChange={(e) => {
                  const scrim = view.scrims?.find(
                    (s) => s.id === e.target.value,
                  );
                  const entry = scrim?.teams
                    .flatMap((t) => t.entries)
                    .find((p) => p.userId === view.me.id);
                  const pair = scrim?.pairings.find(
                    (p) => p.aId === entry?.id || p.bId === entry?.id,
                  );
                  if (scrim && pair) {
                    setEdit(null);
                    setScrimReport({ scrimId: scrim.id, pairingId: pair.id });
                  }
                }}
              >
                <option value="">Regular game — enter details</option>
                {(view.scrims || [])
                  .filter(
                    (s) =>
                      s.pairedAt &&
                      !s.cancelled &&
                      s.teams.some((t) =>
                        t.entries.some((p) => p.userId === view.me.id),
                      ),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {view.events.find((e) => e.id === s.eventId)?.title}
                    </option>
                  ))}
              </select>
              <small>
                Choose a scrim to fill both lists, opponent, rules and layout
                automatically.
              </small>
            </Field>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setSaving(true);
              const ok = await mutate({
                type: "game",
                ...(edit !== "new" ? { id: edit.id } : {}),
                date: f.get("date"),
                opponent: f.get("opponent"),
                opponentUserId,
                score: Number(f.get("score")),
                layout: f.get("layout"),
                patchId: f.get("patchId"),
                context: f.get("context"),
                notes: f.get("notes"),
                eventId: f.get("eventId"),
                own,
                enemy,
                ownListVersionId: ownVersionId || undefined,
                enemyListVersionId: enemyVersionId || undefined,
                libraryContribution,
                gameContext: gameContext.missionPack ? gameContext : undefined,
              });
              setSaving(false);
              if (ok) setEdit(null);
            }}
          >
            <div className="form-grid">
              <Field label="Game date">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={
                    edit === "new"
                      ? new Date().toISOString().slice(0, 10)
                      : edit.date
                  }
                />
              </Field>
              <div>
                <Field label="Opponent name">
                  <input
                    name="opponent"
                    value={opponentName}
                    maxLength={120}
                    placeholder="Name or @player"
                    autoComplete="off"
                    onChange={(e) => {
                      setOpponentName(e.target.value);
                      setOpponentUserId("");
                    }}
                  />
                </Field>
                {mentionQuery !== null && (
                  <div
                    className="opponent-suggestions"
                    aria-label="Player suggestions"
                  >
                    {mentions.length ? (
                      mentions.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => {
                            setOpponentName(`@${p.name}`);
                            setOpponentUserId(p.id);
                          }}
                        >
                          @{p.name}
                        </button>
                      ))
                    ) : (
                      <small>No matching players</small>
                    )}
                  </div>
                )}
              </div>
            </div>
            {(ownVersionId && !ownSavedId) ||
            (enemyVersionId && !enemySavedId) ? (
              <p>
                Recorded immutable list-version references are retained.
                Changing an army configuration clears its reference.
              </p>
            ) : null}
            <div className="form-grid armies">
              <GameArmyFields
                key={`own-${rulesPatch}`}
                view={view}
                patchId={rulesPatch}
                selected={ownSavedId}
                setSelected={(id) => {
                  setOwnSavedId(id);
                  setOwnVersionId(
                    view.savedArmies?.find((a) => a.id === id)
                      ?.currentVersionId || "",
                  );
                }}
                value={own}
                onChange={(choice) => {
                  if (JSON.stringify(choice) !== JSON.stringify(own))
                    setOwnVersionId("");
                  setOwn(choice);
                }}
                rules={rules}
              />
              <GameArmyFields
                key={`enemy-${rulesPatch}`}
                view={view}
                patchId={rulesPatch}
                opponent
                opponentUserId={opponentUserId}
                selected={enemySavedId}
                setSelected={(id) => {
                  setEnemySavedId(id);
                  setEnemyVersionId(
                    view.savedArmies?.find((a) => a.id === id)
                      ?.currentVersionId || "",
                  );
                }}
                rules={rules}
                value={enemy}
                onChange={(choice) => {
                  if (JSON.stringify(choice) !== JSON.stringify(enemy))
                    setEnemyVersionId("");
                  setEnemy(choice);
                }}
              />
            </div>
            <div className="form-grid">
              <Field label="Your team score (0–20)">
                <input
                  name="score"
                  type="number"
                  min={0}
                  max={20}
                  step={1}
                  required
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </Field>
              <Field label="Outcome">
                <output className="calculated-outcome" aria-live="polite">
                  {score === ""
                    ? "Enter a score"
                    : Number(score) === 10
                      ? "Draw"
                      : Number(score) > 10
                        ? "Win"
                        : "Loss"}
                </output>
              </Field>
              <Field label="Table layout">
                <select
                  name="layout"
                  required
                  defaultValue={edit === "new" ? "" : edit.layout || ""}
                >
                  <option value="" disabled>
                    Choose a layout
                  </option>
                  {["A", "B", "C"].map((l) => (
                    <option key={l} value={l}>
                      Layout {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rules patch">
                <select
                  name="patchId"
                  required
                  value={rulesPatch}
                  onChange={(e) => {
                    setRulesPatch(e.target.value);
                    setOwnSavedId(
                      defaultArmy?.patchId === e.target.value
                        ? defaultArmy.id
                        : "",
                    );
                    setEnemySavedId("");
                    setOwnVersionId(
                      defaultArmy?.patchId === e.target.value
                        ? defaultArmy.currentVersionId || ""
                        : "",
                    );
                    setEnemyVersionId("");
                    setOwn(
                      defaultArmy?.patchId === e.target.value
                        ? defaultArmy.army
                        : blank(own.faction),
                    );
                    setEnemy(blank(enemy.faction));
                  }}
                >
                  <option value="" disabled>
                    Choose a patch
                  </option>
                  {view.patches
                    .filter(
                      (p) =>
                        !p.removedAt ||
                        (edit !== "new" && edit.patchId === p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {patchLabel(p)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Context">
                <input
                  name="context"
                  required
                  placeholder="Practice, tournament, team training…"
                  defaultValue={edit === "new" ? "Practice" : edit.context}
                />
              </Field>
              <Field label="Related team event (optional)">
                <select
                  name="eventId"
                  defaultValue={edit === "new" ? "" : edit.eventId}
                >
                  <option value="">No linked event</option>
                  {view.events
                    .filter((ev) => !ev.scrimId)
                    .map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <RecordedContextFields
              value={gameContext}
              onChange={setGameContext}
            />
            <label className="field">
              <span>
                <input
                  type="checkbox"
                  checked={libraryContribution}
                  onChange={(e) => setLibraryContribution(e.target.checked)}
                />{" "}
                Contribute this game to Army libraries
              </span>
              <small>
                Shares your recorded score and authorized army/context facts.
                Opponent identity and private reflections stay private. Roster
                sharing is controlled separately in My armies.
              </small>
            </label>
            <Field label="Reflection & lessons">
              <textarea
                name="notes"
                defaultValue={edit === "new" ? "" : edit.notes}
                placeholder="What was the plan? What would you do differently?"
              />
            </Field>
            <div className="form-footer">
              <button type="button" data-modal-close>
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                <Check size={16} />
                Save game
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detail && (
        <Modal
          title={`Game vs. ${detail.opponent}`}
          wide
          onClose={() => setDetail(null)}
        >
          <div className="section-heading">
            <p>
              {dateLabel(detail.date)} · {detail.context} · Layout{" "}
              {detail.layout || "not recorded"}
              {" · "}
              {view.patches.find((p) => p.id === detail.patchId)
                ? patchLabel(view.patches.find((p) => p.id === detail.patchId)!)
                : "Unknown patch"}
            </p>
            <Badge tone="blue">
              {detail.score} /20 · {detail.outcome}
            </Badge>
          </div>
          <div className="form-grid">
            {[
              { title: "Own army", army: detail.own },
              { title: "Opponent army", army: detail.enemy },
            ].map(({ title, army }) => (
              <section className="army-summary" key={title}>
                <small>{title}</small>
                <h3>
                  <FactionName name={army.factionName} />
                </h3>
                <p>
                  <DetachmentNames
                    names={army.detachmentNames}
                    separator=" · "
                  />
                </p>
                <Badge>
                  <Disposition name={army.dispositionName} />
                </Badge>
                {(army.listUrl || army.listText || army.summary) && (
                  <ArmyListLink
                    url={army.listUrl}
                    text={army.listText}
                    summary={army.summary}
                    name={army.listName || army.factionName}
                  />
                )}
              </section>
            ))}
          </div>
          <h3>Reflection</h3>
          <p>
            Mission pack: {detail.gameContext?.missionPack?.name || "Unknown"} ·
            Deployment: {detail.gameContext?.deployment?.name || "Unknown"}
            <br />
            Your mission: {detail.gameContext?.ownMission?.name || "Unknown"} ·
            Opponent mission:{" "}
            {detail.gameContext?.enemyMission?.name || "Unknown"}
          </p>
          <p className="preserve">
            {detail.notes || "No reflection recorded."}
          </p>
          {detail.userId === view.me.id && (
            <div className="form-footer">
              <button
                disabled={consentBusy || !!view.accessPreview?.active}
                aria-pressed={!!detail.libraryContribution}
                onClick={async () => {
                  setConsentBusy(true);
                  const contribution = !detail.libraryContribution;
                  if (
                    await mutate({
                      type: "libraryGameContribution",
                      id: detail.id,
                      contribution,
                    })
                  )
                    setDetail({ ...detail, libraryContribution: contribution });
                  setConsentBusy(false);
                }}
              >
                {detail.libraryContribution
                  ? "Withdraw library contribution"
                  : "Contribute this game to libraries"}
              </button>
              <button
                onClick={() => {
                  open(detail);
                  setDetail(null);
                }}
              >
                <Pencil size={16} />
                Edit game
              </button>
              {!detail.scrimPairingId &&
                (!deleting ? (
                  <button className="danger" onClick={() => setDeleting(true)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                ) : (
                  <button
                    className="danger"
                    onClick={async () => {
                      if (await mutate({ type: "deleteGame", id: detail.id }))
                        setDetail(null);
                    }}
                  >
                    Confirm delete game
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
