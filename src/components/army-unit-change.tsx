import type { LibraryUnitDeviation } from "@/lib/types";
import styles from "./army-unit-change.module.css";

export function ArmyUnitChange({ unit }: { unit: LibraryUnitDeviation }) {
  const modelDelta =
    unit.baselineModels !== undefined && unit.listModels !== undefined
      ? unit.listModels - unit.baselineModels
      : 0;
  const delta = unit.delta || modelDelta;
  return (
    <strong
      className={
        delta > 0 ? styles.added : delta < 0 ? styles.removed : undefined
      }
    >
      {unit.delta > 0
        ? `+${unit.delta}`
        : unit.delta < 0
          ? `−${Math.abs(unit.delta)}`
          : "Changed size"}{" "}
      {unit.name}
      {unit.delta === 0 &&
        ` (${unit.baselineModels} → ${unit.listModels} models)`}
    </strong>
  );
}
