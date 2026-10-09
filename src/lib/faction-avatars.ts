import assets from "@/data/faction-avatars.json";

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const aliases: Record<string, string> = {
  adeptusastartes: "Space Marines",
  imperialagents: "Agents of the Imperium",
  custodes: "Adeptus Custodes",
  eldar: "Aeldari",
  darkeldar: "Drukhari",
  tau: "T'au Empire",
  daemons: "Chaos Daemons",
  daemonschaos: "Chaos Daemons",
  questortraitoris: "Chaos Knights",
};

const byName = new Map(assets.map((asset) => [normalize(asset.name), asset]));

/** Resolve the recorded name, without changing historical catalogue identity. */
export function factionAvatar(name: string) {
  const key = normalize(name);
  const asset = byName.get(normalize(aliases[key] || name));
  return asset ? `/factions/${asset.slug}.svg` : undefined;
}
