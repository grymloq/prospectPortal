"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DetachmentNames } from "./detachment-name";
import styles from "./multi-select-dropdown.module.css";

export function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  disabled = false,
  maxSelected = 3,
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  maxSelected?: number;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ above: false, height: 300 });
  const names = options
    .filter((o) => selected.includes(o.id))
    .map((o) => o.name);
  const text = names.length ? names.join(", ") : "All detachments";
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function show(focusFirst = false) {
    const rect = trigger.current!.getBoundingClientRect();
    const below =
      window.innerHeight - rect.bottom - (window.innerWidth < 900 ? 100 : 16);
    const above = below < 180 && rect.top > below;
    setPlacement({
      above,
      height: Math.max(100, Math.min(300, (above ? rect.top - 16 : below) - 8)),
    });
    setOpen(true);
    if (focusFirst)
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLInputElement>("input:not(:disabled)")
          ?.focus(),
      );
  }
  return (
    <div
      ref={root}
      className={`field ${styles.root}`}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))
          setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span id={`${id}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            show(true);
          }
        }}
      >
        <span id={`${id}-value`} className={styles.value} title={text}>
          {names.length ? (
            <DetachmentNames names={names} separator=", " focusable={false} />
          ) : (
            text
          )}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${id}-options`}
          role="group"
          aria-labelledby={`${id}-label`}
          className={`${styles.options} ${placement.above ? styles.above : ""}`}
          style={{ maxHeight: placement.height }}
        >
          <button
            type="button"
            className="text-button"
            disabled={disabled || !selected.length}
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
          {options.map((option) => (
            <label key={option.id} className={styles.option}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                disabled={
                  disabled ||
                  (!selected.includes(option.id) &&
                    selected.length >= maxSelected)
                }
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, option.id]
                      : selected.filter((id) => id !== option.id),
                  )
                }
              />
              <span>{option.name}</span>
            </label>
          ))}
          <small>
            {options.length
              ? `Choose up to ${maxSelected} detachments.`
              : "No detachments available."}
          </small>
        </div>
      )}
    </div>
  );
}
