"use client";

import { useState } from "react";
import type { Scrim, View } from "@/lib/types";
import { Modal } from "./ui";
import type { Mutate } from "./workspace";
import styles from "./scrims.module.css";

export function OrganizerChoices({
  view,
  assigned = [],
  selected,
  onChange,
}: {
  view: View;
  assigned?: NonNullable<Scrim["organizers"]>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const people = [
    { id: view.me.id, name: view.me.name },
    ...view.playerOptions,
  ].sort((a, b) => a.name.localeCompare(b.name));
  const unavailable = assigned.filter(
    (p) => !people.some((u) => u.id === p.userId),
  );
  return (
    <>
      <fieldset className={styles.staffChoices}>
        <legend>Scrim organizers (optional)</legend>
        {[
          ...people,
          ...unavailable.map((p) => ({
            id: p.userId,
            name: `${p.name} · unavailable — remove assignment`,
          })),
        ].map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              disabled={
                !selected.includes(p.id) &&
                (selected.length >= 20 ||
                  unavailable.some((u) => u.userId === p.id))
              }
              onChange={() =>
                onChange(
                  selected.includes(p.id)
                    ? selected.filter((id) => id !== p.id)
                    : [...selected, p.id],
                )
              }
            />
            <span>{p.name}</span>
          </label>
        ))}
      </fieldset>
      <p className={styles.muted}>
        Organizers have admin management access for this scrim. Private team
        plans follow the same access rules as for admins.
      </p>
    </>
  );
}

export default function ScrimOrganizers({
  view,
  scrim,
  mutate,
  onClose,
}: {
  view: View;
  scrim: Scrim;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(
    scrim.organizers?.map((p) => p.userId) || [],
  );
  const [revision] = useState(scrim.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Scrim organizers" onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (
              await mutate(
                {
                  type: "scrimOrganizers",
                  scrimId: scrim.id,
                  revision,
                  organizerIds: selected,
                },
                setError,
              )
            )
              onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <OrganizerChoices
          view={view}
          assigned={scrim.organizers}
          selected={selected}
          onChange={setSelected}
        />
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          Save organizers
        </button>
      </form>
    </Modal>
  );
}
