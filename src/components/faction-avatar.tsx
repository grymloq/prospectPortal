import Image from "next/image";
import { factionAvatar } from "@/lib/faction-avatars";
import styles from "./faction-avatar.module.css";

export function FactionAvatar({
  name,
  size = 20,
  decorative = false,
}: {
  name: string;
  size?: number;
  decorative?: boolean;
}) {
  const src = factionAvatar(name);
  return src ? (
    <Image
      src={src}
      width={size}
      height={size}
      alt={decorative ? "" : name}
      className={styles.avatar}
      unoptimized
    />
  ) : (
    <span
      className={styles.fallback}
      style={{ width: size, height: size }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : name}
      role={decorative ? undefined : "img"}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

export function FactionName({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span className={styles.name} data-faction-label>
      <FactionAvatar name={name} size={size} decorative />
      <span className={styles.text} data-faction-text>
        {name}
      </span>
    </span>
  );
}

export function FactionCredits() {
  return (
    <footer className={styles.credits}>
      Faction icons by{" "}
      <a
        href="https://40k.gallery/warhammer-40k-svg-icons/"
        target="_blank"
        rel="noreferrer"
      >
        40K Gallery
      </a>{" "}
      and{" "}
      <a href="/factions/credits.html" target="_blank" rel="noreferrer">
        wh40k-icon
      </a>
      .
    </footer>
  );
}
