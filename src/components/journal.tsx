"use client";
import { patchLabel } from "@/lib/patches";
import { useState } from "react";
import {
  Plus,
  Search,
  ArrowUpRight,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import type { Army, Game, View } from "@/lib/types";
import { catalogue, dispositionsFor } from "@/lib/catalogue";
import type { Mutate } from "./workspace";
import { Badge, Field, Modal, Empty, dateLabel } from "./ui";
type Choice = Pick<Army, "faction" | "detachments" | "disposition" | "listUrl">;
function blank(faction = catalogue.factions[0].id): Choice {
  return { faction, detachments: [], disposition: "", listUrl: "" };
}
function ArmyFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: Choice;
  onChange: (c: Choice) => void;
}) {
  const faction = catalogue.factions.find((f) => f.id === value.faction)!,
    available = dispositionsFor(value.faction, value.detachments);
  return (
    <fieldset className="army-fields">
      <legend>{title}</legend>
      <Field label="Army">
        <select
          value={value.faction}
          onChange={(e) => onChange(blank(e.target.value))}
        >
          {catalogue.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="field">
        <span>
          Detachments <small>({value.detachments.length}/3)</small>
        </span>
        <div className="detachment-options">
          {faction.detachments.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={value.detachments.includes(d.id)}
                disabled={
                  !value.detachments.includes(d.id) &&
                  value.detachments.length >= 3
                }
                onChange={(e) => {
                  const selected = e.target.checked
                    ? [...value.detachments, d.id]
                    : value.detachments.filter((id) => id !== d.id);
                  onChange({
                    ...value,
                    detachments: selected,
                    disposition: dispositionsFor(value.faction, selected).some(
                      (d) => d.id === value.disposition,
                    )
                      ? value.disposition
                      : "",
                  });
                }}
              />
              <span>{d.name}</span>
              <small>{d.points} DP</small>
            </label>
          ))}
        </div>
      </div>
      <Field label="Force disposition">
        <select
          required
          value={value.disposition}
          onChange={(e) => onChange({ ...value, disposition: e.target.value })}
        >
          <option value="">Select a disposition</option>
          {available.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Army-list link (optional)">
        <input
          type="url"
          placeholder="https://www.newrecruit.eu/…"
          value={value.listUrl}
          onChange={(e) => onChange({ ...value, listUrl: e.target.value })}
        />
      </Field>
      <small>New Recruit · catalogue revision {faction.revision}</small>
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
  const [query, setQuery] = useState(""),
    [outcome, setOutcome] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [player, setPlayer] = useState("");
  const [edit, setEdit] = useState<Game | "new" | null>(
      startOpen ? "new" : null,
    ),
    [detail, setDetail] = useState<Game | null>(null),
    [own, setOwn] = useState<Choice>(blank(view.me.faction)),
    [enemy, setEnemy] = useState<Choice>(blank()),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [score, setScore] = useState("10");
  function open(game: Game | "new") {
    setScore(String(game === "new" ? 10 : game.score));
    setOwn(game === "new" ? blank(view.me.faction) : game.own);
    setEnemy(game === "new" ? blank() : game.enemy);
    setEdit(game);
  }
  const canLog = !userId || userId === view.me.id;
  const games = view.games
    .filter(
      (g) =>
        (!userId || g.userId === userId) &&
        (!player || g.userId === player) &&
        (!outcome || g.outcome === outcome) &&
        (!from || g.date >= from) &&
        (!to || g.date <= to) &&
        `${g.opponent} ${g.own.factionName} ${g.enemy.factionName} ${g.context}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      {!embedded && (
        <header className="page-heading">
          <div>
            <h1>Game journal</h1>
            <p>Every game is something to learn from.</p>
          </div>
          {canLog && (
            <button className="primary" onClick={() => open("new")}>
              <Plus size={17} />
              Log a game
            </button>
          )}
        </header>
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
                <th>Date / Player</th>
                <th>Your army</th>
                <th>Opponent</th>
                <th>Result</th>
                <th>Context</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td>
                    {dateLabel(g.date)}
                    <small>
                      {view.users.find((u) => u.id === g.userId)?.name}
                    </small>
                  </td>
                  <td>
                    <strong>{g.own.factionName}</strong>
                    <small>{g.own.dispositionName}</small>
                  </td>
                  <td>
                    {g.opponent}
                    <small>{g.enemy.factionName}</small>
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
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View game against ${g.opponent}`}
                      onClick={() => {
                        setDetail(g);
                        setDeleting(false);
                      }}
                    >
                      <ArrowUpRight size={17} />
                    </button>
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
      {edit && (
        <Modal
          title={edit === "new" ? "Log a game" : "Edit game"}
          wide
          onClose={() => setEdit(null)}
        >
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
                score: Number(f.get("score")),
                layout: f.get("layout"),
                patchId: f.get("patchId"),
                context: f.get("context"),
                notes: f.get("notes"),
                eventId: f.get("eventId"),
                own,
                enemy,
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
              <Field label="Opponent name">
                <input
                  name="opponent"
                  required
                  defaultValue={edit === "new" ? "" : edit.opponent}
                />
              </Field>
            </div>
            <div className="form-grid armies">
              <ArmyFields title="Your army" value={own} onChange={setOwn} />
              <ArmyFields
                title="Opponent's army"
                value={enemy}
                onChange={setEnemy}
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
                <small>0–9 loss · 10 draw · 11–20 win</small>
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
                  defaultValue={
                    edit === "new"
                      ? view.patches[0]?.id || ""
                      : edit.patchId || ""
                  }
                >
                  <option value="" disabled>
                    Choose a patch
                  </option>
                  {view.patches.map((p) => (
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
                  {view.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Reflection & lessons">
              <textarea
                name="notes"
                defaultValue={edit === "new" ? "" : edit.notes}
                placeholder="What was the plan? What would you do differently?"
              />
            </Field>
            <div className="form-footer">
              <button type="button" onClick={() => setEdit(null)}>
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
                <h3>{army.factionName}</h3>
                <p>{army.detachmentNames.join(" · ")}</p>
                <Badge>{army.dispositionName}</Badge>
                {army.listUrl && (
                  <a target="_blank" rel="noreferrer" href={army.listUrl}>
                    Open army list
                    <ArrowUpRight size={14} />
                  </a>
                )}
              </section>
            ))}
          </div>
          <h3>Reflection</h3>
          <p className="preserve">
            {detail.notes || "No reflection recorded."}
          </p>
          {detail.userId === view.me.id && (
            <div className="form-footer">
              <button
                onClick={() => {
                  open(detail);
                  setDetail(null);
                }}
              >
                <Pencil size={16} />
                Edit game
              </button>
              {!deleting ? (
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
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
