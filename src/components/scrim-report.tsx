"use client";
import { DetachmentNames } from "./detachment-name";
import { FactionName } from "./faction-avatar";
import { useState } from "react";
import type { Scrim, View, RecordedGameContext } from "@/lib/types";
import RecordedContextFields from "./game-context-fields";
import { stockholmLocal } from "@/lib/stockholm";
import { Field, Modal } from "./ui";
import { Disposition } from "./disposition";
import { ArmyListLink } from "./army-list-drawer";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";
import { useScrimClock } from "./use-scrim-clock";

export default function ScrimReport({
  view,
  scrim,
  pairingId,
  mutate,
  onClose,
}: {
  view: View;
  scrim: Scrim;
  pairingId: string;
  mutate: Mutate;
  onClose: () => void;
}) {
  const pair = scrim.pairings.find((p) => p.id === pairingId)!;
  const a = scrim.teams[0].entries.find((e) => e.id === pair.aId)!;
  const b = scrim.teams[1].entries.find((e) => e.id === pair.bId)!;
  const event = view.events.find((e) => e.id === scrim.eventId)!;
  const perspective = b.userId === view.me.id ? "b" : "a";
  const [revision] = useState(scrim.revision);
  const now = useScrimClock();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = view.games.find(
    (g) => g.scrimPairingId === pair.id && g.userId === view.me.id,
  );
  const playing = a.userId === view.me.id || b.userId === view.me.id;
  const [result, setResult] = useState(
    pair.scoreA === undefined
      ? ""
      : String(perspective === "a" ? pair.scoreA : 20 - pair.scoreA),
  );
  const [date, setDate] = useState(
    pair.date || stockholmLocal(new Date().toISOString()).slice(0, 10),
  );
  const [notes, setNotes] = useState(mine?.notes || "");
  const [gameContext, setGameContext] = useState<RecordedGameContext>(() =>
    pair.gameContext
      ? perspective === "a"
        ? pair.gameContext
        : {
            ...pair.gameContext,
            ownMission: pair.gameContext.enemyMission,
            enemyMission: pair.gameContext.ownMission,
          }
      : { version: "1" },
  );
  return (
    <Modal
      wide
      title={
        pair.scoreA === undefined
          ? "Report scrim game"
          : "Scrim result and reflection"
      }
      onClose={onClose}
      draftKey={`scrim:${scrim.id}:result:${pair.id}`}
      busy={busy}
      draft={{
        value: { result, date, notes, gameContext },
        restore: (saved) => {
          setResult(saved.result);
          setDate(saved.date);
          setNotes(saved.notes);
          setGameContext(saved.gameContext);
        },
      }}
    >
      <p>
        <strong>{event.title}</strong> · Layout {pair.layout} ·{" "}
        {view.patches.find((p) => p.id === scrim.patchId)?.name}
      </p>
      <div className={styles.lists}>
        {[a, b].map((entry) => (
          <section key={entry.id}>
            <strong>{entry.name}</strong>
            <p>
              {entry.army?.listName} ·{" "}
              {entry.army && <FactionName name={entry.army.factionName} />}
            </p>
            <p>
              <DetachmentNames names={entry.army?.detachmentNames || []} />
            </p>
            <Disposition name={entry.army?.dispositionName || ""} />
            {entry.army && (entry.army.listUrl || entry.army.listText) && (
              <p>
                <ArmyListLink
                  url={entry.army.listUrl}
                  text={entry.army.listText}
                >
                  View army list
                </ArmyListLink>
              </p>
            )}
          </section>
        ))}
      </div>
      <p className={styles.muted}>
        Opponent, armies, rules and layout come from the published pairing.
        Reporting updates both players’ journals.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await mutate(
            {
              type: "scrimReport",
              scrimId: scrim.id,
              revision,
              pairingId,
              perspective,
              score: Number(result),
              date,
              gameContext,
              ...(playing ? { notes } : {}),
            },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <div className="form-grid">
          <Field label="Game date">
            <input
              type="date"
              required
              value={date}
              min={stockholmLocal(event.startsAt).slice(0, 10)}
              max={stockholmLocal(event.endsAt).slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field
            label={`${perspective === "a" ? a.name : b.name}'s score (0–20)`}
          >
            <input
              type="number"
              min={0}
              max={20}
              step={1}
              required
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </Field>
        </div>
        {result !== "" && (
          <p>
            {perspective === "a" ? b.name : a.name}: {20 - Number(result)}{" "}
            points
          </p>
        )}
        {playing && (
          <Field label="Private journal reflection">
            <textarea
              rows={4}
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <small>
              Visible only to you and admins. Each player writes their own
              reflection.
            </small>
          </Field>
        )}
        <RecordedContextFields value={gameContext} onChange={setGameContext} />
        {error && <p role="alert">{error}</p>}
        <div className={styles.actions}>
          <button
            className="primary"
            disabled={
              busy || scrim.cancelled || now < Date.parse(event.startsAt)
            }
          >
            Save result{playing ? " and reflection" : ""}
          </button>
          {mine && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await mutate(
                  {
                    type: "scrimJournalNotes",
                    gameId: mine.id,
                    notes,
                  },
                  setError,
                );
                setBusy(false);
                if (ok) onClose();
              }}
            >
              Save reflection only
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
