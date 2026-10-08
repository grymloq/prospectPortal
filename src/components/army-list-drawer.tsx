"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export function ArmyListLink({
  url,
  name = "Army list",
  children,
  className = "text-button",
  title,
  textOnly = false,
}: {
  url: string;
  name?: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
  textOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${className}${textOnly ? " army-list-text-trigger" : ""}`}
        title={title}
        onClick={() => {
          if (url) setOpen(true);
        }}
      >
        {children || "Open army list"}
      </button>
      {open && (
        <ArmyListDrawer url={url} name={name} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function ArmyListDrawer({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el?.showModal();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      el?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  function close() {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      onClose,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    );
  }
  return createPortal(
    <dialog
      ref={dialog}
      className={`army-list-drawer ${closing ? "closing" : ""}`}
      aria-label={name}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          const bounds = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < bounds.left ||
            e.clientX > bounds.right ||
            e.clientY < bounds.top ||
            e.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <header className="army-list-drawer-head">
        <div>
          <h2>{name}</h2>
          <a href={url} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close army list"
          onClick={close}
          autoFocus
        >
          <X size={20} />
        </button>
      </header>
      {!loaded && (
        <p className="army-list-loading" role="status">
          Loading army list…
        </p>
      )}
      <iframe
        src={url}
        title={name}
        onLoad={() => setLoaded(true)}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      />
    </dialog>,
    document.body,
  );
}
