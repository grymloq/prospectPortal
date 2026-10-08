"use client";
import { useState } from "react";
import type { View } from "@/lib/types";
import { ArmyFields, blank, type Choice } from "./journal";
import { Modal } from "./ui";
import type { Mutate } from "./workspace";

export default function MatrixListEditor({
  view,
  patchId,
  draftId = "new",
  initialArmy,
  mutate,
  onClose,
}: {
  view: View;
  patchId: string;
  draftId?: string;
  initialArmy?: Choice;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState(initialArmy || blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Add or update shared army list"
      onClose={onClose}
      draftKey={`matrix:${patchId}:list:${draftId}`}
      busy={busy}
      draft={{ value: choice, restore: setChoice }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const ok = await mutate(
            { type: "matrixList", patchId, army: choice },
            setError,
          );
          setBusy(false);
          if (ok) onClose();
        }}
      >
        <p>
          Shared in Matchup Matrix for this patch. Saving adds no estimates. The
          same faction, detachments and disposition update the existing
          configuration’s name and link.
        </p>
        <ArmyFields
          rules={view.patches.find((p) => p.id === patchId)?.catalogue}
          title="Matrix army"
          value={choice}
          onChange={setChoice}
        />
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          Save army list
        </button>
      </form>
    </Modal>
  );
}
