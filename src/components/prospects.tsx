"use client";
import { useState } from "react";
import {
  ArrowRight,
  Search,
  Users,
  Clock3,
  CheckCircle2,
  BarChart3,
  MapPin,
  CalendarDays,
  ChevronRight,
} from "lucide-react";
import type { View, User } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import { Avatar, Badge, Empty, Progress, dateLabel } from "./ui";
export function phaseName(view: View, user: User) {
  return user.rejected
    ? "Not selected"
    : view.phases.find((p) => p.id === user.phaseId)?.name || "Member";
}
export function phaseTone(view: View, user: User) {
  return user.rejected
    ? "red"
    : view.phases.find((p) => p.id === user.phaseId)?.kind === "selected"
      ? "green"
      : view.phases.find((p) => p.id === user.phaseId)?.kind === "application"
        ? "amber"
        : "blue";
}
export function factionName(id: string) {
  return catalogue.factions.find((f) => f.id === id)?.name || "Unknown";
}
export function stats(view: View, userId?: string) {
  const games = view.games.filter((g) => !userId || g.userId === userId);
  return {
    count: games.length,
    avg: games.length
      ? (games.reduce((sum, g) => sum + g.score, 0) / games.length).toFixed(1)
      : "—",
    wins: games.filter((g) => g.outcome === "Win").length,
    draws: games.filter((g) => g.outcome === "Draw").length,
  };
}
export default function Prospects({
  view,
  openProfile,
  openEvents,
}: {
  view: View;
  openProfile: (id: string) => void;
  openEvents: () => void;
}) {
  const [now] = useState(() => Date.now());
  const [phase, setPhase] = useState("all"),
    [query, setQuery] = useState(""),
    [faction, setFaction] = useState("");
  const [listPage, setListPage] = useState(1);
  const prospects = view.users.filter(
      (u) => !u.removedAt && u.phaseId && !u.rejected,
    ),
    selected = prospects.filter(
      (u) => view.phases.find((p) => p.id === u.phaseId)?.kind === "selected",
    ).length;
  const filtered = view.users.filter(
    (u) =>
      !u.removedAt &&
      (phase === "all"
        ? !!u.phaseId
        : phase === "rejected"
          ? u.rejected
          : u.phaseId === phase && !u.rejected) &&
      (!faction || u.faction === faction) &&
      `${u.name} ${factionName(u.faction)} ${u.city}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const safePage = Math.min(listPage, pageCount);
  const visiblePlayers = filtered.slice((safePage - 1) * 6, safePage * 6);
  const next = view.events
    .filter((e) => !e.cancelled && Date.parse(e.endsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Prospects</h1>
          <p>Build the next eight.</p>
        </div>
        <button className="primary" onClick={() => setPhase(view.phases[0].id)}>
          Review applications
          <ArrowRight size={17} />
        </button>
      </header>
      <div className="dashboard-grid">
        <div>
          <div className="metrics">
            {[
              {
                label: "Active prospects",
                value: prospects.length,
                icon: Users,
                tone: "blue",
              },
              {
                label: "Awaiting review",
                value: prospects.filter((u) => u.phaseId === view.phases[0].id)
                  .length,
                icon: Clock3,
                tone: "amber",
              },
              {
                label: "Selected",
                value: `${selected} / 8`,
                icon: CheckCircle2,
                tone: "green",
              },
              {
                label: "Games this month",
                value: view.games.filter((g) =>
                  g.date.startsWith(new Date().toISOString().slice(0, 7)),
                ).length,
                icon: BarChart3,
                tone: "neutral",
              },
            ].map((m) => (
              <div className="metric" key={m.label}>
                <span className={`metric-icon ${m.tone}`}>
                  <m.icon size={23} />
                </span>
                <div>
                  <strong>{m.value}</strong>
                  <span>{m.label}</span>
                </div>
              </div>
            ))}
          </div>
          <section className="panel roster">
            <div className="tabs">
              <button
                className={phase === "all" ? "active" : ""}
                onClick={() => setPhase("all")}
              >
                All prospects
              </button>
              {view.phases.map((p) => (
                <button
                  className={phase === p.id ? "active" : ""}
                  key={p.id}
                  onClick={() => setPhase(p.id)}
                >
                  {p.name}
                </button>
              ))}
              <button
                className={phase === "rejected" ? "active" : ""}
                onClick={() => setPhase("rejected")}
              >
                Not selected
              </button>
            </div>
            <div className="filters">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Search prospects"
                  placeholder="Search players, armies, or cities…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Filter faction"
                value={faction}
                onChange={(e) => setFaction(e.target.value)}
              >
                <option value="">All factions</option>
                {[...new Set(view.users.map((u) => u.faction))].map((f) => (
                  <option key={f} value={f}>
                    {factionName(f)}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Army</th>
                    <th>Phase</th>
                    <th>Games</th>
                    <th>Avg. score</th>
                    <th>Focus goals</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((u) => {
                    const s = stats(view, u.id),
                      goals = view.goals.filter((g) => g.userId === u.id),
                      done = goals.filter(
                        (g) => g.status === "Completed",
                      ).length;
                    return (
                      <tr key={u.id}>
                        <td>
                          <button
                            className="player-link"
                            onClick={() => openProfile(u.id)}
                          >
                            <Avatar name={u.name} />
                            <span>
                              {u.name}
                              <small>{u.city}</small>
                            </span>
                          </button>
                        </td>
                        <td>{factionName(u.faction)}</td>
                        <td>
                          <Badge tone={phaseTone(view, u)}>
                            {phaseName(view, u)}
                          </Badge>
                        </td>
                        <td>{s.count}</td>
                        <td>
                          <strong>{s.avg}</strong>
                          <small className="inline-muted"> /20</small>
                        </td>
                        <td className="goal-cell">
                          <span>
                            {goals.find((g) => g.status !== "Completed")
                              ?.title || "Goals completed"}
                          </span>
                          <div className="row">
                            <Progress value={done} max={goals.length} />
                            <small>
                              {done}/{goals.length}
                            </small>
                          </div>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`Open ${u.name}`}
                            onClick={() => openProfile(u.id)}
                          >
                            <ChevronRight size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <Empty
                title="No matching prospects"
                description="Try another search or selection phase."
              />
            )}
            <div className="table-footer">
              <span>
                {filtered.length
                  ? `${(safePage - 1) * 6 + 1}–${Math.min(safePage * 6, filtered.length)}`
                  : "0"}{" "}
                of {filtered.length} players · Scores /20
              </span>
              <div className="row">
                <button
                  className="small"
                  disabled={safePage === 1}
                  onClick={() => setListPage(safePage - 1)}
                >
                  Previous
                </button>
                <span>
                  {safePage} / {pageCount}
                </span>
                <button
                  className="small"
                  disabled={safePage === pageCount}
                  onClick={() => setListPage(safePage + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </div>
        <aside className="panel rail">
          <h3>Next team event</h3>
          {next ? (
            <>
              <div className="rail-line">
                <CalendarDays size={20} />
                <div>
                  <small>{dateLabel(next.startsAt)}</small>
                  <strong>{next.title}</strong>
                </div>
              </div>
              <div className="rail-line">
                <MapPin size={19} />
                <span>{next.location}</span>
              </div>
              <div className="rail-line">
                <Users size={19} />
                <span>{next.capacity} player places</span>
              </div>
              <button className="primary full" onClick={openEvents}>
                View event details
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <p>No upcoming events.</p>
          )}
          <hr />
          <h3>Selection progress</h3>
          <div className="row between">
            <strong>{selected} of 8 selected</strong>
            <small>{Math.round((selected / 8) * 100)}%</small>
          </div>
          <Progress value={selected} max={8} />
          <div className="phase-progress">
            {view.phases.map((p) => {
              const count = prospects.filter((u) => u.phaseId === p.id).length;
              return (
                <div key={p.id}>
                  <div className="row between">
                    <span>{p.name}</span>
                    <small>{count}</small>
                  </div>
                  <Progress value={count} max={prospects.length} />
                </div>
              );
            })}
          </div>
          <div className="quiet-note">
            Eight players.
            <br />A team built through practice,
            <br />
            progress, and shared ambition.
          </div>
        </aside>
      </div>
    </>
  );
}
