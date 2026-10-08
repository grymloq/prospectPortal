// GD Missions 11th-edition matrix and layout definitions, verified 8 October 2026.
// https://gdmissions.app/11th/matrix
// https://gdmissions.app/11th/layouts
const origin = "https://gdmissions.app";
export const missionDispositions = [
  "Take and Hold",
  "Purge the Foe",
  "Disruption",
  "Reconnaissance",
  "Priority Assets",
] as const;
type Disposition = (typeof missionDispositions)[number];
const missions: Record<Disposition, readonly string[]> = {
  "Take and Hold": [
    "Battlefield Dominance",
    "Immovable Object",
    "Determined Acquisition",
    "Purge and Secure",
    "Inescapable Dominion",
  ],
  "Purge the Foe": [
    "Unstoppable Force",
    "Meatgrinder",
    "Punishment",
    "Consecrate",
    "Destroyer's Wrath",
  ],
  Disruption: [
    "Death Trap",
    "Delaying Action",
    "Outmanoeuvre",
    "Smoke and Mirrors",
    "Locate and Deny",
  ],
  Reconnaissance: [
    "Reconnaissance Sweep",
    "Triangulation",
    "Surveil the Foe",
    "Gather Intel",
    "Search and Scour",
  ],
  "Priority Assets": [
    "Secure Asset",
    "Vital Link",
    "Extract Relic",
    "Vanguard Operation",
    "Sabotage",
  ],
};
const layoutOrder = [
  "take-and-hold",
  "disruption",
  "purge-the-foe",
  "priority-assets",
  "reconnaissance",
];
// One alternative in each pairing has a distinct portrait asset on the source.
const portraitLayouts: Record<string, number> = {
  "disruption-mirror": 3,
  "disruption-vs-priority-assets": 1,
  "disruption-vs-purge-the-foe": 3,
  "disruption-vs-reconnaissance": 2,
  "priority-assets-mirror": 1,
  "priority-assets-vs-reconnaissance": 3,
  "purge-the-foe-mirror": 3,
  "purge-the-foe-vs-priority-assets": 1,
  "purge-the-foe-vs-reconnaissance": 2,
  "reconnaissance-mirror": 1,
  "take-and-hold-mirror": 2,
  "take-and-hold-vs-disruption": 1,
  "take-and-hold-vs-priority-assets": 3,
  "take-and-hold-vs-purge-the-foe": 1,
  "take-and-hold-vs-reconnaissance": 2,
};
const slug = (name: string) =>
  name.toLowerCase().replaceAll("'", "").replaceAll(" ", "-");
function disposition(name: string) {
  return missionDispositions.find(
    (value) => value.toLowerCase() === name.trim().toLowerCase(),
  );
}
export function matchupMissions(ownName: string, enemyName: string) {
  const own = disposition(ownName),
    enemy = disposition(enemyName);
  if (!own || !enemy) return null;
  function primary(side: Disposition, opponent: Disposition) {
    const name = missions[side][missionDispositions.indexOf(opponent)];
    const path = `11th/primary-missions/${slug(side)}/${slug(name)}`;
    return {
      name,
      disposition: side,
      page: `${origin}/${path}`,
      image: `${origin}/assets/${path}.png`,
    };
  }
  const [first, second] = [slug(own), slug(enemy)].sort(
    (a, b) => layoutOrder.indexOf(a) - layoutOrder.indexOf(b),
  );
  const pair = first === second ? `${first}-mirror` : `${first}-vs-${second}`;
  return {
    own: primary(own, enemy),
    enemy: primary(enemy, own),
    mirror: own === enemy,
    deploymentPage: `${origin}/11th/layouts/${slug(own)}/${slug(enemy)}`,
    layouts: [1, 2, 3].map((number) => {
      const filename = `${pair}-${number}${portraitLayouts[pair] === number ? "-portrait" : ""}.png`;
      return {
        number,
        image: `${origin}/assets/11th/layouts/no-measurements/${filename}`,
        measurementsImage: `${origin}/assets/11th/layouts/with-measurements/${filename}`,
      };
    }),
  };
}
