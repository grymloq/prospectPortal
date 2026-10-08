import Image from "next/image";
import type { CSSProperties } from "react";
const styles: Record<
  string,
  {
    icon: string;
    color: string;
    size: [number, number];
    crop: [number, number, number, number];
    shape: string;
  }
> = {
  "Priority Assets": {
    icon: "prio",
    color: "#685808",
    size: [62, 61],
    crop: [4, 6, 51, 51],
    shape: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
  },
  Disruption: {
    icon: "disruption",
    color: "#084868",
    size: [63, 58],
    crop: [6, 6, 52, 46],
    shape: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)",
  },
  "Purge the Foe": {
    icon: "purge",
    color: "#680818",
    size: [69, 57],
    crop: [5, 5, 53, 45],
    shape: "polygon(0 0, 100% 0, 50% 100%)",
  },
  Reconnaissance: {
    icon: "recon",
    color: "#083838",
    size: [71, 61],
    crop: [10, 9, 50, 49],
    shape: "ellipse(50% 50% at 50% 50%)",
  },
  "Take and Hold": {
    icon: "takeandhold",
    color: "#084818",
    size: [53, 63],
    crop: [4, 4, 45, 56],
    shape: "polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)",
  },
};
export function Disposition({ name }: { name: string }) {
  const style = styles[name];
  return (
    <span
      className="disposition-label"
      style={style ? { color: style.color } : undefined}
    >
      {style && (
        <span
          className="disposition-icon"
          aria-hidden="true"
          style={
            {
              "--icon-ratio": style.crop[2] / style.crop[3],
              clipPath: style.shape,
            } as CSSProperties
          }
        >
          <Image
            src={`/dispositions/${style.icon}.png`}
            width={style.size[0]}
            height={style.size[1]}
            alt=""
            unoptimized
            style={{
              width: `${(style.size[0] / style.crop[2]) * 100}%`,
              height: `${(style.size[1] / style.crop[3]) * 100}%`,
              left: `${(-style.crop[0] / style.crop[2]) * 100}%`,
              top: `${(-style.crop[1] / style.crop[3]) * 100}%`,
            }}
          />
        </span>
      )}
      <span>{name}</span>
    </span>
  );
}
