"use client";
import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  captureDraftFields,
  restoreDraftFields,
  useModalDrafts,
  type ModalDraft,
} from "./modal-drafts";
export function Modal<T>({
  title,
  children,
  onClose,
  wide = false,
  draftKey = title,
  draft,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  draftKey?: string;
  draft?: { value: T; restore: (value: T) => void };
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const drafts = useModalDrafts();
  const initial = useRef<ModalDraft | null>(null);
  const initialized = useRef(false);
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const confirmationId = useId();
  useLayoutEffect(() => {
    if (initialized.current || !dialog.current) return;
    initialized.current = true;
    const saved = drafts?.get(draftKey);
    initial.current = saved || {
      fields: [],
      baseline: captureDraftFields(dialog.current),
      state: undefined,
      initialState: draft?.value,
    };
    // Consume a resumed draft; a successful save must not resurrect it later.
    drafts?.delete(draftKey);
    if (saved && draft) draft.restore(saved.state as T);
    // Restore fields after the controlled state has rebuilt conditional sections.
    setReady(true);
  }, [drafts, draftKey, draft]);
  useLayoutEffect(() => {
    if (!ready || restored.current || !dialog.current) return;
    restored.current = true;
    if (initial.current?.fields.length)
      restoreDraftFields(dialog.current, initial.current.fields);
  }, [ready]);
  useEffect(() => {
    if (confirmClose) keepEditing.current?.focus();
    else previousFocus.current?.focus();
  }, [confirmClose]);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    return () => el?.close();
  }, []);
  function changed() {
    if (!dialog.current || !initial.current) return false;
    const fields = captureDraftFields(dialog.current);
    return (
      fields.length > 0 &&
      (JSON.stringify(fields) !== JSON.stringify(initial.current.baseline) ||
        JSON.stringify(draft?.value) !==
          JSON.stringify(initial.current.initialState))
    );
  }
  function closeWithDraft() {
    if (dialog.current && initial.current && changed()) {
      drafts?.set(draftKey, {
        fields: captureDraftFields(dialog.current),
        baseline: initial.current.baseline,
        state: draft?.value,
        initialState: initial.current.initialState,
      });
    } else drafts?.delete(draftKey);
    onClose();
  }
  function requestClose() {
    if (busy) return;
    if (changed()) {
      if (!confirmClose)
        previousFocus.current = document.activeElement as HTMLElement;
      setConfirmClose(true);
    } else closeWithDraft();
  }
  return (
    <dialog
      ref={dialog}
      aria-label={title}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirmClose) setConfirmClose(false);
        else requestClose();
      }}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-modal-close]")) {
          e.preventDefault();
          e.stopPropagation();
          requestClose();
        }
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const bounds = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < bounds.left ||
          e.clientX > bounds.right ||
          e.clientY < bounds.top ||
          e.clientY > bounds.bottom
        )
          requestClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={requestClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {confirmClose && (
        <section
          className="modal-close-confirmation"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={confirmationId}
        >
          <h3 id={confirmationId}>Close this form?</h3>
          <p>
            Your unsaved input will be kept as a draft for the next time you
            open this form.
          </p>
          <div className="form-footer">
            <button
              ref={keepEditing}
              type="button"
              className="primary"
              onClick={() => setConfirmClose(false)}
            >
              Keep editing
            </button>
            <button type="button" onClick={closeWithDraft}>
              Close and keep draft
            </button>
          </div>
        </section>
      )}
      <div inert={confirmClose}>{children}</div>
    </dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Progress({
  value,
  max = 100,
}: {
  value: number;
  max?: number;
}) {
  return (
    <div className="progress">
      <span
        style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }}
      />
    </div>
  );
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Stockholm",
  }).format(new Date(date));
}
export function timeLabel(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm",
  }).format(new Date(date));
}
