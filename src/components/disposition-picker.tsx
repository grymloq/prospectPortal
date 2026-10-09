"use client";
import { useId } from "react";
import { Disposition } from "./disposition";

export function DispositionPicker({
  available,
  value,
  onChange,
  legend = "Force disposition",
}: {
  available: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  legend?: string;
}) {
  const group = useId();
  return (
    <fieldset className="disposition-picker">
      <legend>{legend}</legend>
      <div className="disposition-options">
        {available.map((d) => (
          <label key={d.id}>
            <input
              type="radio"
              name={group}
              required
              checked={value === d.id}
              onChange={() => onChange(d.id)}
            />
            <Disposition name={d.name} />
          </label>
        ))}
      </div>
      {!available.length && (
        <small>Select detachments to see available dispositions.</small>
      )}
    </fieldset>
  );
}
