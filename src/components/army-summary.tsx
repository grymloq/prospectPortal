import type { LibraryArmySummary } from "@/lib/types";

/** Shared list summary for libraries, saved armies and submitted snapshots. */
export function ArmySummary({
  summary,
  rosterOnly = false,
}: {
  summary?: LibraryArmySummary;
  rosterOnly?: boolean;
}) {
  if (!summary) return null;
  return (
    <section className="army-summary" aria-label="Army list summary">
      {!rosterOnly && (
        <p>
          <strong>Archetype</strong>
          <br />
          {summary.archetypeName}
        </p>
      )}
      {summary.units.length ? (
        <>
          <p>
            <strong>Units</strong>
          </p>
          <ul>
            {summary.units.map((unit) => (
              <li key={unit.sourceId}>
                {unit.quantityKnown === false
                  ? "Unknown quantity"
                  : unit.quantity}{" "}
                × {unit.name}
                {unit.modelSizes?.length
                  ? ` (${unit.modelSizes.map((size) => `${size.quantity} × ${size.models} models`).join(", ")})`
                  : ""}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No unit data supplied.</p>
      )}
      {summary.rosterStatus === "partial" && (
        <p className="muted">
          Summary from the supplied roster; some unit details are unverified.
        </p>
      )}
    </section>
  );
}
