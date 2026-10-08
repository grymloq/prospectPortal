import Image from "next/image";
const styles: Record<string, { icon: string; color: string }> = {
  "Priority Assets": { icon: "prio", color: "#685808" },
  Disruption: { icon: "disruption", color: "#084868" },
  "Purge the Foe": { icon: "purge", color: "#680818" },
  Reconnaissance: { icon: "recon", color: "#083838" },
  "Take and Hold": { icon: "takeandhold", color: "#084818" },
};
export function Disposition({ name }: { name: string }) {
  const style = styles[name];
  return (
    <span
      className="disposition-label"
      style={style ? { color: style.color } : undefined}
    >
      {style && (
        <Image
          src={`/dispositions/${style.icon}.svg`}
          width={24}
          height={24}
          alt=""
          className="disposition-icon"
        />
      )}
      <span>{name}</span>
    </span>
  );
}
