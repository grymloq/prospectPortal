"use client";

import { useRef, useState } from "react";
import type { Estimate } from "@/lib/matchups";
import styles from "./matrix-layout-score.module.css";

export default function MatrixLayoutScore({
  label,
  value,
  logged,
  manual,
  onSave,
  onError,
}: {
  label: string;
  value?: Estimate;
  logged?: Estimate;
  manual: boolean;
  onSave?: (
    score: number | null,
    expectedScore: number | null,
  ) => Promise<void>;
  onError: (message: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const cancelled = useRef(false);
  const restoringFocus = useRef(false);
  // Capture the edited value for conflict checks; queued saves advance their revisions.
  const [edit, setEdit] = useState<{
    text: string;
    initial: string;
    expectedScore: number | null;
    save: NonNullable<typeof onSave>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [pending, setPending] = useState<{ score: number | null } | null>(null);
  const score = pending ? pending.score : value?.count ? value.average : null;
  const difference =
    manual && score !== null && logged?.count
      ? Math.round((score - logged.average) * 10) / 10
      : null;
  const delta =
    difference !== null && difference !== 0
      ? `(${difference > 0 ? "+" : ""}${difference})`
      : "";
  const tone =
    score === null
      ? "matrix-unknown"
      : score > 10
        ? "matrix-win"
        : score < 10
          ? "matrix-loss"
          : "matrix-draw";
  function startEditing() {
    if (!onSave || busy || saving.current) return;
    cancelled.current = false;
    onError("");
    const initial = score === null ? "" : String(score);
    setEdit({ text: initial, initial, expectedScore: score, save: onSave });
  }
  async function save() {
    if (!edit || saving.current || cancelled.current) return;
    const raw = edit.text.trim();
    const next = raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 20)) {
      setInvalid(true);
      onError(
        "Enter a score between 0 and 20, or leave it blank to clear the estimate.",
      );
      return;
    }
    if (raw === edit.initial) {
      setEdit(null);
      return;
    }
    saving.current = true;
    setBusy(true);
    onError("");
    setPending({ score: next });
    setEdit(null);
    try {
      await edit.save(next, edit.expectedScore);
    } catch (error) {
      setEdit(edit);
      setInvalid(true);
      onError((error as Error).message);
    } finally {
      setPending(null);
      saving.current = false;
      setBusy(false);
    }
  }
  return edit ? (
    <input
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      className={styles.input}
      aria-label={label}
      aria-invalid={invalid}
      type="text"
      inputMode="decimal"
      value={edit.text}
      disabled={busy}
      onChange={(event) => {
        setInvalid(false);
        setEdit({ ...edit, text: event.target.value });
      }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void save();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelled.current = true;
          onError("");
          setEdit(null);
          queueMicrotask(() => {
            restoringFocus.current = true;
            button.current?.focus();
            restoringFocus.current = false;
          });
        }
      }}
    />
  ) : (
    <button
      ref={button}
      type="button"
      aria-disabled={!onSave || busy}
      aria-busy={busy}
      className={`${styles.score} ${tone}`}
      aria-label={`${label}: ${score === null ? "unknown" : score}${manual ? ", manual estimate" : ""}${delta ? `, ${delta} compared with logs` : ""}`}
      title={`${label}${logged?.count ? ` · Logged average ${logged.average.toFixed(1)} from ${logged.count} games` : " · No logged games"}${onSave ? " · Click to edit" : ""}`}
      onFocus={(event) => {
        if (
          !restoringFocus.current &&
          event.currentTarget.matches(":focus-visible")
        )
          startEditing();
      }}
      onClick={onSave && !busy ? startEditing : undefined}
    >
      {score === null ? "—" : score.toFixed(1)}
      {manual && !delta ? "*" : ""}
      {delta && <small className={styles.delta}>{delta}</small>}
    </button>
  );
}
