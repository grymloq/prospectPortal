"use client";
import { FactionName } from "./faction-avatar";
import type { ReactNode } from "react";
import type { MatrixArmy } from "@/lib/matchups";
import { Disposition } from "./disposition";
export type Filter = { factions: string[]; lists: string[] };
export const emptyFilter = (): Filter => ({ factions: [], lists: [] });
function Picker({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: ReactNode }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <details className="matrix-picker">
      <summary>
        {label}{" "}
        <span>{selected.length ? selected.length + " selected" : "All"}</span>
      </summary>
      <div className="matrix-options">
        <button
          type="button"
          className="text-button"
          onClick={() => onChange([])}
        >
          Show all (clear filter)
        </button>
        {options.map((o) => (
          <label key={o.id}>
            <input
              type="checkbox"
              checked={selected.includes(o.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        ))}
        {!options.length && <p>No lists match these factions.</p>}
      </div>
    </details>
  );
}
export function AxisFilter({
  axis,
  armies,
  value,
  onChange,
}: {
  axis: string;
  armies: MatrixArmy[];
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const factions = [
    ...new Map(
      armies.map((a) => [a.army.faction, a.army.factionName]),
    ).entries(),
  ].map(([id, label]) => ({ id, label: <FactionName name={label} /> }));
  const available = armies.filter(
    (a) => !value.factions.length || value.factions.includes(a.army.faction),
  );
  return (
    <section className="panel matrix-axis">
      <h3>{axis}</h3>
      <Picker
        label={axis + " factions"}
        options={factions}
        selected={value.factions}
        onChange={(factions) => onChange({ factions, lists: [] })}
      />
      <Picker
        label={axis + " army lists"}
        options={available.map((a) => ({
          id: a.key,
          label: (
            <>
              {a.army.listName && <>{a.army.listName} · </>}
              <FactionName name={a.army.factionName} />
              {a.army.detachmentNames.length > 0 && (
                <> · {a.army.detachmentNames.join(" + ")}</>
              )}{" "}
              · <Disposition name={a.army.dispositionName} />
            </>
          ),
        }))}
        selected={value.lists}
        onChange={(lists) => onChange({ ...value, lists })}
      />
    </section>
  );
}
