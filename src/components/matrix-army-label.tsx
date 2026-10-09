"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArmyLibraryDTO } from "@/lib/types";
import { armyKey, type MatrixArmy } from "@/lib/matchups";
import { consolidateRoster } from "@/lib/roster-display";
import { ArmyListLink } from "./army-list-drawer";
import { Disposition } from "./disposition";
import { FactionName } from "./faction-avatar";
import { detachmentAbbreviation } from "@/lib/detachment-abbreviations";
import styles from "./matrix-army-label.module.css";

function positionPreview(element: HTMLElement, target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const { width, height } = element.getBoundingClientRect();
  const below = rect.bottom + 4;
  const top =
    below + height <= window.innerHeight - 8
      ? below
      : rect.top - height - 4 >= 8
        ? rect.top - height - 4
        : Math.max(8, Math.min(below, window.innerHeight - height - 8));
  element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  element.style.top = `${top}px`;
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

/** Only public library classifications may supply the optional archetype line. */
export function useMatrixArchetypes(
  patchId: string | undefined,
  revision?: object,
) {
  const [result, setResult] = useState<{
    patchId: string;
    revision?: object;
    names: Record<string, string>;
  }>();
  useEffect(() => {
    if (!patchId) return;
    const controller = new AbortController();
    async function load() {
      const names: Record<string, string> = {};
      for (let page = 1; ; page++) {
        const params = new URLSearchParams({
          tab: "archetypes",
          patchId: patchId!,
          pageSize: "50",
          page: String(page),
        });
        const response = await fetch(`/api/army-library?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { library }: { library: ArmyLibraryDTO } = await response.json();
        for (const row of library.archetypes)
          names[armyKey(row.army)] = row.name;
        if (page * library.pageSize >= library.total) break;
      }
      if (!controller.signal.aborted)
        setResult({ patchId: patchId!, revision, names });
    }
    void load().catch(() => {
      /* Optional labels remain absent if the authorized library is unavailable. */
    });
    return () => controller.abort();
  }, [patchId, revision]);
  return result && result.patchId === patchId && result.revision === revision
    ? result.names
    : {};
}

export function MatrixArmyLabel({
  item,
  name,
  side,
  archetype,
}: {
  item: MatrixArmy;
  name?: string;
  side: "own" | "opponent";
  archetype?: string;
}) {
  const id = useId();
  const target = useRef<HTMLSpanElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [anchor, setAnchor] = useState<{
    left: number;
    top: number;
  }>();
  const composition = item.army.composition;
  const units = composition && consolidateRoster(composition).units;
  const label = [
    name,
    item.army.listName,
    item.army.factionName,
    item.army.detachmentNames.join(" + "),
    item.army.dispositionName,
    archetype,
  ]
    .filter(Boolean)
    .join(" · ");
  useEffect(() => {
    if (!anchor) return;
    const scroll = (event: Event) => {
      if (
        event.target instanceof Node &&
        preview.current?.contains(event.target)
      )
        return;
      if (
        preview.current &&
        target.current &&
        !positionPreview(preview.current, target.current)
      )
        setAnchor(undefined);
    };
    const hide = () => setAnchor(undefined);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", hide);
    };
  }, [anchor]);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const element = preview.current;
    if (element && target.current) positionPreview(element, target.current);
  });
  function keepOpen() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }
  function leave() {
    keepOpen();
    closeTimer.current = setTimeout(() => setAnchor(undefined), 160);
  }
  function blur(event: React.FocusEvent) {
    if (
      event.relatedTarget instanceof Node &&
      (target.current?.contains(event.relatedTarget) ||
        preview.current?.contains(event.relatedTarget))
    )
      return;
    leave();
  }
  function show() {
    keepOpen();
    const rect = target.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      left: Math.max(
        8,
        Math.min(
          rect.left,
          window.innerWidth - Math.min(360, window.innerWidth - 16) - 8,
        ),
      ),
      top: rect.bottom + 4,
    });
  }
  return (
    <span
      ref={target}
      className={styles.target}
      onMouseEnter={show}
      onMouseLeave={leave}
      onFocus={show}
      onBlur={blur}
      onClickCapture={(event) => {
        if (target.current?.contains(event.target as Node))
          setAnchor(undefined);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setAnchor(undefined);
        }
      }}
      aria-describedby={anchor ? id : undefined}
    >
      <ArmyListLink
        textOnly
        url={item.army.listUrl}
        name={label}
        className={`matrix-list-label ${styles.label}`}
        describedBy={anchor ? id : undefined}
      >
        {side === "own" ? (
          <>
            <span className={styles.line}>
              {name || item.army.listName || item.army.factionName}
            </span>
            <span className={styles.line}>
              <FactionName name={item.army.factionName} />
            </span>
            <span className={styles.line}>
              <Disposition name={item.army.dispositionName} />
            </span>
          </>
        ) : (
          <>
            <span className={`${styles.line} ${styles.identity}`}>
              {name && (
                <>
                  <span className={styles.playerName}>{name}</span>
                  <span aria-hidden="true">-</span>
                </>
              )}
              <FactionName name={item.army.factionName} />
            </span>
            <span
              className={styles.line}
              aria-label={item.army.detachmentNames.join(" + ")}
            >
              {item.army.detachmentNames
                .map(detachmentAbbreviation)
                .join(" + ") || "No detachments"}
            </span>
            <span className={styles.line}>
              <Disposition name={item.army.dispositionName} />
            </span>
            {archetype && <span className={styles.line}>{archetype}</span>}
          </>
        )}
      </ArmyListLink>
      {anchor &&
        createPortal(
          <div
            ref={preview}
            id={id}
            role="tooltip"
            className={styles.preview}
            style={anchor}
            tabIndex={0}
            onMouseEnter={keepOpen}
            onMouseLeave={leave}
            onFocus={keepOpen}
            onBlur={blur}
          >
            <strong className={styles.line}>
              {item.army.listName || name || item.army.factionName}
            </strong>
            <small className={styles.line}>
              {item.army.detachmentNames.join(" + ")}
            </small>
            {composition?.status === "partial" && <small>Partial roster</small>}
            {units?.length ? (
              <>
                <ul aria-label="Consolidated roster preview">
                  {units.map((unit) => (
                    <li key={unit.key}>
                      <span className={styles.line}>
                        {unit.quantityKnown
                          ? unit.quantity
                          : "Unknown quantity"}{" "}
                        × {unit.name}
                      </span>
                      {unit.leaders.map((leader, index) => (
                        <small className={styles.line} key={index}>
                          {leader.role === "Leading"
                            ? "Attached leader"
                            : "Supporting"}
                          : {leader.quantity} × {leader.selection.name}
                        </small>
                      ))}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>No imported roster available.</p>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
