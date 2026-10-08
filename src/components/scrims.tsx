"use client";
import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { View } from "@/lib/types";
import { onScrimTeam, scrimScore } from "@/lib/scrims";
import { stockholmIso, stockholmLocal } from "@/lib/stockholm";
import { patchLabel } from "@/lib/patches";
import { Badge, Empty, Field, Modal } from "./ui";
import ScrimRoster from "./scrim-roster";
import ScrimMatrix from "./scrim-matrix";
import ScrimPairings from "./scrim-pairings";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";

export default function Scrims({
  view,
  mutate,
  selectedId,
  onSelect,
}: {
  view: View;
  mutate: Mutate;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const scrims = view.scrims || [];
  const scrim = scrims.find((s) => s.id === selectedId);
  const event = view.events.find((e) => e.id === scrim?.eventId);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("Our Team");
  const [cancel, setCancel] = useState(false);
  const admin = view.me.role === "admin";
  const score = scrim ? scrimScore(scrim) : null;
  const ownTeam = scrim?.teams.find(
    (team) => !team.external && onScrimTeam(team, view.me.id),
  );
  const opposingTeams =
    scrim?.teams.filter((team) => !ownTeam || team.id !== ownTeam.id) || [];
  const canManageTeams =
    admin ||
    (scrim?.kind === "external" && scrim.teams[0].captainId === view.me.id);
  const opposingUnlocked = !!scrim?.listsRevealed;
  const sections = [
    "Our Team",
    "Opposing Team",
    "Matrix",
    "Pairings & results",
    ...(canManageTeams ? ["Manage teams"] : []),
  ];
  const activeSection =
    (section === "Manage teams" && !canManageTeams) ||
    (section === "Opposing Team" && !opposingUnlocked)
      ? "Our Team"
      : section;
  return (
    <div className={styles.stack}>
      <header className="page-heading">
        <div>
          {scrim && (
            <button className="text-button" onClick={() => onSelect("")}>
              <ArrowLeft size={15} /> All scrims
            </button>
          )}
          <h1>{event?.title || "Team scrims"}</h1>
          <p>
            {scrim
              ? `${scrim.kind === "internal" ? "Internal" : "External"} scrim · ${scrim.teamSize} vs ${scrim.teamSize} · one round`
              : "Build teams, prepare matchups, and play together."}
          </p>
        </div>
        {admin && !scrim && (
          <button className="primary" onClick={() => onSelect("new")}>
            <Plus size={17} /> Create scrim
          </button>
        )}
      </header>
      {scrim && event && score ? (
        <>
          <div className={styles.meta}>
            <span>
              <strong>Lists due:</strong>{" "}
              {stockholmLocal(scrim.submissionDeadline).replace("T", " ")}
            </span>
            <span>
              <strong>Pairing:</strong>{" "}
              {stockholmLocal(event.startsAt).replace("T", " ")}
            </span>
            <span>
              <strong>Games end:</strong>{" "}
              {stockholmLocal(event.endsAt).replace("T", " ")}
            </span>
            <span>Europe/Stockholm</span>
            <span>
              <strong>Rules:</strong>{" "}
              {view.patches.find((p) => p.id === scrim.patchId)?.name}
            </span>
            <span>{event.online ? "Online" : event.location}</span>
          </div>
          {event.online && event.onlineUrl && (
            <a href={event.onlineUrl} target="_blank" rel="noreferrer">
              Join online scrim
            </a>
          )}
          {event.description && <p className="preserve">{event.description}</p>}
          {scrim.cancelled && (
            <div className={styles.warning}>
              This scrim has been cancelled. Recorded history is retained.
            </div>
          )}
          <div className={styles.scoreboard}>
            <div>
              {scrim.teams[0].name}
              <br />
              <strong>{score.a}</strong>
            </div>
            <div>
              <strong>
                {scrim.cancelled
                  ? "Cancelled"
                  : score.complete
                    ? score.winner === "Draw"
                      ? "Draw"
                      : "Final"
                    : `${score.reported}/${scrim.teamSize}`}
              </strong>
              <small>
                {score.complete && score.winner !== "Draw"
                  ? `${score.winner} wins`
                  : score.complete
                    ? "Within the five-point draw band"
                    : "games reported"}
              </small>
            </div>
            <div>
              {scrim.teams[1].name}
              <br />
              <strong>{score.b}</strong>
            </div>
          </div>
          <p className={styles.muted}>
            A team wins with a lead of more than five points. The final result
            is determined when every game is reported.
          </p>
          <div
            className={styles.actions}
            role="group"
            aria-label="Scrim sections"
          >
            {sections.map((name) => (
              <button
                key={name}
                className={activeSection === name ? "primary" : ""}
                aria-pressed={activeSection === name}
                disabled={name === "Opposing Team" && !opposingUnlocked}
                onClick={() => setSection(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {!opposingUnlocked && (
            <p className={styles.muted}>
              Opposing Team unlocks after list lock, once both teams have
              finalized complete submissions.
            </p>
          )}
          {activeSection === "Our Team" &&
            (ownTeam ? (
              <ScrimRoster
                key={ownTeam.id}
                view={view}
                scrim={scrim}
                team={ownTeam}
                mutate={mutate}
              />
            ) : (
              <Empty
                title="No team assigned"
                description="A captain can add you to their team."
              />
            ))}
          {activeSection === "Opposing Team" && opposingUnlocked && (
            <div
              className={opposingTeams.length > 1 ? styles.teams : styles.stack}
            >
              {opposingTeams.map((team) => (
                <ScrimRoster
                  key={`${team.id}-opposing`}
                  view={view}
                  scrim={scrim}
                  team={team}
                  mutate={mutate}
                  readOnly
                />
              ))}
            </div>
          )}
          {activeSection === "Manage teams" && canManageTeams && (
            <div className={styles.teams}>
              {scrim.teams
                .filter((team) => admin || team.external)
                .map((team) => (
                  <ScrimRoster
                    key={team.id}
                    view={view}
                    scrim={scrim}
                    team={team}
                    mutate={mutate}
                  />
                ))}
            </div>
          )}
          {activeSection === "Matrix" && (
            <ScrimMatrix
              key={`${scrim.id}-matrix`}
              view={view}
              scrim={scrim}
              mutate={mutate}
            />
          )}
          {activeSection === "Pairings & results" && (
            <ScrimPairings
              key={`${scrim.id}-pairings`}
              view={view}
              scrim={scrim}
              mutate={mutate}
            />
          )}
          {admin && !scrim.cancelled && !scrim.completedAt && (
            <div>
              <button onClick={() => setCancel(true)}>Cancel scrim</button>
            </div>
          )}
          {cancel && (
            <Modal title="Cancel scrim" onClose={() => setCancel(false)}>
              <p>
                Cancel {event.title}? Its lists, pairings and recorded games
                will remain in the history.
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await mutate({
                    type: "scrimCancel",
                    scrimId: scrim.id,
                    revision: scrim.revision,
                  });
                  setBusy(false);
                  if (ok) setCancel(false);
                }}
              >
                Cancel this scrim
              </button>
            </Modal>
          )}
        </>
      ) : (
        <>
          {!scrims.length && (
            <Empty
              title="Plan your first scrim"
              description="An admin creates the calendar event and appoints captains. Players submit lists, teams prepare their matrices, then captains publish the pairings."
            />
          )}
          {[...scrims].reverse().map((s) => {
            const e = view.events.find((e) => e.id === s.eventId)!;
            const result = scrimScore(s);
            return (
              <section className={styles.card} key={s.id}>
                <div className={styles.heading}>
                  <div>
                    <h2>{e.title}</h2>
                    <p>
                      {s.teams[0].name} vs {s.teams[1].name} · {s.teamSize}{" "}
                      players per team
                    </p>
                    <p className={styles.muted}>
                      Lists:{" "}
                      {stockholmLocal(s.submissionDeadline).replace("T", " ")} ·
                      Pairing: {stockholmLocal(e.startsAt).replace("T", " ")} ·
                      Games end: {stockholmLocal(e.endsAt).slice(0, 10)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      s.cancelled ? "red" : result.complete ? "green" : "blue"
                    }
                  >
                    {s.cancelled
                      ? "Cancelled"
                      : result.complete
                        ? result.winner === "Draw"
                          ? "Draw"
                          : `${result.winner} wins`
                        : s.pairedAt
                          ? `${result.reported}/${s.teamSize} reported`
                          : "Preparing"}
                  </Badge>
                </div>
                <button onClick={() => onSelect(s.id)}>Open scrim</button>
              </section>
            );
          })}
        </>
      )}
      {selectedId === "new" && admin && (
        <CreateScrim view={view} mutate={mutate} onClose={() => onSelect("")} />
      )}
    </div>
  );
}

function CreateScrim({
  view,
  mutate,
  onClose,
}: {
  view: View;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [kind, setKind] = useState("internal");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const players = [
    { id: view.me.id, name: view.me.name },
    ...view.playerOptions,
  ];
  return (
    <Modal
      wide
      title="Create scrim"
      onClose={onClose}
      draftKey="scrim:new"
      busy={busy}
      draft={{
        value: { kind, online },
        restore: (saved) => {
          setKind(saved.kind);
          setOnline(saved.online);
        },
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const ok = await mutate(
              {
                type: "scrimCreate",
                title: f.get("title"),
                kind,
                teamSize: Number(f.get("teamSize")),
                patchId: f.get("patchId"),
                submissionDeadline: stockholmIso(
                  `${f.get("deadlineDate")}T${f.get("deadlineTime")}`,
                ),
                startsAt: stockholmIso(String(f.get("pairing"))),
                endsAt: stockholmIso(`${f.get("endDate")}T${f.get("endTime")}`),
                location: online ? "Online" : f.get("location"),
                online,
                onlineUrl: online ? f.get("onlineUrl") || "" : "",
                description: f.get("description"),
                teams: [
                  { name: f.get("team0"), captainId: f.get("captain0") },
                  {
                    name: f.get("team1"),
                    captainId: kind === "external" ? "" : f.get("captain1"),
                  },
                ],
              },
              setError,
            );
            if (ok) onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Scrim name">
          <input
            name="title"
            required
            maxLength={150}
            placeholder="October team practice"
          />
        </Field>
        <div className="form-grid">
          <Field label="Format">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="internal">Internal · two portal teams</option>
              <option value="external">External · one portal team</option>
            </select>
          </Field>
          <Field label="Players per team">
            <input
              name="teamSize"
              type="number"
              min={1}
              max={64}
              defaultValue={8}
              required
            />
            <small>
              Both teams use the same size. Non-playing captains do not take a
              slot.
            </small>
          </Field>
          <Field label="Rules patch for this scrim">
            <select name="patchId" defaultValue={view.defaultPatchId} required>
              {view.patches
                .filter((p) => !p.removedAt)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {patchLabel(p)}
                  </option>
                ))}
            </select>
          </Field>
          <EndOfDayDate name="deadline" label="List submission deadline" />
          <Field label="Pairing date">
            <input type="datetime-local" name="pairing" required />
          </Field>
          <EndOfDayDate name="end" label="Games end" />
        </div>
        <p className={styles.muted}>
          All dates and times use Europe/Stockholm. Rosters and lists lock at
          the submission deadline. Captains must finalize valid teams before
          then. Games can be played from the pairing date until the game-end
          deadline. Deadline and game-end times default to 23:59.
        </p>
        <div className="form-grid">
          {[0, 1].map((index) => (
            <div key={index}>
              <Field
                label={
                  kind === "external"
                    ? index === 0
                      ? "Our team name"
                      : "External team name"
                    : `Team ${index + 1} name`
                }
              >
                <input
                  name={`team${index}`}
                  defaultValue={
                    kind === "internal"
                      ? index === 0
                        ? "Team Blue"
                        : "Team Yellow"
                      : index === 0
                        ? "Team Sweden"
                        : ""
                  }
                  required
                  maxLength={150}
                />
              </Field>
              {(index === 0 || kind === "internal") && (
                <Field label={`Team ${index + 1} captain`}>
                  <select name={`captain${index}`} defaultValue="" required>
                    <option value="">Choose captain</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          ))}
        </div>
        <Field label="Location type">
          <select
            value={online ? "online" : "venue"}
            onChange={(e) => setOnline(e.target.value === "online")}
          >
            <option value="online">Online</option>
            <option value="venue">In person</option>
          </select>
        </Field>
        {online ? (
          <Field label="Online link (optional)">
            <input name="onlineUrl" type="url" />
          </Field>
        ) : (
          <Field label="Venue / location">
            <input name="location" required maxLength={300} />
          </Field>
        )}
        <Field label="Description">
          <textarea name="description" rows={3} maxLength={5000} />
        </Field>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          Create scrim in calendar
        </button>
      </form>
    </Modal>
  );
}

function EndOfDayDate({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <Field label={label}>
        <input type="date" name={`${name}Date`} required />
      </Field>
      <Field label={`${label} time`}>
        <input type="time" name={`${name}Time`} defaultValue="23:59" required />
      </Field>
    </div>
  );
}
