"use client";
import { useState } from "react";
import {
  MapPin,
  Mail,
  LockKeyhole,
  Plus,
  Send,
  Check,
  Pencil,
  ArrowRight,
} from "lucide-react";
import type { View } from "@/lib/types";
import { criteria, originalCriteria } from "@/lib/types";
import { catalogue } from "@/lib/catalogue";
import type { Mutate } from "./workspace";
import { Avatar, Badge, Field, Modal, Empty, dateLabel } from "./ui";
import { factionName, phaseName, phaseTone, stats } from "./prospects";
import Journal from "./journal";
export default function Profile({
  view,
  userId,
  mutate,
}: {
  view: View;
  userId: string;
  mutate: Mutate;
}) {
  const user = view.users.find((u) => u.id === userId)!,
    admin = view.me.role === "admin",
    isOwn = view.me.id === userId;
  const [tab, setTab] = useState("Overview"),
    [modal, setModal] = useState(""),
    [saving, setSaving] = useState(false);
  if (!user)
    return (
      <Empty
        title="Profile unavailable"
        description="You do not have access to this profile."
      />
    );
  const stat = stats(view, user.id),
    goals = view.goals.filter((g) => g.userId === user.id),
    evaluation = view.evaluations.find((e) => e.userId === user.id);
  async function save(c: object) {
    setSaving(true);
    const ok = await mutate(c);
    setSaving(false);
    if (ok) setModal("");
    return ok;
  }
  const tabs = [
    "Overview",
    "Game journal",
    "Focus goals",
    "Conversation",
    ...(admin ? ["Evaluation", "Internal discussion"] : []),
  ];
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Player profile</h1>
          <p>Practice with purpose. Make progress visible.</p>
        </div>
        {isOwn && (
          <button onClick={() => setModal("edit")}>
            <Pencil size={16} />
            Edit profile
          </button>
        )}
      </header>
      <section className="panel profile-header">
        <Avatar name={user.name} />
        <div className="profile-identity">
          <h2>{user.name}</h2>
          <p>
            {factionName(user.faction)} <span>·</span> <MapPin size={14} />
            {user.city || "Location not set"}
          </p>
        </div>
        <Badge tone={phaseTone(view, user)}>{phaseName(view, user)}</Badge>
        {admin && (
          <button onClick={() => setModal("phase")}>
            Update phase
            <ArrowRight size={15} />
          </button>
        )}
      </section>
      <div className="tabs profile-tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {(t === "Evaluation" || t === "Internal discussion") && (
              <LockKeyhole size={13} />
            )}{" "}
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="profile-grid">
          <div>
            <div className="metrics three">
              {[
                { label: "Games played", value: stat.count },
                { label: "Average team score", value: `${stat.avg} / 20` },
                {
                  label: "Win rate",
                  value: stat.count
                    ? `${Math.round((stat.wins / stat.count) * 100)}%`
                    : "—",
                },
              ].map((m) => (
                <div className="metric" key={m.label}>
                  <div>
                    <strong>{m.value}</strong>
                    <span>{m.label}</span>
                  </div>
                </div>
              ))}
            </div>
            <section className="panel padded">
              <h3>About {user.name.split(" ")[0]}</h3>
              <p className="preserve">
                {user.bio || "No player introduction yet."}
              </p>
              <div className="rail-line">
                <Mail size={16} />
                {user.email}
              </div>
              <hr />
              <h3>Team application</h3>
              <p className="preserve">
                {user.application || "No application submitted yet."}
              </p>
              {isOwn && (!user.phaseId || user.rejected) && (
                <button
                  className="primary"
                  onClick={() => setModal("application")}
                >
                  Apply for the team
                  <ArrowRight size={16} />
                </button>
              )}
            </section>
            <section className="panel padded">
              <div className="section-heading">
                <h3>Recent games</h3>
                <button
                  className="text-button"
                  onClick={() => setTab("Game journal")}
                >
                  View journal
                  <ArrowRight size={15} />
                </button>
              </div>
              {view.games
                .filter((g) => g.userId === user.id)
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 3)
                .map((g) => (
                  <div className="list-row" key={g.id}>
                    <div>
                      <strong>vs. {g.opponent}</strong>
                      <small>
                        {g.enemy.factionName} · {dateLabel(g.date)}
                      </small>
                    </div>
                    <Badge
                      tone={
                        g.outcome === "Win"
                          ? "green"
                          : g.outcome === "Loss"
                            ? "red"
                            : "neutral"
                      }
                    >
                      {g.score} / 20
                    </Badge>
                  </div>
                ))}
              {!stat.count && (
                <Empty
                  title="The first game starts here"
                  description="Record a game to start building your journal."
                />
              )}
            </section>
            {stat.count > 0 && (
              <section className="panel padded">
                <h3>Matchup overview</h3>
                <p>
                  Results by opposing army. Small samples are a starting point
                  for review.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Opponent army</th>
                        <th>Games</th>
                        <th>Wins / Draws / Losses</th>
                        <th>Avg. /20</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...new Set(
                          view.games
                            .filter((g) => g.userId === user.id)
                            .map((g) => g.enemy.factionName),
                        ),
                      ].map((name) => {
                        const games = view.games.filter(
                          (g) =>
                            g.userId === user.id &&
                            g.enemy.factionName === name,
                        );
                        return (
                          <tr key={name}>
                            <td>{name}</td>
                            <td>{games.length}</td>
                            <td>
                              {games.filter((g) => g.outcome === "Win").length}{" "}
                              /{" "}
                              {games.filter((g) => g.outcome === "Draw").length}{" "}
                              /{" "}
                              {games.filter((g) => g.outcome === "Loss").length}
                            </td>
                            <td>
                              {(
                                games.reduce((sum, g) => sum + g.score, 0) /
                                games.length
                              ).toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
          <aside className="panel padded">
            <h3>Your selection journey</h3>
            <div className="journey">
              {view.phases.map((p, i) => (
                <div
                  className={
                    p.id === user.phaseId && !user.rejected ? "current" : ""
                  }
                  key={p.id}
                >
                  <span>{i + 1}</span>
                  <div>
                    <strong>{p.name}</strong>
                    {p.id === user.phaseId && !user.rejected && (
                      <small>Current phase</small>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <hr />
            <h3>Current focus</h3>
            {goals
              .filter((g) => g.status !== "Completed")
              .map((g) => (
                <div className="focus-preview" key={g.id}>
                  <strong>{g.title}</strong>
                  <p>{g.description}</p>
                  <Badge>{g.status}</Badge>
                </div>
              ))}
            {!goals.filter((g) => g.status !== "Completed").length && (
              <p>No active goals assigned.</p>
            )}
            <button className="full" onClick={() => setTab("Focus goals")}>
              Open focus list
              <ArrowRight size={15} />
            </button>
          </aside>
        </div>
      )}
      {tab === "Game journal" && (
        <Journal view={view} mutate={mutate} userId={user.id} embedded />
      )}
      {tab === "Focus goals" && (
        <section className="panel padded">
          <div className="section-heading">
            <div>
              <h3>Focus list</h3>
              <p>Small, specific improvements that move your game forward.</p>
            </div>
            {admin && (
              <button className="primary" onClick={() => setModal("goal")}>
                <Plus size={16} />
                Add goal
              </button>
            )}
          </div>
          {goals.map((g) => (
            <form
              key={`${g.id}-${g.status}-${g.evidence}`}
              className="goal-item"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save({
                  type: "goalProgress",
                  id: g.id,
                  status: f.get("status"),
                  evidence: f.get("evidence"),
                  gameId: f.get("gameId"),
                });
              }}
            >
              <div className="section-heading">
                <h3>{g.title}</h3>
                <Badge tone={g.status === "Completed" ? "green" : "blue"}>
                  {g.status}
                </Badge>
              </div>
              <p>{g.description}</p>
              <small>
                Assigned by {g.createdBy}
                {g.due ? ` · Due ${dateLabel(g.due)}` : ""}
              </small>
              <div className="form-grid">
                <Field label="Progress">
                  <select
                    name="status"
                    defaultValue={g.status}
                    disabled={!admin && g.status === "Completed"}
                  >
                    {[
                      "Not started",
                      "In progress",
                      "Ready for review",
                      ...(admin || g.status === "Completed"
                        ? ["Completed"]
                        : []),
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Supporting game">
                  <select name="gameId" defaultValue={g.gameId}>
                    <option value="">No linked game</option>
                    {view.games
                      .filter((game) => game.userId === user.id)
                      .map((game) => (
                        <option value={game.id} key={game.id}>
                          {game.date} · vs {game.opponent} · {game.score}/20
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="Evidence & progress notes">
                <textarea
                  name="evidence"
                  defaultValue={g.evidence}
                  placeholder="What did you work on? What changed?"
                />
              </Field>
              <button disabled={saving || (!admin && g.status === "Completed")}>
                <Check size={16} />
                Save progress
              </button>
            </form>
          ))}
          {!goals.length && (
            <Empty
              title="A clear focus starts here"
              description="Admins can assign specific goals and review the evidence as you progress."
            />
          )}
        </section>
      )}
      {(tab === "Conversation" || tab === "Internal discussion") && (
        <section className="panel padded conversation">
          <div className="section-heading">
            <div>
              <h3>
                {tab === "Conversation"
                  ? "Player conversation"
                  : "Admin-only discussion"}
              </h3>
              <p>
                {tab === "Conversation"
                  ? "Visible only to this player and the admin team."
                  : "Confidential. The player cannot see these messages."}
              </p>
            </div>
            <LockKeyhole size={20} />
          </div>
          <div className="message-list">
            {view.messages
              .filter(
                (m) =>
                  m.userId === user.id &&
                  m.internal === (tab === "Internal discussion"),
              )
              .map((m) => (
                <article
                  className={`message ${m.internal ? "internal" : ""}`}
                  key={m.id}
                >
                  <Avatar name={m.authorName} />
                  <div>
                    <div className="row">
                      <strong>{m.authorName}</strong>
                      <small>{dateLabel(m.createdAt)}</small>
                      {m.internal && <Badge>Admin only</Badge>}
                    </div>
                    <p className="preserve">{m.text}</p>
                  </div>
                </article>
              ))}
            {!view.messages.some(
              (m) =>
                m.userId === user.id &&
                m.internal === (tab === "Internal discussion"),
            ) && (
              <Empty
                title="Start a conversation"
                description="Use this space for thoughtful feedback and follow-up."
              />
            )}
          </div>
          <form
            key={tab}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (
                await save({
                  type: "message",
                  userId: user.id,
                  internal: tab === "Internal discussion",
                  text: f.get("text"),
                })
              )
                form.reset();
            }}
          >
            <Field
              label={
                tab === "Internal discussion"
                  ? "New admin-only message"
                  : "Message to the player and admins"
              }
            >
              <textarea
                required
                name="text"
                placeholder={
                  tab === "Internal discussion"
                    ? "Write a confidential note…"
                    : "Share feedback or ask a question…"
                }
              />
            </Field>
            <button className="primary" disabled={saving}>
              <Send size={16} />
              {tab === "Internal discussion"
                ? "Send internal note"
                : "Send message"}
            </button>
          </form>
        </section>
      )}
      {tab === "Evaluation" && admin && (
        <section className="panel padded">
          <div className="section-heading">
            <div>
              <h3>Shared evaluation</h3>
              <p>
                One assessment, maintained by the admin team. 1 = needs
                development · 5 = exceptional.
              </p>
            </div>
            <Badge>
              <LockKeyhole size={12} />
              Admins only
            </Badge>
          </div>
          <form
            key={evaluation?.revision || 0}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save({
                type: "evaluation",
                userId: user.id,
                revision: evaluation?.revision || 0,
                ratings: criteria.map((_, i) => ({
                  score: f.get(`score${i}`) ? Number(f.get(`score${i}`)) : null,
                  note: f.get(`note${i}`) || "",
                })),
              });
            }}
          >
            <div className="evaluation-list">
              {criteria.map((c, i) => (
                <div className="evaluation-row" key={c}>
                  <div>
                    <span className="criterion-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong title={originalCriteria[i]}>{c}</strong>
                  </div>
                  <select
                    name={`score${i}`}
                    aria-label={`Score: ${c}`}
                    defaultValue={evaluation?.ratings[i].score ?? ""}
                  >
                    <option value="">Unrated</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                  <input
                    name={`note${i}`}
                    aria-label={`Note: ${c}`}
                    defaultValue={evaluation?.ratings[i].note || ""}
                    placeholder="Evidence or observation…"
                  />
                </div>
              ))}
            </div>
            <div className="form-footer">
              <small>
                {evaluation
                  ? `Last updated by ${evaluation.updatedBy} · ${dateLabel(evaluation.updatedAt)}`
                  : "No evaluation yet"}
              </small>
              <button className="primary" disabled={saving}>
                <Check size={16} />
                Save shared evaluation
              </button>
            </div>
          </form>
          {!!view.evaluationHistory?.some((e) => e.userId === user.id) && (
            <details className="history">
              <summary>Previous evaluation versions</summary>
              {view.evaluationHistory
                .filter((e) => e.userId === user.id)
                .toReversed()
                .map((e) => (
                  <details key={e.revision}>
                    <summary>
                      Version {e.revision} · {e.updatedBy} ·{" "}
                      {dateLabel(e.updatedAt)}
                    </summary>
                    {e.ratings.map((r, i) => (
                      <div className="list-row" key={i}>
                        <div>
                          <strong>{criteria[i]}</strong>
                          {r.note && <p>{r.note}</p>}
                        </div>
                        <Badge>{r.score ?? "Unrated"}</Badge>
                      </div>
                    ))}
                  </details>
                ))}
            </details>
          )}
        </section>
      )}
      {modal && (
        <Modal
          title={
            {
              edit: "Edit your profile",
              phase: "Update selection phase",
              goal: "Create a focus goal",
              application: "Apply for Team Sweden",
            }[modal] || ""
          }
          onClose={() => setModal("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (modal === "edit")
                void save({
                  type: "profile",
                  name: f.get("name"),
                  city: f.get("city"),
                  bio: f.get("bio"),
                  faction: f.get("faction"),
                });
              if (modal === "phase")
                void save({
                  type: "phase",
                  userId: user.id,
                  phaseId:
                    f.get("phase") === "rejected"
                      ? user.phaseId
                      : f.get("phase"),
                  rejected: f.get("phase") === "rejected",
                  reason: f.get("reason"),
                });
              if (modal === "goal")
                void save({
                  type: "goal",
                  userId: user.id,
                  title: f.get("title"),
                  description: f.get("description"),
                  due: f.get("due"),
                });
              if (modal === "application")
                void save({
                  type: "applyTeam",
                  application: f.get("application"),
                });
            }}
          >
            {modal === "edit" && (
              <>
                <Field label="Name">
                  <input required name="name" defaultValue={user.name} />
                </Field>
                <Field label="City">
                  <input name="city" defaultValue={user.city} />
                </Field>
                <Field label="Preferred army">
                  <select name="faction" defaultValue={user.faction}>
                    {catalogue.factions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="About you">
                  <textarea name="bio" defaultValue={user.bio} />
                </Field>
              </>
            )}
            {modal === "phase" && (
              <>
                <p>
                  {user.name} is currently in {phaseName(view, user)}.
                </p>
                <Field label="New phase">
                  <select
                    name="phase"
                    defaultValue={
                      user.rejected
                        ? "rejected"
                        : user.phaseId || view.phases[0].id
                    }
                  >
                    {view.phases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="rejected">Not selected</option>
                  </select>
                </Field>
                <Field label="Internal decision reason">
                  <textarea
                    name="reason"
                    required
                    placeholder="Explain this decision for the admin team."
                  />
                </Field>
                <p className="hint">
                  The player sees their phase. This reason remains admin-only.
                </p>
              </>
            )}
            {modal === "goal" && (
              <>
                <Field label="Goal title">
                  <input name="title" required />
                </Field>
                <Field label="Success criteria">
                  <textarea
                    name="description"
                    required
                    placeholder="What should the player demonstrate?"
                  />
                </Field>
                <Field label="Due date (optional)">
                  <input type="date" name="due" />
                </Field>
              </>
            )}
            {modal === "application" && (
              <>
                <p>
                  Tell the team about your experience, preferred armies,
                  availability, and why you want to represent Sweden.
                </p>
                <Field label="Your application">
                  <textarea
                    name="application"
                    required
                    rows={7}
                    defaultValue={user.application}
                  />
                </Field>
              </>
            )}
            <div className="form-footer">
              <button type="button" onClick={() => setModal("")}>
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                Save
                <Check size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
