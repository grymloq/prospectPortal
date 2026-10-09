import type { LibraryNormComparison } from "@/lib/types";
import { ArmyUnitChange } from "./army-unit-change";
import { ArmyLoadoutChanges } from "./army-loadout-changes";

/** Render comparisons without creating a nested table in the library hierarchy. */
export function ArmyLibraryUnitComparison({
  norm,
}: {
  norm?: LibraryNormComparison;
}) {
  if (!norm) return null;
  const standard = norm.standard;
  return (
    <section aria-label="Units compared with archetype standard">
      <h4>Units compared with the standard</h4>
      {standard ? (
        <p>
          <strong>{standard.name}</strong> ·{" "}
          {standard.selection === "marked"
            ? "Marked default"
            : "Most repeated variant"}{" "}
          · {standard.repetitions}{" "}
          {standard.repetitions === 1 ? "list" : "lists"}
        </p>
      ) : (
        <p>
          No complete public roster is available as the standard for this
          archetype and ruleset.
        </p>
      )}
      {norm.status === "partial" || norm.status === "unavailable" ? (
        <p>
          Unit data is incomplete. Definite deviations cannot be calculated for
          this version.
        </p>
      ) : (
        standard && (
          <>
            {norm.deviations.length ? (
              <ul>
                {norm.deviations.map((unit) => (
                  <li key={unit.sourceId}>
                    <ArmyUnitChange unit={unit} /> · {unit.baselineQuantity} →{" "}
                    {unit.listQuantity} units
                    {unit.delta !== 0 &&
                      unit.baselineModels !== unit.listModels &&
                      (unit.baselineModels !== undefined ||
                        unit.listModels !== undefined) &&
                      ` · ${unit.baselineModels ?? "unknown"} → ${unit.listModels ?? "unknown"} models`}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Same unit counts and known squad sizes as the standard.</p>
            )}
            <ArmyLoadoutChanges changes={norm.loadoutDeviations} />
            {norm.compositionMatches === false && (
              <p>
                The full roster composition differs from the standard. Expand
                the roster below to inspect selected models, equipment and
                enhancements.
              </p>
            )}
          </>
        )
      )}
    </section>
  );
}
