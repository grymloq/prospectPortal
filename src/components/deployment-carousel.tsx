"use client";

import { useRef, useState, type ReactNode } from "react";
import styles from "./matchup-missions.module.css";

export default function DeploymentCarousel({
  children,
}: {
  children: ReactNode[];
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; scroll: number } | null>(null);
  const [active, setActive] = useState(0);
  const go = (index: number) => {
    const element = track.current;
    const slide = element?.children[
      Math.max(0, Math.min(children.length - 1, index))
    ] as HTMLElement | undefined;
    if (element && slide)
      element.scrollTo({
        left: Math.min(
          slide.offsetLeft,
          element.scrollWidth - element.clientWidth,
        ),
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  };
  const finish = (element: HTMLDivElement) => {
    const gesture = drag.current;
    if (!gesture) return;
    drag.current = null;
    element.removeAttribute("data-dragging");
    if (element.hasPointerCapture(gesture.id))
      element.releasePointerCapture(gesture.id);
  };
  return (
    <section aria-label="Deployment layouts" aria-roledescription="carousel">
      <div className={styles.carouselControls}>
        <button
          type="button"
          aria-label="Previous deployment layout"
          disabled={active === 0}
          onClick={() => go(active - 1)}
        >
          ←
        </button>
        <span aria-live="polite">
          Layout {active + 1} of {children.length}
        </span>
        <button
          type="button"
          aria-label="Next deployment layout"
          disabled={active === children.length - 1}
          onClick={() => go(active + 1)}
        >
          →
        </button>
      </div>
      <div
        ref={track}
        className={styles.layouts}
        tabIndex={0}
        role="region"
        aria-label="Swipe or drag to browse deployment layouts"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            go(active + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
        onScroll={(event) => {
          const element = event.currentTarget;
          const slides = Array.from(element.children) as HTMLElement[];
          const end = element.scrollWidth - element.clientWidth;
          setActive(
            slides.reduce(
              (best, slide, index) =>
                Math.abs(Math.min(slide.offsetLeft, end) - element.scrollLeft) <
                Math.abs(
                  Math.min(slides[best].offsetLeft, end) - element.scrollLeft,
                )
                  ? index
                  : best,
              0,
            ),
          );
        }}
        onPointerDown={(event) => {
          const element = event.currentTarget;
          if (event.pointerType === "touch") {
            element.removeAttribute("data-desktop");
            return;
          }
          if (event.button !== 0) return;
          // Desktop dragging stays where released. Restoring CSS snapping here
          // would pull short drags back to the previous card.
          element.setAttribute("data-desktop", "true");
          element.scrollTo({ left: element.scrollLeft, behavior: "instant" });
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            scroll: element.scrollLeft,
          };
          element.setAttribute("data-dragging", "true");
          element.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (drag.current)
            event.currentTarget.scrollLeft =
              drag.current.scroll - (event.clientX - drag.current.x);
        }}
        onPointerUp={(event) => finish(event.currentTarget)}
        onPointerCancel={(event) => finish(event.currentTarget)}
        onLostPointerCapture={(event) => finish(event.currentTarget)}
        onDragStart={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </section>
  );
}
