import assert from "node:assert/strict";
import test from "node:test";

import { GMAuthority } from "../scripts/gm-authority.mjs";
import { PreferenceWriter } from "../scripts/preference-writer.mjs";
import { SpotlightProtocol } from "../scripts/spotlight-protocol.mjs";
import { SpotlightStateStore } from "../scripts/spotlight-state-store.mjs";
import { MODULE_ID, REQUEST, SOCKET_NAME, STATE_SETTING } from "../scripts/constants.mjs";
import { createInitialState, setPlayerCount } from "../scripts/state.mjs";

function usersFixture(current = "player") {
  const gm = { id: "gm", name: "GM", active: true, isGM: true, role: 4 };
  const player = { id: "player", name: "Player", active: true, isGM: false, role: 1 };
  const users = [gm, player];
  users.get = (id) => users.find((user) => user.id === id);
  return { gm, player, users, current: users.get(current) };
}

function installGame(current = "player") {
  const fixture = usersFixture(current);
  const emitted = [];
  globalThis.game = {
    user: fixture.current,
    users: fixture.users,
    socket: {
      emit: (name, message) => emitted.push({ name, message })
    },
    settings: {
      get() {},
      async set() {}
    },
    i18n: { localize: (key) => key }
  };
  globalThis.foundry = {
    utils: {
      randomID: (() => {
        let sequence = 0;
        return () => `request-${++sequence}`;
      })()
    }
  };
  globalThis.ui = { notifications: { error() {} } };
  return { ...fixture, emitted };
}

test("remote requests resolve only after an active GM acknowledgement", async () => {
  const { gm, player, emitted } = installGame("player");
  const authority = { hasActiveGM: true, isAuthorityClient: false };
  const protocol = new SpotlightProtocol({
    clientId: "player-client",
    authority,
    isAuthority: () => false,
    processRequest: async () => true,
    retryMs: 1_000,
    timeoutMs: 2_000
  });

  const pending = protocol.request(REQUEST.CLAIM, { roundId: "round" });
  const request = emitted[0].message;
  assert.equal(emitted[0].name, SOCKET_NAME);
  assert.equal(request.senderId, player.id);

  assert.equal(protocol.receive({
    command: REQUEST.RESULT,
    requestId: request.requestId,
    recipientId: player.id,
    recipientClientId: "player-client",
    responderId: player.id,
    responderClientId: "forged-player-client",
    ok: true
  }), false, "a non-GM response is ignored");

  assert.equal(protocol.receive({
    command: REQUEST.RESULT,
    requestId: request.requestId,
    recipientId: player.id,
    recipientClientId: "player-client",
    responderId: gm.id,
    responderClientId: "gm-client",
    ok: true
  }), true);
  assert.equal(await pending, true);
  protocol.dispose();
});

test("an acknowledged rejection resolves false instead of reporting optimistic success", async () => {
  const { gm, player, emitted } = installGame("player");
  const protocol = new SpotlightProtocol({
    clientId: "player-client",
    authority: { hasActiveGM: true },
    isAuthority: () => false,
    processRequest: async () => true,
    retryMs: 1_000,
    timeoutMs: 2_000
  });

  const pending = protocol.request(REQUEST.CLAIM, { roundId: "round" });
  const request = emitted[0].message;
  protocol.receive({
    command: REQUEST.RESULT,
    requestId: request.requestId,
    recipientId: player.id,
    recipientClientId: "player-client",
    responderId: gm.id,
    responderClientId: "gm-client",
    ok: false,
    errorCode: "rejected"
  });

  assert.equal(await pending, false);
  protocol.dispose();
});

test("unacknowledged requests retry and fail closed at their deadline", async () => {
  const { emitted } = installGame("player");
  const failures = [];
  const protocol = new SpotlightProtocol({
    clientId: "player-client",
    authority: { hasActiveGM: true },
    isAuthority: () => false,
    processRequest: async () => true,
    onFailure: (code) => failures.push(code),
    retryMs: 5,
    timeoutMs: 20
  });

  assert.equal(await protocol.request(REQUEST.CLAIM, { roundId: "round" }), false);
  assert.ok(emitted.length >= 2, "the request was retried before timing out");
  assert.deepEqual(failures, ["timeout"]);
  protocol.dispose();
});

test("the authority deduplicates repeated request ids", async () => {
  const { player, emitted } = installGame("gm");
  let processed = 0;
  const protocol = new SpotlightProtocol({
    clientId: "gm-client",
    authority: { hasActiveGM: true },
    isAuthority: () => true,
    processRequest: async () => {
      processed += 1;
      await Promise.resolve();
      return true;
    }
  });
  const request = {
    command: REQUEST.CLAIM,
    requestId: "same-request",
    senderId: player.id,
    senderClientId: "player-client"
  };

  assert.equal(protocol.receive(request), true);
  assert.equal(protocol.receive(request), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(processed, 1);
  assert.equal(emitted.filter((entry) => entry.message.command === REQUEST.RESULT).length, 2);
  protocol.dispose();
});

test("GM authority elects one deterministic client across duplicate GM tabs", () => {
  const { gm } = installGame("gm");
  const authority = new GMAuthority("z-client");
  authority.record(gm.id, "z-client");
  authority.record(gm.id, "a-client");
  authority.refresh();
  authority.candidateSince -= 1_000;

  assert.equal(authority.authorityClientId, "a-client");
  assert.equal(authority.isAuthorityClient, false);
  authority.dispose();
});

test("two GM clients on a shared socket converge on exactly one authority", () => {
  installGame("gm");
  const first = new GMAuthority("a-client");
  const second = new GMAuthority("b-client");
  const peers = [first, second];
  game.socket.emit = (_name, message) => {
    for (const peer of peers) peer.receive(message);
  };

  first.start();
  second.start();
  first.candidateSince -= 1_000;
  second.candidateSince -= 1_000;
  first.refresh();
  second.refresh();

  assert.equal(first.authorityClientId, "a-client");
  assert.equal(second.authorityClientId, "a-client");
  assert.deepEqual([first.isAuthorityClient, second.isAuthorityClient], [true, false]);
  first.dispose();
  second.dispose();
});

test("a failed preference write does not poison later writes or close flushing", async () => {
  installGame("player");
  const saved = [];
  let attempts = 0;
  game.settings.set = async (namespace, setting, value) => {
    assert.equal(namespace, MODULE_ID);
    attempts += 1;
    if (attempts === 1) throw new Error("first write failed");
    saved.push({ setting, value });
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const writer = new PreferenceWriter("test preference");
    const first = writer.write("preference", 1);
    const second = writer.write("preference", 2);
    assert.deepEqual(await Promise.all([first, second]), [false, true]);
    await writer.flush();
    assert.deepEqual(saved, [{ setting: "preference", value: 2 }]);
  } finally {
    console.error = originalError;
  }
});

test("a rejected world-state write restores the persisted snapshot", async () => {
  installGame("gm");
  const initial = createInitialState();
  game.settings.get = (namespace, setting) => {
    assert.equal(namespace, MODULE_ID);
    assert.equal(setting, STATE_SETTING);
    return initial;
  };
  game.settings.set = async () => {
    throw new Error("database unavailable");
  };
  const store = new SpotlightStateStore({
    isAuthority: () => true,
    onChanged: () => assert.fail("persisted state did not change")
  });
  store.initialize();

  await assert.rejects(
    store.save(setPlayerCount(initial, "player", 1), { expectedRevision: initial.revision }),
    /database unavailable/
  );
  assert.deepEqual(store.state, initial);
});
