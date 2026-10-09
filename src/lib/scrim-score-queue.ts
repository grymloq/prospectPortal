import type { ScrimLayoutEdit, ScrimScoreUpdate, View } from "./types";

export function applyScrimScoreUpdate(
  view: View,
  update: ScrimScoreUpdate,
): View {
  if (view.me.id !== update.viewerId || view.accessPreview?.active)
    throw new Error("Your workspace access changed. Refresh before saving.");
  const target = view.scrims?.find((s) => s.id === update.scrimId);
  if (!target || target.revision > update.revision)
    throw new Error("This scrim changed. Refresh the workspace before saving.");
  return {
    ...view,
    scrims: view.scrims!.map((scrim) =>
      scrim.id !== update.scrimId
        ? scrim
        : {
            ...scrim,
            revision: update.revision,
            teams: scrim.teams.map((team) =>
              team.id !== update.teamId
                ? team
                : {
                    ...team,
                    estimates: [
                      ...team.estimates.filter(
                        (e) =>
                          e.ownId !== update.cell.ownId ||
                          e.enemyId !== update.cell.enemyId,
                      ),
                      update.cell,
                    ],
                  },
            ) as typeof scrim.teams,
          },
    ),
  };
}

/** Our accepted response advances the next queued revision; other writers still conflict. */
export function createScrimScoreQueue({
  read,
  apply,
  request,
}: {
  read: () => View | null;
  apply: (update: ScrimScoreUpdate) => void;
  request: (command: ScrimLayoutEdit) => Promise<ScrimScoreUpdate>;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  return (command: ScrimLayoutEdit) => {
    const viewerId = read()?.me.id;
    const work = async () => {
      const view = read();
      const scrim = view?.scrims?.find((s) => s.id === command.scrimId);
      if (
        !view ||
        view.me.id !== viewerId ||
        view.accessPreview?.active ||
        !scrim
      )
        throw new Error(
          "Your workspace access changed. Refresh before saving.",
        );
      const update = await request({ ...command, revision: scrim.revision });
      apply(update);
    };
    const result = tail.then(work, work);
    tail = result;
    return result;
  };
}
