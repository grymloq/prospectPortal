"use client";
import { useState } from "react";
import type { Layout, Scrim, ScrimPairing, View } from "@/lib/types";
import { layouts } from "@/lib/matchups";
import { Field, Modal } from "./ui";
import ScrimReport from "./scrim-report";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";
import { useScrimClock } from "./use-scrim-clock";

export default function ScrimPairings({
  view,
  scrim,
  mutate,
}: {
  view: View;
  scrim: Scrim;
  mutate: Mutate;
}) {
  const manage =
    view.me.role === "admin" ||
    scrim.teams.some((t) => t.captainId === view.me.id);
  const event = view.events.find((e) => e.id === scrim.eventId)!;
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState("");
  const now = useScrimClock();
  const ready =
    scrim.teams.every((t) => t.finalizedAt) &&
    now >= Date.parse(scrim.submissionDeadline);
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2>Pairings & results</h2>
          <p className={styles.muted}>
            One round · one game per player · layouts A, B or C
          </p>
        </div>
        {manage && ready && !scrim.pairedAt && !scrim.cancelled && (
          <button className="primary" onClick={() => setEditing(true)}>
            Enter pairings
          </button>
        )}
      </div>
      {!scrim.pairedAt && (
        <p>
          {ready
            ? "Captains or an admin can enter and publish the pairings."
            : "Pairings open after final submissions and the list deadline."}
        </p>
      )}
      {scrim.pairings.map((pair) => {
        const a = scrim.teams[0].entries.find((e) => e.id === pair.aId)!;
        const b = scrim.teams[1].entries.find((e) => e.id === pair.bId)!;
        const canReport =
          manage || a.userId === view.me.id || b.userId === view.me.id;
        return (
          <div className={styles.player} key={pair.id}>
            <div className={styles.heading}>
              <div>
                <strong>
                  {a.name} vs {b.name}
                </strong>
                <p>
                  {a.army?.factionName} vs {b.army?.factionName} · Layout{" "}
                  {pair.layout}
                </p>
                <p>
                  {pair.scoreA === undefined
                    ? "Awaiting result"
                    : `${pair.scoreA}–${20 - pair.scoreA}${pair.date ? ` · ${pair.date}` : ""}`}
                </p>
              </div>
              {canReport && (
                <button
                  disabled={scrim.cancelled || now < Date.parse(event.startsAt)}
                  onClick={() => setReport(pair.id)}
                >
                  {pair.scoreA === undefined
                    ? "Report result"
                    : "Edit result / reflection"}
                </button>
              )}
            </div>
            {pair.updatedBy && <small>Reported by {pair.updatedBy}</small>}
            <details>
              <summary>Match comments ({pair.comments.length})</summary>
              <p className={styles.muted}>
                Visible to all confirmed members. Keep personal reflections in
                your journal.
              </p>
              {pair.comments.map((c) => (
                <div className={styles.comment} key={c.id}>
                  <strong>{c.authorName}</strong>
                  <p>{c.text}</p>
                  <small>
                    {new Date(c.createdAt).toLocaleString("en-GB", {
                      timeZone: "Europe/Stockholm",
                    })}
                  </small>
                </div>
              ))}
              {canReport && !scrim.cancelled && (
                <MatchComment
                  key={scrim.revision}
                  scrim={scrim}
                  pair={pair}
                  mutate={mutate}
                />
              )}
            </details>
          </div>
        );
      })}
      {editing && (
        <PairingEditor
          scrim={scrim}
          mutate={mutate}
          onClose={() => setEditing(false)}
        />
      )}
      {report && (
        <ScrimReport
          key={report}
          view={view}
          scrim={scrim}
          pairingId={report}
          mutate={mutate}
          onClose={() => setReport("")}
        />
      )}
    </section>
  );
}
function MatchComment({
  scrim,
  pair,
  mutate,
}: {
  scrim: Scrim;
  pair: ScrimPairing;
  mutate: Mutate;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await mutate({
          type: "scrimMatchComment",
          scrimId: scrim.id,
          revision: scrim.revision,
          pairingId: pair.id,
          text,
        });
        setBusy(false);
        if (ok) setText("");
      }}
    >
      <Field label="Add a match comment">
        <textarea
          rows={2}
          required
          maxLength={3000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <button disabled={busy}>Add match comment</button>
    </form>
  );
}
function PairingEditor({
  scrim,
  mutate,
  onClose,
}: {
  scrim: Scrim;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [revision] = useState(scrim.revision);
  const [error, setError] = useState("");
  const [pairs, setPairs] = useState(
    scrim.teams[0].entries.map((e) => ({ aId: e.id, bId: "", layout: "" })),
  );
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      wide
      title="Enter scrim pairings"
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:pairings`}
      busy={busy}
      draft={{ value: pairs, restore: setPairs }}
    >
      <p>
        Assign each opponent once and choose a layout for every game. Publishing
        locks all pairings.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await mutate(
            {
              type: "scrimPairings",
              scrimId: scrim.id,
              revision,
              pairings: pairs,
            },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        {pairs.map((pair, i) => (
          <div className={styles.pairing} key={pair.aId}>
            <strong>{scrim.teams[0].entries[i].name}</strong>
            <Field label={`Opponent for ${scrim.teams[0].entries[i].name}`}>
              <select
                required
                value={pair.bId}
                onChange={(e) =>
                  setPairs(
                    pairs.map((p, j) =>
                      i === j ? { ...p, bId: e.target.value } : p,
                    ),
                  )
                }
              >
                <option value="">Choose opponent</option>
                {scrim.teams[1].entries.map((entry) => (
                  <option
                    key={entry.id}
                    value={entry.id}
                    disabled={pairs.some(
                      (p, j) => j !== i && p.bId === entry.id,
                    )}
                  >
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Layout for ${scrim.teams[0].entries[i].name}`}>
              <select
                required
                value={pair.layout}
                onChange={(e) =>
                  setPairs(
                    pairs.map((p, j) =>
                      i === j ? { ...p, layout: e.target.value as Layout } : p,
                    ),
                  )
                }
              >
                <option value="">Choose</option>
                {layouts.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ))}
        <p className={styles.muted}>
          There is no limit on how many games use each layout.
        </p>
        <button className="primary" disabled={busy}>
          Publish and lock pairings
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
