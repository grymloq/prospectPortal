"use client";
import type { RecordedGameContext, GameContextReference } from "@/lib/types";
import { Field } from "./ui";
/** Explicit recorded selections, never inferred from army disposition. */
export default function RecordedContextFields({
  value,
  onChange,
}: {
  value: RecordedGameContext;
  onChange: (context: RecordedGameContext) => void;
}) {
  const keys = [
    ["missionPack", "Mission pack"],
    ["deployment", "Deployment"],
    ["ownMission", "Your mission"],
    ["enemyMission", "Opponent mission"],
  ] as const;
  function update(
    key: (typeof keys)[number][0],
    patch: Partial<GameContextReference>,
  ) {
    const previous = value[key];
    const name = patch.name ?? previous?.name ?? "";
    if (!name.trim()) {
      if (key === "missionPack") onChange({ version: "1" });
      else onChange({ ...value, [key]: undefined });
      return;
    }
    const id =
      patch.name !== undefined
        ? `manual:${name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 120)}`
        : previous?.id || `manual:${key}`;
    onChange({
      ...value,
      [key]: {
        id,
        name,
        version: previous?.version || "1",
        source: "manual",
        ...previous,
        ...patch,
        ...(patch.name !== undefined ? { id, source: "manual" } : {}),
      },
    });
  }
  return (
    <details className="army-summary">
      <summary>Recorded missions and deployment (optional)</summary>
      <p>
        Leave unknown selections blank. Enter the mission pack and its source
        version before recording deployment or side missions.
      </p>
      <div className="form-grid">
        {keys.map(([key, label]) => (
          <div key={key}>
            <Field label={label}>
              <input
                maxLength={120}
                placeholder="Unknown / not recorded"
                disabled={key !== "missionPack" && !value.missionPack}
                value={value[key]?.name || ""}
                onChange={(e) => update(key, { name: e.target.value })}
              />
            </Field>
            {value[key] && (
              <Field label={`${label} source version`}>
                <input
                  required
                  maxLength={80}
                  value={value[key]?.version || ""}
                  onChange={(e) => update(key, { version: e.target.value })}
                />
              </Field>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
