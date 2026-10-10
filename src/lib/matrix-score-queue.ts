import type {
  Army,
  Layout,
  ManualEstimate,
  MatrixList,
  State,
  View,
} from "./types";

export type MatrixScoreEdit = {
  type: "manualEstimate";
  patchId: string;
  own: Army;
  enemy: Army;
  layout: Layout;
  score: number | null;
};
export type MatrixScoreUpdate = {
  kind: "matrix-score";
  viewerId: string;
  change: NonNullable<State["matrixChanges"]>[number];
  estimate: ManualEstimate | null;
  lists: MatrixList[];
};

export function applyMatrixScoreUpdate(
  view: View,
  update: MatrixScoreUpdate,
): View {
  if (view.me.id !== update.viewerId || view.accessPreview?.active)
    throw new Error("Your workspace access changed. Refresh before saving.");
  const { change } = update;
  const sameCell = (entry: ManualEstimate) =>
    entry.patchId === change.patchId &&
    entry.row === change.row &&
    entry.column === change.column &&
    entry.layout === change.layout;
  const additions = update.lists.filter(
    (list) => !view.matrixLists?.some((existing) => existing.id === list.id),
  );
  return {
    ...view,
    manualEstimates: [
      ...(view.manualEstimates || []).filter((entry) => !sameCell(entry)),
      ...(update.estimate ? [update.estimate] : []),
    ],
    matrixChanges: [...(view.matrixChanges || []), change],
    matrixLists: additions.length
      ? [...(view.matrixLists || []), ...additions]
      : view.matrixLists,
  };
}

/** Serialize rapid edits and reject results superseded by a full workspace refresh. */
export function createMatrixScoreQueue({
  read,
  epoch,
  apply,
  request,
}: {
  read: () => View | null;
  epoch: () => number;
  apply: (update: MatrixScoreUpdate) => void;
  request: (command: MatrixScoreEdit) => Promise<MatrixScoreUpdate>;
}) {
  let tail: Promise<unknown> = Promise.resolve();
  return (command: MatrixScoreEdit) => {
    const viewerId = read()?.me.id,
      generation = epoch();
    const check = () => {
      const view = read();
      if (
        !view ||
        view.me.id !== viewerId ||
        view.accessPreview?.active ||
        epoch() !== generation
      )
        throw new Error("Your workspace changed. Refresh before saving.");
    };
    const work = async () => {
      check();
      const update = await request(command);
      check();
      apply(update);
    };
    const result = tail.then(work, work);
    tail = result;
    return result;
  };
}
