"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { detachmentAbbreviation } from "@/lib/detachment-abbreviations";
import styles from "./detachment-name.module.css";

function positionFor(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    left: Math.max(
      8,
      Math.min(
        rect.left,
        window.innerWidth - Math.min(320, window.innerWidth - 16) - 8,
      ),
    ),
    ...(rect.top > window.innerHeight / 2
      ? { bottom: window.innerHeight - rect.top + 8 }
      : { top: rect.bottom + 8 }),
  };
}

export function DetachmentName({
  name,
  focusable = true,
}: {
  name: string;
  focusable?: boolean;
}) {
  const id = useId();
  const target = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [anchor, setAnchor] = useState<{
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const open = !!anchor;
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const element = target.current;
      const rect = element?.getBoundingClientRect();
      setAnchor(
        element &&
          rect &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight &&
          rect.right > 0 &&
          rect.left < window.innerWidth
          ? positionFor(element)
          : null,
      );
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);
  function show(element: HTMLElement) {
    target.current = element;
    setPortalRoot(
      element.closest<HTMLDialogElement>("dialog[open]") || document.body,
    );
    setAnchor(positionFor(element));
  }
  return (
    <span
      className={styles.name}
      tabIndex={focusable ? 0 : undefined}
      aria-label={name}
      aria-describedby={anchor ? id : undefined}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setAnchor(null)}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => setAnchor(null)}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse") show(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && anchor) {
          event.preventDefault();
          event.stopPropagation();
          setAnchor(null);
        }
      }}
    >
      {detachmentAbbreviation(name)}
      {anchor &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={styles.tooltip}
            style={anchor}
          >
            {name}
          </span>,
          portalRoot || document.body,
        )}
    </span>
  );
}

export function DetachmentNames({
  names,
  separator = " + ",
  fallback = "",
  focusable = true,
}: {
  names: string[];
  separator?: string;
  fallback?: string;
  focusable?: boolean;
}) {
  return names.length
    ? names.map((name, index) => (
        <Fragment key={`${index}:${name}`}>
          {index > 0 && separator}
          <DetachmentName name={name} focusable={focusable} />
        </Fragment>
      ))
    : fallback;
}
