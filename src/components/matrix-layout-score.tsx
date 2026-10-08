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
  onSave?: (score: number | null) => Promise<void>;
  onError: (message: string) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const cancelled = useRef(false);
  // Capture the save callback when editing starts, including its server revision.
  const [edit, setEdit] = useState<{
    text: string;
    initial: string;
    save: NonNullable<typeof onSave>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const score = value?.count ? value.average : null;
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
    try {
      await edit.save(next);
      setEdit(null);
    } catch (error) {
      setInvalid(true);
      onError((error as Error).message);
    } finally {
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
          queueMicrotask(() => button.current?.focus());
        }
      }}
    />
  ) : (
    <button
      ref={button}
      type="button"
      aria-disabled={!onSave}
      className={`${styles.score} ${tone}`}
      aria-label={`${label}: ${score === null ? "unknown" : score}${manual ? ", manual estimate" : ""}${delta ? `, ${delta} compared with logs` : ""}`}
      title={`${label}${logged?.count ? ` · Logged average ${logged.average.toFixed(1)} from ${logged.count} games` : " · No logged games"}${onSave ? " · Click to edit" : ""}`}
      onClick={
        onSave
          ? () => {
              cancelled.current = false;
              onError("");
              const initial = score === null ? "" : String(score);
              setEdit({ text: initial, initial, save: onSave });
            }
          : undefined
      }
    >
      {score === null ? "—" : score.toFixed(1)}
      {manual && !delta ? "*" : ""}
      {delta && <small className={styles.delta}>{delta}</small>}
    </button>
  );
}
