import type { LibraryLoadoutDeviation, LibraryLoadoutItem } from "@/lib/types";
import styles from "./army-unit-change.module.css";

function label(item: LibraryLoadoutItem) {
  return `${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name} (${item.kind === "enhancement" ? "enhancement" : "upgrade"})`;
}
export function ArmyLoadoutChanges({
  changes,
}: {
  changes: LibraryLoadoutDeviation[];
}) {
  return changes.map((change) => (
    <div className={styles.loadout} key={change.unitSourceId}>
      <strong>{change.unitName}</strong>
      {change.removed.map((item) => (
        <span
          className={`${styles.line} ${styles.removed}`}
          key={`removed:${item.kind}:${item.sourceId}`}
        >
          − {label(item)}
        </span>
      ))}
      {change.added.map((item) => (
        <span
          className={`${styles.line} ${styles.added}`}
          key={`added:${item.kind}:${item.sourceId}`}
        >
          + {label(item)}
        </span>
      ))}
      {change.before && change.after && (
        <>
          <span className={styles.line}>
            Loadouts across changed unit counts:
          </span>
          <span className={styles.line}>
            Was: {change.before.map(label).join(", ") || "None"}
          </span>
          <span className={styles.line}>
            Now: {change.after.map(label).join(", ") || "None"}
          </span>
        </>
      )}
    </div>
  ));
}
