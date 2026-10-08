"use client";
import { createContext, useContext, useState } from "react";

export type DraftField = {
  key: string;
  value: string;
  checked: boolean;
};
export type ModalDraft = {
  fields: DraftField[];
  baseline: DraftField[];
  state: unknown;
  initialState: unknown;
};
const Drafts = createContext<Map<string, ModalDraft> | null>(null);

export function ModalDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Memory belongs to this signed-in workspace; logout/account changes destroy it.
  const [drafts] = useState(() => new Map<string, ModalDraft>());
  return <Drafts.Provider value={drafts}>{children}</Drafts.Provider>;
}
export function useModalDrafts() {
  return useContext(Drafts);
}

function controls(dialog: HTMLDialogElement) {
  const counts = new Map<string, number>();
  return Array.from(
    dialog.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea"),
  )
    .filter(
      (el) =>
        !(
          el instanceof HTMLInputElement &&
          ["password", "file", "hidden", "submit", "button"].includes(el.type)
        ) && !("readOnly" in el && el.readOnly),
    )
    .map((el) => {
      const label = el.closest("label");
      const identity =
        el.name ||
        el.getAttribute("aria-label") ||
        label?.querySelector("span")?.textContent ||
        label?.textContent ||
        "field";
      const count = counts.get(identity) || 0;
      counts.set(identity, count + 1);
      return { key: `${identity}:${count}`, el };
    });
}
export function captureDraftFields(dialog: HTMLDialogElement): DraftField[] {
  return controls(dialog).map(({ key, el }) => ({
    key,
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : false,
  }));
}
export function restoreDraftFields(
  dialog: HTMLDialogElement,
  fields: DraftField[],
) {
  const saved = new Map(fields.map((field) => [field.key, field]));
  for (const { key, el } of controls(dialog)) {
    const field = saved.get(key);
    if (!field) continue;
    // Controlled React state is restored separately by the form's draft adapter.
    el.value = field.value;
    if (el instanceof HTMLInputElement) el.checked = field.checked;
  }
}
