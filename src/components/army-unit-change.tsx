import type { LibraryUnitDeviation } from "@/lib/types";
import styles from "./army-unit-change.module.css";

export function ArmyUnitChange({ unit }: { unit: LibraryUnitDeviation }) {
  const modelDelta =
    unit.baselineModels !== undefined && unit.listModels !== undefined
      ? unit.listModels - unit.baselineModels
      : 0;
  const delta = unit.delta || modelDelta;
  const sizes = unit.delta > 0 ? unit.listModelSizes : unit.baselineModelSizes;
  const sizeLabel = sizes?.some((size) => size.models > 1)
    ? ` (${sizes.map((size) => size.models).join(" / ")})`
    : "";
  const describe = (
    sizes: NonNullable<LibraryUnitDeviation["listModelSizes"]>,
    quantity: number,
  ) =>
    sizes
      .map((size) =>
        quantity > 1 ? `${size.quantity} × ${size.models}` : size.models,
      )
      .join(" / ");
  const before = unit.baselineModelSizes
    ? describe(unit.baselineModelSizes, unit.baselineQuantity)
    : unit.baselineModels;
  const after = unit.listModelSizes
    ? describe(unit.listModelSizes, unit.listQuantity)
    : unit.listModels;
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
      {unit.delta === 0 ? ` (${before} → ${after} models/unit)` : sizeLabel}
    </strong>
  );
}
