"use client";

import Image from "next/image";
import DeploymentCarousel from "./deployment-carousel";
import { useState } from "react";
import { matchupMissions } from "@/lib/matchup-missions";
import styles from "./matchup-missions.module.css";

function MissionCard({
  front,
  back,
  name,
}: {
  front: string;
  back?: string;
  name: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  if (!back)
    return <ReferenceImage src={front} alt={`${name} primary mission card`} />;
  return (
    <button
      type="button"
      className={styles.flipCard}
      aria-label={`${name}: ${flipped ? "back" : "front"} side. Flip card`}
      aria-pressed={flipped}
      data-flipped={flipped}
      data-keyboard={keyboard}
      onKeyDown={() => setKeyboard(true)}
      onPointerDown={() => setKeyboard(false)}
      onClick={() => setFlipped(!flipped)}
    >
      <span className={styles.flipInner}>
        <span className={styles.front} aria-hidden={flipped}>
          <Image
            src={front}
            alt={`${name} front`}
            fill
            quality={90}
            sizes="(max-width: 760px) 45vw, 420px"
          />
        </span>
        <span className={styles.back} aria-hidden={!flipped}>
          <Image
            src={back}
            alt={`${name} back`}
            fill
            quality={90}
            sizes="(max-width: 760px) 45vw, 420px"
          />
        </span>
      </span>
    </button>
  );
}

function ReferenceImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.image}>
      {failed ? (
        <span>Card unavailable.</span>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          quality={90}
          sizes="(max-width: 760px) calc(100vw - 74px), 420px"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export default function MatchupMissions({
  ownDisposition,
  enemyDisposition,
  ownLabel,
  enemyLabel,
}: {
  ownDisposition: string;
  enemyDisposition: string;
  ownLabel: string;
  enemyLabel: string;
}) {
  const reference = matchupMissions(ownDisposition, enemyDisposition);
  const [view, setView] = useState("primary");
  if (!reference)
    return (
      <section className={styles.reference}>
        <h3>Missions and layouts</h3>
        <p>No 11th-edition card mapping is available for these dispositions.</p>
      </section>
    );
  const cards = reference.mirror
    ? [{ ...reference.own, label: "Both players" }]
    : [
        { ...reference.own, label: ownLabel },
        { ...reference.enemy, label: enemyLabel },
      ];
  return (
    <section
      className={styles.reference}
      aria-label="Matchup missions and layouts"
    >
      <div className={styles.heading}>
        <h3>Missions and layouts</h3>
      </div>
      <div
        className={styles.controls}
        role="group"
        aria-label="Missions and layouts views"
      >
        <button
          type="button"
          aria-pressed={view === "primary"}
          onClick={() => setView("primary")}
        >
          Primary missions
        </button>
        <button
          type="button"
          aria-pressed={view === "deployments"}
          onClick={() => setView("deployments")}
        >
          Deployments
        </button>
      </div>
      {view === "primary" ? (
        <div
          className={`${styles.cards} ${reference.mirror ? styles.single : ""}`}
        >
          {cards.map((card) => (
            <figure key={card.image}>
              <figcaption>
                <strong>{card.label}</strong>
                <span>
                  {card.disposition} · {card.name}
                </span>
              </figcaption>
              <MissionCard
                front={card.image}
                back={card.backImage}
                name={card.name}
              />
            </figure>
          ))}
        </div>
      ) : (
        <DeploymentCarousel>
          {reference.layouts.map((deployment) => (
            <figure key={deployment.number}>
              <figcaption>Layout {deployment.number}</figcaption>
              <ReferenceImage
                src={deployment.image}
                alt={`${ownDisposition} vs ${enemyDisposition} deployment layout ${deployment.number}`}
              />
            </figure>
          ))}
        </DeploymentCarousel>
      )}
    </section>
  );
}
