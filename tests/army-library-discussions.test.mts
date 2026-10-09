import assert from "node:assert/strict";
import { test } from "node:test";
import { armySnapshot, catalogue } from "../src/lib/catalogue";
import type { State, User, LibraryTarget } from "../src/lib/types";
import { archetypeId } from "../src/server/army-library-identity";
import {
  executeLibraryCommand,
  libraryDiscussionView,
} from "../src/server/library-discussions";

function fixture() {
  const user = (id: string, role: User["role"] = "member"): User => ({
    id,
    role,
    confirmedMember: true,
    name: id,
    email: `${id}@test.invalid`,
    faction: "",
    city: "",
    bio: "",
    phaseId: null,
    rejected: false,
    application: "",
  });
  const owner = user("owner"),
    reader = user("reader"),
    admin = user("admin", "admin");
  const faction = catalogue.factions.find((f) => f.name === "Orks")!;
  const detachment = faction.detachments[0];
  const army = armySnapshot({
    faction: faction.id,
    detachments: [detachment.id],
    disposition: detachment.dispositions[0],
    listUrl: "",
    listName: "Public fixture",
  });
  const state: State = {
    users: [owner, reader, admin],
    phases: [],
    games: [],
    evaluations: [],
    messages: [],
    goals: [],
    events: [],
    applications: [],
    audit: [],
    savedArmies: [
      {
        id: "public",
        userId: owner.id,
        ownerName: owner.name,
        patchId: "patch",
        army,
        shared: true,
        updatedAt: "2026-10-01T12:00:00.000Z",
        currentVersionId: "public:v1",
        listRevision: 1,
      },
    ],
    armyVersions: [
      {
        id: "public:v1",
        listId: "public",
        userId: owner.id,
        number: 1,
        patchId: "patch",
        army,
        published: true,
        createdAt: "2026-10-01T12:00:00.000Z",
      },
    ],
  };
  const target: LibraryTarget = { kind: "list", id: "public" };
  const archetype: LibraryTarget = {
    kind: "archetype",
    id: archetypeId(army, "patch"),
  };
  const post = (actor = owner, extra = {}) => {
    executeLibraryCommand(state, actor, {
      type: "libraryDiscussion",
      target,
      text: "Tactical discussion",
      ...extra,
    });
    return state.libraryDiscussions!.at(-1)!;
  };
  return { state, owner, reader, admin, target, archetype, post, army };
}

test("list and archetype discussions have dedicated storage, safe text and target matching", () => {
  const { state, owner, reader, target, archetype, post } = fixture();
  const parent = post(owner, {
    text: "<script>untrusted text</script>",
    context: { patchId: "patch", versionId: "public:v1" },
  });
  const reply = post(reader, { parentId: parent.id, text: "Reply" });
  assert.deepEqual(reply.context, parent.context);
  assert.equal(libraryDiscussionView(state, reader, target).length, 2);
  assert.equal(
    libraryDiscussionView(state, reader, target).find(
      (row) => row.id === parent.id,
    )!.text,
    "<script>untrusted text</script>",
  );
  executeLibraryCommand(state, reader, {
    type: "libraryDiscussion",
    target: archetype,
    text: "Archetype thread",
  });
  assert.equal(libraryDiscussionView(state, reader, archetype).length, 1);
  assert.equal(state.messages.length, 0);
  assert.throws(
    () =>
      executeLibraryCommand(state, reader, {
        type: "libraryDiscussion",
        target: archetype,
        parentId: parent.id,
        text: "Cross-target reply",
      }),
    /unavailable/,
  );
  assert.equal(
    executeLibraryCommand(state, owner, { type: "unrelated" }),
    false,
  );
});

test("guessed private list, version, variation, opponent and stale contexts are unavailable", () => {
  const { state, owner, reader, target, post } = fixture();
  assert.throws(
    () => post(reader, { target: { kind: "list", id: "private" } }),
    /unavailable/,
  );
  for (const context of [
    { versionId: "private:v1" },
    { patchId: "unknown" },
    { variationId: "private-variation" },
    { opponentArchetypeId: "private-archetype" },
  ]) {
    assert.throws(() => post(reader, { context }), /unavailable/);
  }
  const parent = post(owner, { context: { versionId: "public:v1" } });
  post(reader, { parentId: parent.id });
  state.armyVersions![0].published = false;
  state.armyVersions!.push({
    ...state.armyVersions![0],
    id: "public:v2",
    number: 2,
    published: true,
  });
  state.savedArmies![0].currentVersionId = "public:v2";
  assert.deepEqual(libraryDiscussionView(state, reader, target), []);
  assert.throws(
    () =>
      executeLibraryCommand(state, owner, {
        type: "libraryDiscussionEdit",
        id: parent.id,
        text: "Edit hidden version",
      }),
    /unavailable/,
  );
  assert.throws(() => post(reader, { parentId: parent.id }), /unavailable/);
});

