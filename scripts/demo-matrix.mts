import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { catalogue, armySnapshot, dispositionsFor } from "../src/lib/catalogue";
import { buildMatchups, armyKey, cellKey } from "../src/lib/matchups";
import { execute } from "../src/server/service";
import type { State, User } from "../src/lib/types";

// Explicitly invoked maintenance tool. Uses a dedicated, non-login demo profile.
const file = process.argv[2],
  mode = process.argv[3];
if (!file || !["seed", "remove"].includes(mode))
  throw new Error(
    "Usage: tsx scripts/demo-matrix.mts <private-env-json> seed|remove",
  );
const env = JSON.parse(readFileSync(file, "utf8"));
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const userId = "demo-matrix-practice-v1";
const names = ["Orks", "Space Marines", "Aeldari", "Tyranids"];
const armies = names.flatMap((name) => {
  const faction = catalogue.factions.find((f) => f.name === name)!;
  return [1, name === "Tyranids" ? 3 : 2].map((count) => {
    const detachments = faction.detachments.slice(0, count).map((d) => d.id);
    const dispositions = dispositionsFor(faction.id, detachments);
    return armySnapshot({
      faction: faction.id,
      detachments,
      disposition: dispositions[count === 1 ? 0 : dispositions.length - 1].id,
      listUrl: "",
    });
  });
});
for (let attempt = 0; attempt < 12; attempt++) {
  const { data, error } = await db
    .from("portal_state")
    .select("revision,value")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  const s = data.value as State;
  // Idempotent replacement/removal is limited to this explicitly named demo profile.
  s.games = s.games.filter((g) => g.userId !== userId);
  if (mode === "remove") {
    s.users = s.users.filter((u) => u.id !== userId);
  } else {
    let actor = s.users.find((u) => u.id === userId);
    if (!actor) {
      actor = {
        id: userId,
        name: "DEMO · Matrix practice",
        email: "matrix-demo@example.invalid",
        role: "member",
        faction: armies[0].faction,
        city: "Demo workspace",
        bio: "Synthetic matrix testing only. These scores are invented and do not represent army strength or real player performance. No login account.",
        phaseId: null,
        rejected: false,
        application: "",
      } satisfies User;
      s.users.push(actor);
    }
    let index = 0;
    for (let i = 0; i < armies.length; i++)
      for (let j = i + 1; j < armies.length; j++)
        for (const [l, layout] of (["A", "B", "C"] as const).entries())
          for (let repeat = 0; repeat < 2; repeat++) {
            const base = 5 + ((i * 7 + j * 3) % 11),
              bias = [-3, 0, 3][l];
            const score = Math.max(
              0,
              Math.min(20, base + bias + (repeat === 0 ? -1 : 2)),
            );
            const date = new Date();
            date.setUTCDate(date.getUTCDate() - 1 - (index % 60));
            execute(s, actor, {
              type: "game",
              date: date.toISOString().slice(0, 10),
              opponent: "DEMO opponent " + (j + 1),
              own: armies[i],
              enemy: armies[j],
              score,
              layout,
              context: "DEMO · Matrix test",
              notes:
                "SYNTHETIC DATA — invented scores for testing filters and layout averages, not real games or predictions.",
              eventId: "",
            });
            s.games[s.games.length - 1].id = "demo-matrix-v1-" + index++;
          }
  }
  const result = await db.rpc("portal_commit", {
    expected_revision: data.revision,
    next_value: s,
  });
  if (result.error) throw new Error(result.error.message);
  if (result.data) {
    const games = s.games.filter((g) => g.userId === userId),
      matrix = buildMatchups(games);
    console.log(
      JSON.stringify({
        mode,
        games: games.length,
        configurations: matrix.armies.length,
        factions: names.length,
        layouts: ["A", "B", "C"],
        example:
          mode === "seed"
            ? matrix.cells.get(cellKey(armyKey(armies[0]), armyKey(armies[2])))
            : undefined,
      }),
    );
    break;
  }
  if (attempt === 11)
    throw new Error("Workspace busy; no demo changes committed.");
}
