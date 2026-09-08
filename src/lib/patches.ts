import type { State, Patch } from "./types";
export const initialPatch: Patch = {
  id: "2026-09-02",
  name: "Ork release",
  date: "2026-09-02",
};
export function patchLabel(patch: Patch) {
  return patch.name + " — " + patch.date;
}
export function ensurePatches(state: State) {
  let changed = false;
  if (!state.patches) {
    state.patches = [{ ...initialPatch }];
    changed = true;
  }
  if (state.games.some((g) => !g.patchId)) {
    if (!state.patches.some((p) => p.id === initialPatch.id))
      state.patches.push({ ...initialPatch });
    for (const game of state.games)
      if (!game.patchId) game.patchId = initialPatch.id;
    changed = true;
  }
  return changed;
}