test("withdrawal, deletion and removed owner prevent discussion reads and writes for admins too", () => {
  for (const revoke of [
    (s: State) => {
      s.savedArmies![0].shared = false;
    },
    (s: State) => {
      s.savedArmies = [];
    },
    (s: State) => {
      s.users[0].removedAt = "2026-10-09";
    },
    (s: State) => {
      s.users[0].confirmedMember = false;
    },
    (s: State) => {
      s.users[0].accountDeletedAt = "2026-10-09";
    },
  ]) {
    const { state, owner, reader, admin, target, archetype, post } = fixture();
    const row = post();
    revoke(state);
    for (const actor of [owner, reader, admin]) {
      assert.throws(
        () => libraryDiscussionView(state, actor, target),
        /unavailable/,
      );
      assert.throws(
        () => libraryDiscussionView(state, actor, archetype),
        /unavailable/,
      );
      assert.throws(
        () =>
          executeLibraryCommand(state, actor, {
            type: "libraryDiscussionDelete",
            id: row.id,
          }),
        /unavailable/,
      );
    }
  }
});

test("authors edit/delete, admins moderate, tombstones hide text and preserve existing replies", () => {
  const { state, owner, reader, admin, target, post } = fixture();
  const row = post();
  const reply = post(reader, { parentId: row.id });
  assert.throws(
    () =>
      executeLibraryCommand(state, reader, {
        type: "libraryDiscussionEdit",
        id: row.id,
        text: "Unauthorized",
      }),
    /unavailable/,
  );
  assert.throws(
    () =>
      executeLibraryCommand(state, reader, {
        type: "libraryDiscussionDelete",
        id: row.id,
      }),
    /unavailable/,
  );
  executeLibraryCommand(state, owner, {
    type: "libraryDiscussionEdit",
    id: row.id,
    text: "Author edited",
  });
  assert.equal(
    libraryDiscussionView(state, reader, target).find(
      (item) => item.id === row.id,
    )!.text,
    "Author edited",
  );
  assert.throws(
    () =>
      executeLibraryCommand(state, admin, {
        type: "libraryDiscussionEdit",
        id: row.id,
        text: "Changed author words",
      }),
    /unavailable/,
  );
  executeLibraryCommand(state, admin, {
    type: "libraryDiscussionDelete",
    id: row.id,
  });
  const visible = libraryDiscussionView(state, reader, target);
  assert.equal(visible.length, 2);
  assert.equal(visible.find((v) => v.id === row.id)!.text, "");
  assert.ok(visible.find((v) => v.id === row.id)!.deletedAt);
  assert.equal(visible.find((v) => v.id === reply.id)!.text, reply.text);
  assert.throws(() => post(reader, { parentId: row.id }), /unavailable/);
});

test("current actor membership is authoritative and matrix archetypes support discussions", () => {
  const { state, owner, reader, admin, target, archetype, army, post } =
    fixture();
  const forgedAdmin = { ...reader, role: "admin" as const };
  const row = post(owner);
  assert.throws(
    () =>
      executeLibraryCommand(state, forgedAdmin, {
        type: "libraryDiscussionDelete",
        id: row.id,
      }),
    /unavailable/,
  );
  reader.confirmedMember = false;
  assert.throws(
    () =>
      libraryDiscussionView(
        state,
        { ...reader, confirmedMember: true },
        target,
      ),
    /unavailable/,
  );
  state.savedArmies = [];
  state.matrixLists = [
    {
      id: "matrix",
      userId: owner.id,
      army,
      patchId: "patch",
      authorName: owner.name,
      updatedAt: "2026-10-09",
    },
  ];
  executeLibraryCommand(state, admin, {
    type: "libraryDiscussion",
    target: archetype,
    text: "Configuration discussion",
  });
  assert.equal(libraryDiscussionView(state, admin, archetype).length, 1);
  const matrixTarget: LibraryTarget = { kind: "list", id: "matrix:matrix" };
  executeLibraryCommand(state, admin, {
    type: "libraryDiscussion",
    target: matrixTarget,
    context: { patchId: "patch" },
    text: "Matrix list discussion",
  });
  assert.equal(libraryDiscussionView(state, admin, matrixTarget).length, 1);
  for (const context of [
    { patchId: "other" },
    { versionId: "public:v1" },
    { variationId: "invented" },
  ]) {
    assert.throws(
      () =>
        executeLibraryCommand(state, admin, {
          type: "libraryDiscussion",
          target: matrixTarget,
          context,
          text: "Invalid context",
        }),
      /unavailable/,
    );
  }
  owner.removedAt = "2026-10-09";
  assert.throws(
    () => libraryDiscussionView(state, admin, archetype),
    /unavailable/,
  );
  assert.throws(
    () => libraryDiscussionView(state, admin, matrixTarget),
    /unavailable/,
  );
});

test("reply context cannot override ancestor context and validation bounds text", () => {
  const { state, reader, target, post } = fixture();
  const parent = post(undefined, { context: { patchId: "patch" } });
  assert.throws(
    () => post(reader, { parentId: parent.id, context: {} }),
    /unavailable/,
  );
  assert.throws(() => post(reader, { text: " " }));
  assert.throws(() => post(reader, { text: "a".repeat(5001) }));
  assert.deepEqual(
    libraryDiscussionView(state, reader, target, { patchId: "other" }),
    [],
  );
});
