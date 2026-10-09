import type { RosterComposition, RosterSelection } from "@/lib/types";
import { consolidateRoster } from "@/lib/roster-display";
import { visibleEquipment } from "@/lib/roster-equipment";
import styles from "./army-roster.module.css";

function Loadout({ selections }: { selections: RosterSelection[] }) {
  return (
    <ul className={styles.loadout}>
      {selections.map((selection, index) => (
        <li key={`${selection.sourceId}:${index}`}>
          {selection.quantityKnown === false
            ? "Unknown quantity"
            : selection.quantity}{" "}
          × {selection.name}
          {selection.selections.length > 0 && (
            <Loadout selections={selection.selections} />
          )}
        </li>
      ))}
    </ul>
  );
}

function SelectedEquipment({
  selection,
  composition,
}: {
  selection: RosterSelection;
  composition: RosterComposition;
}) {
  const equipment = visibleEquipment(
    selection.selections,
    selection,
    composition,
  );
  return equipment.length ? (
    <Loadout selections={equipment} />
  ) : (
    <p className={styles.note}>
      {selection.selections.length
        ? "No optional or additional equipment recorded."
        : "No specific loadout was supplied."}
    </p>
  );
}

/** Consolidated units stay readable; selected loadouts are available on demand. */
export function ArmyRoster({
  composition,
}: {
  composition: RosterComposition;
}) {
  const { units, other } = consolidateRoster(composition);
  const otherEquipment = visibleEquipment(other, undefined, composition);
  return (
    <div className={styles.roster}>
      {!composition.attachmentsVersion && (
        <p className={styles.note}>
          Leader assignments were not recorded for this version.
        </p>
      )}
      <ul className={styles.units} aria-label="Consolidated army units">
        {units.map((unit) => (
          <li key={unit.key}>
            <details className={styles.unit}>
              <summary
                aria-label={`Unit loadout: ${unit.quantityKnown ? unit.quantity : "Unknown quantity"} × ${unit.name}${unit.leaders.map((leader) => `; ${leader.role === "Leading" ? "attached leader" : "supporting"}: ${leader.quantity} × ${leader.selection.name}`).join("")}`}
              >
                <span>
                  <strong>
                    {unit.quantityKnown ? unit.quantity : "Unknown quantity"} ×{" "}
                    {unit.name}
                  </strong>
                  {unit.leaders.map((leader, index) => (
                    <span
                      className={styles.leader}
                      key={`${leader.selection.sourceId}:${index}`}
                    >
                      {leader.role === "Leading"
                        ? "Attached leader"
                        : "Supporting"}
                      : {leader.quantity} × {leader.selection.name}
                    </span>
                  ))}
                  {unit.notes.map((note) => (
                    <small className={styles.note} key={note}>
                      {note}
                    </small>
                  ))}
                </span>
                <small className={styles.hint}>Loadout</small>
              </summary>
              <div className={styles.contents}>
                {unit.variants.map((variant, index) => (
                  <div key={index}>
                    {unit.variants.length > 1 && (
                      <h5>
                        {variant.quantity} × {unit.name} · Loadout {index + 1}
                      </h5>
                    )}
                    <SelectedEquipment
                      selection={variant.selection}
                      composition={composition}
                    />
                  </div>
                ))}
                {unit.leaders.map((leader, index) => (
                  <div key={`leader:${index}`}>
                    <h5>
                      {leader.role === "Leading"
                        ? "Attached leader"
                        : "Supporting"}
                      : {leader.quantity} × {leader.selection.name}
                    </h5>
                    <SelectedEquipment
                      selection={leader.selection}
                      composition={composition}
                    />
                  </div>
                ))}
              </div>
            </details>
          </li>
        ))}
      </ul>
      {otherEquipment.length > 0 && (
        <details className={styles.unit}>
          <summary>Other recorded selections</summary>
          <Loadout selections={otherEquipment} />
        </details>
      )}
      {!units.length && !otherEquipment.length && (
        <p className={styles.note}>No selected units were supplied.</p>
      )}
    </div>
  );
}
