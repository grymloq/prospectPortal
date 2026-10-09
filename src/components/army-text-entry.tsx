"use client";
import { useEffect, useState } from "react";
import type { NewRecruitTextReview } from "@/lib/types";
import { dispositionsFor, type Catalogue } from "@/lib/catalogue";
import { DispositionPicker } from "./disposition-picker";
import { Field } from "./ui";
import styles from "./army-text-entry.module.css";

export type TextArmyChoices = { detachments: string[]; disposition: string };

export function useArmyTextReview(
  enabled: boolean,
  listText: string,
  patchId: string,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    listText: string;
    patchId: string;
    attempt: number;
    review?: NewRecruitTextReview;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!enabled || !listText.trim() || !patchId) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/army-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listText, patchId }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted)
          setResult({ listText, patchId, attempt, review: data.review });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            listText,
            patchId,
            attempt,
            error: (error as Error).message,
          });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, listText, patchId, attempt]);
  const current =
    enabled &&
    result?.listText === listText &&
    result.patchId === patchId &&
    result.attempt === attempt
      ? result
      : null;
  return {
    review: current?.review || null,
    reading: enabled && !!listText.trim() && !!patchId && !current,
    error: current?.error || "",
    retry: () => setAttempt((n) => n + 1),
  };
}

export function ArmyTextEntry({
  listText,
  onTextChange,
  review,
  reading,
  choices,
  onChoicesChange,
  rules,
}: {
  listText: string;
  onTextChange: (text: string) => void;
  review: NewRecruitTextReview | null;
  reading: boolean;
  choices: TextArmyChoices;
  onChoicesChange: (choices: TextArmyChoices) => void;
  rules: Catalogue;
}) {
  const detachments =
    rules.factions.find((f) => f.id === review?.faction)?.detachments || [];
  const points = choices.detachments.reduce(
    (sum, id) => sum + (detachments.find((d) => d.id === id)?.points || 0),
    0,
  );
  return (
    <>
      <Field label="Army-list text">
        <textarea
          required
          rows={14}
          maxLength={100000}
          className={styles.text}
          placeholder="Paste your New Recruit list export here…"
          value={listText}
          onChange={(e) => onTextChange(e.target.value)}
        />
      </Field>
      <p className={styles.hint}>
        Paste a GW, Simple, NR, Short or Tournament export. If it omits
        detachments or force disposition, their inputs appear automatically
        below. Your text and line breaks are kept as entered.
      </p>
      {reading && (
        <p className={styles.hint} role="status">
          Reading list…
        </p>
      )}
      {review && (
        <p>
          {review.format} format · {review.unitCount} units ·{" "}
          {review.factionName}
        </p>
      )}
      {review?.missing.includes("detachments") && (
        <fieldset className={styles.choices}>
          <legend>Detachments missing from this export</legend>
          {detachments.map((detachment) => (
            <label key={detachment.id}>
              <input
                type="checkbox"
                disabled={
                  !choices.detachments.includes(detachment.id) &&
                  (choices.detachments.length >= 3 ||
                    points + detachment.points > 3)
                }
                checked={choices.detachments.includes(detachment.id)}
                onChange={(e) =>
                  onChoicesChange({
                    detachments: e.target.checked
                      ? [...choices.detachments, detachment.id]
                      : choices.detachments.filter(
                          (id) => id !== detachment.id,
                        ),
                    disposition: "",
                  })
                }
              />
              {detachment.name} ({detachment.points} DP)
            </label>
          ))}
        </fieldset>
      )}
      {review?.missing.includes("disposition") && (
        <DispositionPicker
          legend="Force disposition missing from this export"
          available={dispositionsFor(
            review.faction,
            review.detachments || choices.detachments,
            rules,
          )}
          value={choices.disposition}
          onChange={(disposition) =>
            onChoicesChange({ ...choices, disposition })
          }
        />
      )}
    </>
  );
}
