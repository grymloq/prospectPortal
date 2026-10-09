"use client";

import { useState } from "react";
import type { Scrim, ScrimTeam, View } from "@/lib/types";
import { onScrimTeam } from "@/lib/scrims";
import { Field, Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";

export default function ScrimStaff({
  view,
  scrim,
  team,
  mutate,
  onClose,
}: {
  view: View;
  scrim: Scrim;
  team: ScrimTeam;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [captain, setCaptain] = useState(team.captainId);
  const [captains, setCaptains] = useState(
    team.additionalCaptains?.map((p) => p.userId) || [],
  );
  const [coaches, setCoaches] = useState(
    team.coaches?.map((p) => p.userId) || [],
  );
  const [busy, setBusy] = useState(false);
  const [revision] = useState(scrim.revision);
  const other = scrim.teams.find((t) => t.id !== team.id)!;
  const people = [{ id: view.me.id, name: view.me.name }, ...view.playerOptions]
    .filter((p) => !onScrimTeam(other, p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  return (
    <Modal
      title={`Captains and coaches · ${team.name}`}
      onClose={onClose}
      busy={busy}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            if (
              await mutate({
                type: "scrimStaff",
                scrimId: scrim.id,
                revision,
                teamId: team.id,
                captainId: captain,
                additionalCaptainIds: captains,
                coachIds: coaches,
              })
            )
              onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Lead captain">
          <select
            required
            value={captain}
            onChange={(event) => {
              setCaptain(event.target.value);
              setCaptains(captains.filter((id) => id !== event.target.value));
              setCoaches(coaches.filter((id) => id !== event.target.value));
            }}
          >
            {!people.some((p) => p.id === captain) && (
              <option value={captain} disabled>
                {team.captainName} · unavailable — choose a replacement
              </option>
            )}
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className={styles.staffChoices}>
          <legend>Additional captains</legend>
          {team.additionalCaptains
            ?.filter((p) => !people.some((user) => user.id === p.userId))
            .map((p) => (
              <label key={p.userId}>
                <input
                  type="checkbox"
                  checked={captains.includes(p.userId)}
                  onChange={() => setCaptains(toggle(captains, p.userId))}
                />
                <span>{p.name} · unavailable — remove assignment</span>
              </label>
            ))}
          {people
            .filter((p) => p.id !== captain)
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={captains.includes(p.id)}
                  disabled={coaches.includes(p.id)}
                  onChange={() => setCaptains(toggle(captains, p.id))}
                />
                <span>{p.name}</span>
              </label>
            ))}
        </fieldset>
        <fieldset className={styles.staffChoices}>
          <legend>Non-playing coaches</legend>
          {team.coaches
            ?.filter((p) => !people.some((user) => user.id === p.userId))
            .map((p) => (
              <label key={p.userId}>
                <input
                  type="checkbox"
                  checked={coaches.includes(p.userId)}
                  onChange={() => setCoaches(toggle(coaches, p.userId))}
                />
                <span>{p.name} · unavailable — remove assignment</span>
              </label>
            ))}
          {people
            .filter(
              (p) =>
                p.id !== captain &&
                !team.entries.some((entry) => entry.userId === p.id),
            )
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={coaches.includes(p.id)}
                  disabled={captains.includes(p.id)}
                  onChange={() => setCoaches(toggle(coaches, p.id))}
                />
                <span>{p.name}</span>
              </label>
            ))}
        </fieldset>
        <p>
          Captains manage the team. Coaches can contribute to its private
          matchup plan and do not occupy player slots. Changing staff does not
          change the player roster.
        </p>
        <button
          className="primary"
          disabled={busy || !people.some((p) => p.id === captain)}
        >
          Save captains and coaches
        </button>
      </form>
    </Modal>
  );
}
