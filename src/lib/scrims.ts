import type { Scrim, ScrimTeam } from "./types";

export function onScrimTeam(team: ScrimTeam, userId: string) {
  return (
    team.captainId === userId ||
    team.entries.some((entry) => entry.userId === userId)
  );
}

export function rosterWarnings(
  scrim: Scrim,
  team: ScrimTeam,
  dispositions: { id: string; name: string }[],
) {
  const warnings: string[] = [];
  if (team.entries.length !== scrim.teamSize)
    warnings.push(
      `Assign ${scrim.teamSize} players (${team.entries.length} assigned).`,
    );
  const missingLists = team.entries.filter((entry) => !entry.army).length;
  if (missingLists)
    warnings.push(
      `${missingLists} player${missingLists === 1 ? " needs" : "s need"} a list.`,
    );
  const counts = new Map<string, number>();
  for (const entry of team.entries) {
    if (entry.army)
      counts.set(
        entry.army.disposition,
        (counts.get(entry.army.disposition) || 0) + 1,
      );
  }
  const small = scrim.teamSize < dispositions.length;
  for (const disposition of dispositions) {
    const count = counts.get(disposition.id) || 0;
    if (!small && count === 0) warnings.push(`Missing ${disposition.name}.`);
    if (count > (small ? 1 : 2))
      warnings.push(
        `${disposition.name}: ${count} lists; maximum ${small ? 1 : 2}.`,
      );
  }
  return warnings;
}

export function scrimScore(scrim: Scrim) {
  const reported = scrim.pairings.filter((pair) => pair.scoreA !== undefined);
  const a = reported.reduce((sum, pair) => sum + pair.scoreA!, 0);
  const b = reported.length * 20 - a;
  const complete = !!scrim.pairedAt && reported.length === scrim.teamSize;
  const winner = !complete
    ? null
    : Math.abs(a - b) <= 5
      ? "Draw"
      : scrim.teams[a > b ? 0 : 1].name;
  return { a, b, reported: reported.length, complete, winner };
}
