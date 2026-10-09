import assert from "node:assert/strict";

/** Uses the caller's isolated production server and established session helpers. */
export async function testArmyLibraryHttp({ request, check, admin, player }) {
  const playerState = (await request("/api/state", null, player.cookie)).data;
  const source = playerState.games.find(
    (game) => game.userId === playerState.me.id,
  );
  assert.ok(source, "Seeded player journal fixture required.");
  const patchId = source.patchId;
  const inputArmy = {
    ...source.own,
    listName: "HTTP LIBRARY public fixture",
    listUrl: "",
  };
  const query = `patchId=${encodeURIComponent(patchId)}&search=HTTP%20LIBRARY`;
  const library = async (cookie = player.cookie, extra = "") =>
    request(`/api/army-library?${query}${extra}`, null, cookie);
  const detail = async (id, cookie = player.cookie, extra = "") =>
    request(
      `/api/army-library?patchId=${encodeURIComponent(patchId)}&targetKind=list&targetId=${encodeURIComponent(id)}${extra}`,
      null,
      cookie,
    );
  const mutate = (body, cookie = player.cookie) =>
    request("/api/state", body, cookie);
  const saved = await mutate({ type: "saveArmy", patchId, army: inputArmy });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  let list = saved.data.savedArmies.find(
    (army) => army.army.listName === inputArmy.listName,
  );
  assert.ok(list.currentVersionId);
  const originalVersion = list.currentVersionId;
  const privateAdmin = await mutate(
    {
      type: "saveArmy",
      patchId,
      army: { ...inputArmy, listName: "HTTP LIBRARY ADMIN PRIVATE" },
    },
    admin.cookie,
  );
  assert.equal(privateAdmin.status, 200);
  const adminList = privateAdmin.data.savedArmies.find(
    (army) =>
      army.userId === privateAdmin.data.me.id &&
      army.army.listName === "HTTP LIBRARY ADMIN PRIVATE",
  );
  check(
    "library requires sign-in and private detail guesses remain unavailable even to admins",
    () => {},
  );
  assert.equal((await request("/api/army-library")).status, 401);
  assert.equal((await detail(list.id)).status, 404);
  assert.equal((await detail(adminList.id, admin.cookie)).status, 404);
  assert.equal(
    (
      await request(
        `/api/army-library?action=ownVersions&listId=${adminList.id}`,
        null,
        player.cookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/army-library?pageSize=500", null, player.cookie))
      .status,
    400,
  );
  assert.equal(
    (await request("/api/army-library?targetKind=list", null, player.cookie))
      .status,
    400,
  );

  const shared = await mutate({ type: "shareArmy", id: list.id, shared: true });
  assert.equal(shared.status, 200);
  const publicMember = await library();
  const publicAdmin = await library(admin.cookie);
  check(
    "library admin/member public data matches and excludes private collections",
    () => {
      assert.equal(publicMember.status, 200);
      assert.deepEqual(publicAdmin.data, publicMember.data);
      assert.equal(publicMember.data.library.total, 1);
      for (const secret of [
        "ADMIN PRIVATE",
        '"evaluations"',
        '"audit"',
        '"games"',
        '"password"',
      ])
        assert.ok(!JSON.stringify(publicMember.data).includes(secret));
    },
  );
  const noOp = await mutate({
    type: "saveArmy",
    id: list.id,
    patchId,
    army: { ...inputArmy, listName: "HTTP LIBRARY renamed alias" },
    expectedRevision: list.listRevision,
  });
  assert.equal(noOp.status, 200);
  list = noOp.data.savedArmies.find((army) => army.id === list.id);
  assert.equal(list.currentVersionId, originalVersion);
  const versions = await request(
    `/api/army-library?action=ownVersions&listId=${list.id}`,
    null,
    player.cookie,
  );
  check("alias/no-op saves do not create immutable roster versions", () =>
    assert.equal(versions.data.versions.length, 1),
  );

  const logged = await mutate({
    type: "game",
    date: "2026-09-12",
    opponent: "HTTP PRIVATE OPPONENT",
    own: list.army,
    enemy: source.enemy,
    ownListVersionId: list.currentVersionId,
    patchId,
    layout: "A",
    score: 16,
    context: "Practice",
    notes: "HTTP PRIVATE REFLECTION",
    eventId: "",
  });
  assert.equal(logged.status, 200, JSON.stringify(logged.data));
  const game = logged.data.games.find(
    (game) => game.notes === "HTTP PRIVATE REFLECTION",
  );
  assert.equal(
    (await detail(list.id)).data.library.detail.metrics.recordedMatches,
    0,
  );
  assert.equal(
    (
      await mutate(
        { type: "libraryGameContribution", id: game.id, contribution: true },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate({
        type: "libraryGameContribution",
        id: game.id,
        contribution: true,
      })
    ).status,
    200,
  );
  const contributed = await detail(list.id, admin.cookie);
  check(
    "shared roster statistics require owner consent and omit private identity/reflections",
    () => {
      assert.equal(contributed.data.library.detail.metrics.averageScore, 16);
      assert.equal(contributed.data.library.detail.metrics.recordedMatches, 1);
      assert.ok(!JSON.stringify(contributed.data).includes("HTTP PRIVATE"));
    },
  );
  assert.equal(
    (
      await mutate({
        type: "libraryGameContribution",
        id: game.id,
        contribution: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await detail(list.id)).data.library.detail.metrics.recordedMatches,
    0,
  );
  check("withdrawn contribution immediately removes public metrics", () => {});

  const target = { kind: "list", id: list.id };
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussion",
        target,
        context: { patchId, versionId: originalVersion },
        text: "HTTP public thread",
      })
    ).status,
    200,
  );
  let discussion = (await detail(list.id)).data.library.detail.discussions.find(
    (row) => row.text === "HTTP public thread",
  );
  assert.ok(discussion);
  assert.equal(
    (
      await mutate(
        {
          type: "libraryDiscussionEdit",
          id: discussion.id,
          text: "Admin rewrite forbidden",
        },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussionEdit",
        id: discussion.id,
        text: "HTTP author edited",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate(
        {
          type: "libraryDiscussion",
          target,
          parentId: discussion.id,
          text: "HTTP thread reply",
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await detail(list.id)).data.library.detail.discussions.length,
    2,
  );
  check(
    "library threads support author edits and replies while admin moderation does not rewrite authors",
    () => {},
  );

  const oldRevision = list.listRevision;
  const edit = await mutate({
    type: "saveArmy",
    id: list.id,
    patchId,
    army: { ...list.army, scope: { battleSize: "fixture-new-size" } },
    expectedRevision: oldRevision,
  });
  assert.equal(edit.status, 200);
  list = edit.data.savedArmies.find((army) => army.id === list.id);
  assert.notEqual(list.currentVersionId, originalVersion);
  assert.equal(
    (
      await mutate({
        type: "saveArmy",
        id: list.id,
        patchId,
        army: inputArmy,
        expectedRevision: oldRevision,
      })
    ).status,
    400,
  );
  assert.equal(
    (await mutate({ type: "shareArmy", id: list.id, shared: false })).status,
    200,
  );
  assert.equal((await detail(list.id)).status, 404);
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussionEdit",
        id: discussion.id,
        text: "Withdrawn context",
      })
    ).status,
    400,
  );
  assert.equal(
    (await mutate({ type: "shareArmy", id: list.id, shared: true })).status,
    200,
  );
  const reshared = await detail(list.id);
  check(
    "stale edits reject, withdrawal hides discussions/history, and re-sharing exposes only current version",
    () => {
      assert.equal(reshared.data.library.detail.versions.length, 1);
      assert.equal(reshared.data.library.detail.discussions.length, 0);
    },
  );
  assert.equal(
    (
      await detail(
        list.id,
        admin.cookie,
        `&versionId=${encodeURIComponent(originalVersion)}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussion",
        target,
        context: { versionId: originalVersion },
        text: "Hidden historic context",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussion",
        target,
        context: { versionId: adminList.currentVersionId },
        text: "Guessed private context",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate({
        type: "libraryDiscussion",
        target,
        text: "HTTP moderated",
      })
    ).status,
    200,
  );
  discussion = (await detail(list.id)).data.library.detail.discussions.find(
    (row) => row.text === "HTTP moderated",
  );
  assert.equal(
    (
      await mutate(
        { type: "libraryDiscussionDelete", id: discussion.id },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.ok(
    !(await detail(list.id)).data.library.detail.discussions.some(
      (row) => row.text === "HTTP moderated",
    ),
  );
  check(
    "discussion context guesses fail and authorized admin deletion removes text",
    () => {},
  );

  assert.equal(
    (
      await request(
        "/api/army-library?action=consolidationPreview",
        null,
        player.cookie,
      )
    ).status,
    400,
  );
  const preview = await request(
    "/api/army-library?action=consolidationPreview",
    null,
    admin.cookie,
  );
  assert.equal(preview.status, 200);
  assert.ok(!JSON.stringify(preview.data).includes(adminList.id));
  assert.equal(
    (await mutate({ type: "shareArmy", id: list.id, shared: false })).status,
    200,
  );
  const stale = await mutate(
    {
      type: "libraryConsolidationApply",
      sourceRevision: preview.data.preview.sourceRevision,
    },
    admin.cookie,
  );
  assert.equal(stale.status, 400);
  assert.match(stale.data.error, /stale/);
  assert.equal(
    (await mutate({ type: "shareArmy", id: list.id, shared: true })).status,
    200,
  );
  const fresh = await request(
    "/api/army-library?action=consolidationPreview",
    null,
    admin.cookie,
  );
  assert.equal(
    (
      await mutate(
        {
          type: "libraryConsolidationApply",
          sourceRevision: fresh.data.preview.sourceRevision,
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  check(
    "consolidation preview excludes private counts, requires admin and rejects stale publication state",
    () => {},
  );

  const access = await request(
    "/api/admin/view-as",
    { userId: playerState.me.id, role: "actual" },
    admin.cookie,
  );
  assert.equal(access.status, 200);
  const previewCookie = `${admin.cookie}; ${access.cookie}`;
  assert.deepEqual((await library(previewCookie)).data, (await library()).data);
  assert.equal(
    (
      await request(
        `/api/army-library?action=ownVersions&listId=${adminList.id}`,
        null,
        previewCookie,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/api/army-library?action=ownVersions&listId=${list.id}`,
        null,
        previewCookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate(
        { type: "libraryDiscussion", target, text: "Preview forbidden" },
        previewCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await mutate(
        {
          type: "libraryConsolidationApply",
          sourceRevision: fresh.data.preview.sourceRevision,
        },
        previewCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/army-library?action=consolidationPreview",
        null,
        previewCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/admin/view-as", null, previewCookie, "DELETE")).status,
    200,
  );
  check(
    "access preview uses effective viewer ownership and blocks every library write",
    () => {},
  );

  assert.equal((await mutate({ type: "deleteGame", id: game.id })).status, 200);
  assert.equal((await mutate({ type: "deleteArmy", id: list.id })).status, 200);
  assert.equal(
    (await mutate({ type: "deleteArmy", id: adminList.id }, admin.cookie))
      .status,
    200,
  );

  const metadataPatch = playerState.patches.find((patch) => patch.catalogue);
  assert.ok(
    metadataPatch,
    "An isolated imported/snapshotted ruleset is required.",
  );
  const ids = [];
  for (const imported of [false, true]) {
    const army = {
      ...inputArmy,
      listName: `HTTP SCOPE ${imported ? "import" : "legacy"}`,
    };
    delete army.scope;
    delete army.composition;
    if (imported)
      army.scope = { systemId: String(metadataPatch.catalogue.systemId) };
    const result = await mutate({
      type: "saveArmy",
      patchId: metadataPatch.id,
      army,
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const created = result.data.savedArmies.find(
      (row) => row.army.listName === army.listName,
    );
    ids.push(created.id);
    assert.equal(
      (await mutate({ type: "shareArmy", id: created.id, shared: true }))
        .status,
      200,
    );
  }
  const grouped = await request(
    `/api/army-library?patchId=${encodeURIComponent(metadataPatch.id)}&search=HTTP%20SCOPE`,
    null,
    player.cookie,
  );
  const archetypes = await request(
    `/api/army-library?tab=archetypes&patchId=${encodeURIComponent(metadataPatch.id)}&search=HTTP%20SCOPE`,
    null,
    player.cookie,
  );
  check(
    "matching imported system metadata consolidates with legacy configurations under the same saved ruleset",
    () => {
      assert.equal(grouped.status, 200);
      assert.equal(grouped.data.library.lists.length, 2);
      assert.equal(
        grouped.data.library.lists[0].archetypeId,
        grouped.data.library.lists[1].archetypeId,
      );
      assert.equal(archetypes.status, 200);
      assert.equal(archetypes.data.library.archetypes.length, 1);
      assert.equal(archetypes.data.library.archetypes[0].publicLists, 2);
      assert.equal(archetypes.data.library.archetypes[0].variations, 0);
    },
  );
  for (const id of ids)
    assert.equal((await mutate({ type: "deleteArmy", id })).status, 200);

  const normArmy = {
    ...inputArmy,
    listName: "HTTP archetype default",
    composition: {
      status: "complete",
      normalizationVersion: "newrecruit-selected-v1",
      reasons: [],
      source: {
        provider: "newrecruit",
        systemId: String(metadataPatch.catalogue.systemId),
        catalogueId: inputArmy.faction,
      },
      selections: [
        {
          sourceId: `newrecruit:${metadataPatch.catalogue.systemId}:${inputArmy.faction}:http-unit`,
          name: "HTTP unit",
          kind: "unit",
          quantity: 2,
          selections: [],
        },
      ],
    },
  };
  const createdNorm = await mutate({
    type: "saveArmy",
    patchId: metadataPatch.id,
    army: normArmy,
  });
  assert.equal(createdNorm.status, 200, JSON.stringify(createdNorm.data));
  const normList = createdNorm.data.savedArmies.find(
    (row) => row.army.listName === normArmy.listName,
  );
  assert.equal(
    (await mutate({ type: "shareArmy", id: normList.id, shared: true })).status,
    200,
  );
  const getNormDetail = async () =>
    request(
      `/api/army-library?patchId=${encodeURIComponent(metadataPatch.id)}&targetKind=list&targetId=${encodeURIComponent(normList.id)}`,
      null,
      player.cookie,
    );
  const normResponse = await getNormDetail();
  assert.equal(normResponse.status, 200, JSON.stringify(normResponse.data));
  const normDetail = normResponse.data.library.detail;
  const mark = {
    type: "libraryArchetypeDefault",
    archetypeId: normDetail.archetypeId,
    patchId: metadataPatch.id,
    versionId: normList.currentVersionId,
    expectedRevision: 0,
  };
  assert.equal((await mutate(mark)).status, 400);
  const markResult = await mutate(mark, admin.cookie);
  assert.equal(markResult.status, 200, JSON.stringify(markResult.data));
  assert.equal((await mutate(mark, admin.cookie)).status, 400);
  const marked = (await getNormDetail()).data.library.detail;
  assert.equal(marked.norm.standard.selection, "marked");
  assert.equal(marked.norm.standard.versionId, normList.currentVersionId);
  assert.equal(marked.norm.status, "same");
  check(
    "archetype defaults require administrators, pin public immutable versions, and reject stale writes",
    () => {},
  );
  assert.equal(
    (
      await mutate(
        { ...mark, versionId: undefined, expectedRevision: 1 },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await mutate({ type: "deleteArmy", id: normList.id })).status,
    200,
  );
  assert.equal((await request("/api/army-library/import", {})).status, 401);
  assert.equal(
    (await request("/api/army-library/import", {}, player.cookie)).status,
    403,
  );
  const imported = await request("/api/army-library/import", {}, admin.cookie);
  assert.equal(imported.status, 200, JSON.stringify(imported.data));
  assert.ok(imported.data.report);
  check(
    "stored roster imports are administrator-only and use an authorized atomic maintenance route",
    () => {},
  );
}
