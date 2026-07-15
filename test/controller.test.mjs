import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_SELECT_SOUND_ENABLED_SETTING,
  AUTO_SELECT_SOUND_PATH_SETTING,
  AWARD_REASON,
  COUNTDOWN_SETTING,
  DEFAULT_ALERT_SOUND_PATH,
  DEFAULT_AUTO_SELECT_SOUND_PATH,
  DEFAULT_GM_TAKE_SOUND_PATH,
  DEFAULT_GM_ICON_PATH,
  DEFAULT_PLAYER_CLAIM_SOUND_PATH,
  GM_ICON_SETTING,
  GM_TAKE_SOUND_ENABLED_SETTING,
  GM_TAKE_SOUND_PATH_SETTING,
  MODULE_ID,
  MUTE_SOUNDS_SETTING,
  PLAYER_CLAIM_SOUND_ENABLED_SETTING,
  PLAYER_CLAIM_SOUND_PATH_SETTING,
  REQUEST,
  ROUND_STATUS,
  SOUND_ENABLED_SETTING,
  SOUND_PATH_SETTING,
  SOUND_VOLUME_SETTING,
  SOCKET_NAME,
  STATE_SETTING
} from "../scripts/constants.mjs";
import {
  awardSpotlight,
  createInitialState,
  setPlayerCount,
  setPlayerEligibility,
  startRound
} from "../scripts/state.mjs";

class StubApplicationV2 {
  constructor(options = {}) {
    this.options = options;
    this.rendered = false;
    this.lastRenderOptions = null;
  }

  render(options = {}) {
    this.rendered = true;
    this.lastRenderOptions = options;
  }

  async _prepareContext() {
    return {};
  }

  _attachPartListeners() {}
  async _onRender() {}
  _onClose() {}
}

globalThis.foundry = {
  audio: {
    AudioHelper: {
      play() {},
      preloadSound: async () => {}
    }
  },
  applications: {
    api: {
      ApplicationV2: StubApplicationV2,
      DialogV2: { confirm: async () => true },
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  },
  utils: {
    randomID: () => "round-from-test"
  }
};

globalThis.ui = {
  notifications: {
    info() {},
    warn() {},
    error() {}
  }
};

const { SpotlightApp } = await import("../scripts/spotlight-app.mjs");
const { SpotlightController } = await import("../scripts/spotlight-controller.mjs");

function createHarness(initialState = createInitialState(), {
  deferSettingCache = false,
  deferSettingWrite = false,
  soundEnabled = true,
  soundPath = DEFAULT_ALERT_SOUND_PATH,
  playerClaimSoundEnabled = true,
  playerClaimSoundPath = DEFAULT_PLAYER_CLAIM_SOUND_PATH,
  autoSelectSoundEnabled = true,
  autoSelectSoundPath = DEFAULT_AUTO_SELECT_SOUND_PATH,
  gmTakeSoundEnabled = true,
  gmTakeSoundPath = DEFAULT_GM_TAKE_SOUND_PATH,
  gmIconPath = DEFAULT_GM_ICON_PATH,
  soundsMuted = false,
  soundVolume = 80
} = {}) {
  const createUser = (data) => ({
    ...data,
    flags: {},
    getFlag(namespace, key) {
      return this.flags[namespace]?.[key];
    },
    async setFlag(namespace, key, value) {
      this.flags[namespace] ??= {};
      this.flags[namespace][key] = value;
      return this;
    }
  });
  const gm = createUser({ id: "gm", name: "GM", active: true, isGM: true, role: 4 });
  const ada = createUser({ id: "ada", name: "Ada", active: true, isGM: false, role: 1 });
  const bea = createUser({ id: "bea", name: "Bea", active: true, isGM: false, role: 1 });
  const users = [gm, ada, bea];
  users.get = (id) => users.find((user) => user.id === id);

  let cachedState = initialState;
  let savedState = initialState;
  let savedSoundsMuted = soundsMuted;
  let savedSoundVolume = soundVolume;
  let serverTime = 1_000;
  const emitted = [];
  const playedSounds = [];
  let releaseSettingWrite;
  const settingWriteGate = new Promise((resolve) => {
    releaseSettingWrite = resolve;
  });

  globalThis.foundry.audio.AudioHelper.play = (data, socketOptions) => {
    playedSounds.push({ data, socketOptions });
  };

  globalThis.game = {
    user: gm,
    users,
    i18n: {
      lang: "en",
      localize: (key) => key,
      format: (key, data) => `${key}:${data.name}`
    },
    settings: {
      get: (namespace, key) => {
        assert.equal(namespace, MODULE_ID);
        if (key === STATE_SETTING) return cachedState;
        if (key === COUNTDOWN_SETTING) return 10;
        if (key === SOUND_ENABLED_SETTING) return soundEnabled;
        if (key === SOUND_PATH_SETTING) return soundPath;
        if (key === PLAYER_CLAIM_SOUND_ENABLED_SETTING) return playerClaimSoundEnabled;
        if (key === PLAYER_CLAIM_SOUND_PATH_SETTING) return playerClaimSoundPath;
        if (key === AUTO_SELECT_SOUND_ENABLED_SETTING) return autoSelectSoundEnabled;
        if (key === AUTO_SELECT_SOUND_PATH_SETTING) return autoSelectSoundPath;
        if (key === GM_TAKE_SOUND_ENABLED_SETTING) return gmTakeSoundEnabled;
        if (key === GM_TAKE_SOUND_PATH_SETTING) return gmTakeSoundPath;
        if (key === GM_ICON_SETTING) return gmIconPath;
        if (key === MUTE_SOUNDS_SETTING) return savedSoundsMuted;
        if (key === SOUND_VOLUME_SETTING) return savedSoundVolume;
        throw new Error(`Unknown setting ${key}`);
      },
      set: async (namespace, key, value) => {
        assert.equal(namespace, MODULE_ID);
        if (key === MUTE_SOUNDS_SETTING) {
          savedSoundsMuted = value === true;
          return savedSoundsMuted;
        }
        if (key === SOUND_VOLUME_SETTING) {
          savedSoundVolume = value;
          return savedSoundVolume;
        }
        assert.equal(key, STATE_SETTING);
        if (deferSettingWrite) await settingWriteGate;
        savedState = value;
        if (!deferSettingCache) cachedState = value;
        return value;
      }
    },
    socket: {
      emit: (name, message) => emitted.push({ name, message }),
      on() {}
    },
    time: {
      get serverTime() {
        return serverTime;
      }
    }
  };

  return {
    gm,
    ada,
    bea,
    emitted,
    playedSounds,
    get state() {
      return savedState;
    },
    get soundsMuted() {
      return savedSoundsMuted;
    },
    get soundVolume() {
      return savedSoundVolume;
    },
    set serverTime(value) {
      serverTime = value;
    },
    releaseSettingWrite
  };
}

test("serialized claim requests award only the first player", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });

  const roundId = harness.state.round.id;
  const first = controller._enqueue(() => controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId
  }));
  const second = controller._enqueue(() => controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.bea.id,
    roundId
  }));

  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(harness.state.round.status, ROUND_STATUS.AWARDED);
  assert.equal(harness.state.round.winnerId, harness.ada.id);
  assert.equal(harness.state.counts.ada, 1);
  assert.equal(harness.state.counts.bea ?? 0, 0);
  assert.equal(harness.playedSounds.length, 2);
  assert.equal(harness.playedSounds.at(-1).data.src, DEFAULT_PLAYER_CLAIM_SOUND_PATH);
});

test("an excluded player cannot claim", async () => {
  let state = setPlayerEligibility(createInitialState(), "ada", false);
  state = startRound(state, { roundId: "excluded-test", startedAt: 1_000, durationMs: 10_000 });
  const harness = createHarness(state);
  const controller = new SpotlightController();

  const result = await controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: "excluded-test"
  });

  assert.equal(result, false);
  assert.equal(harness.state.round.status, ROUND_STATUS.OPEN);
});

test("legacy User flags cannot override the authoritative world state", async () => {
  const harness = createHarness();
  harness.ada.flags[MODULE_ID] = { eligible: false };
  const controller = new SpotlightController();
  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });

  const result = await controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: harness.state.round.id
  });

  assert.equal(result, true);
  assert.equal(harness.state.round.status, ROUND_STATUS.AWARDED);
});

test("an expired round goes to the eligible online player with the lowest count", async () => {
  let state = setPlayerCount(createInitialState(), "ada", 4);
  state = setPlayerCount(state, "bea", 1);
  state = startRound(state, { roundId: "fallback-test", startedAt: 1_000, durationMs: 3_000 });
  const harness = createHarness(state);
  harness.serverTime = 4_001;
  const controller = new SpotlightController();

  const result = await controller._resolveExpiredRound();

  assert.equal(result, true);
  assert.equal(harness.state.round.winnerId, harness.bea.id);
  assert.equal(harness.state.counts.bea, 2);
  assert.equal(harness.playedSounds[0].data.src, DEFAULT_AUTO_SELECT_SOUND_PATH);
});

test("the immediately prior player is excluded from the next automatic fallback", async () => {
  let state = setPlayerCount(createInitialState(), "bea", 7);
  state = startRound(state, { roundId: "prior-round", startedAt: -10_000, durationMs: 3_000 });
  state = awardSpotlight(state, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: "claim",
    awardedAt: -9_000
  });
  const harness = createHarness(state);
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.START,
    senderId: harness.gm.id
  }), true);
  assert.equal(harness.state.round.fallbackExcludedUserId, harness.ada.id);

  harness.serverTime = 11_001;
  assert.equal(await controller._resolveExpiredRound(), true);
  assert.equal(harness.state.round.winnerId, harness.bea.id);
});

test("the immediately prior player may still claim manually", async () => {
  let state = startRound(createInitialState(), {
    roundId: "prior-round",
    startedAt: -10_000,
    durationMs: 3_000
  });
  state = awardSpotlight(state, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: "automatic",
    awardedAt: -9_000
  });
  const harness = createHarness(state);
  const controller = new SpotlightController();

  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });
  assert.equal(await controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: harness.state.round.id
  }), true);
  assert.equal(harness.state.round.winnerId, harness.ada.id);
});

test("an exclusion is preserved when a round starts before the setting cache catches up", async () => {
  const harness = createHarness(createInitialState(), { deferSettingCache: true });
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.SET_ELIGIBLE,
    senderId: harness.gm.id,
    userId: harness.ada.id,
    included: false
  }), true);
  assert.equal(await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id }), true);

  assert.equal(harness.state.round.status, ROUND_STATUS.OPEN);
  assert.equal(harness.state.eligible.ada, false);
  assert.equal(harness.ada.getFlag(MODULE_ID, "eligible"), undefined);
  assert.equal(harness.playedSounds.length, 1);
  assert.equal(harness.playedSounds[0].data.src, DEFAULT_ALERT_SOUND_PATH);
  assert.equal(harness.playedSounds[0].socketOptions, false);
  assert.equal(harness.emitted.length, 1);
  assert.equal(harness.emitted[0].name, SOCKET_NAME);
  assert.equal(harness.emitted[0].message.command, REQUEST.PLAY_SOUND);
});

test("the registered ApplicationV2 toggle action persists the unchecked state", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  const target = {
    checked: false,
    disabled: false,
    isConnected: true,
    dataset: { eligibleUser: harness.ada.id }
  };

  const toggleAction = SpotlightApp.DEFAULT_OPTIONS.actions.toggleEligibility;
  await toggleAction.call(controller.app, {}, target);

  assert.equal(harness.state.eligible.ada, false);
  assert.equal(target.disabled, true, "the setting update rerenders the row instead of reusing the clicked input");
});

test("a legacy mute preference migrates to zero module volume", async () => {
  const harness = createHarness(createInitialState(), { soundsMuted: true, soundVolume: 80 });
  const controller = new SpotlightController();

  assert.equal(await controller._migrateLegacyMute(), true);

  assert.equal(harness.soundsMuted, false);
  assert.equal(harness.soundVolume, 0);
  assert.equal(controller.soundVolume, 0);
});

test("the streamlined sound widget persists a personal module volume", async () => {
  const harness = createHarness(createInitialState(), { soundVolume: 65 });
  const controller = new SpotlightController();
  const target = {
    value: "37.6",
    dataset: { soundVolume: "" }
  };

  assert.equal((await controller.app._prepareContext({})).soundVolumePercent, 65);

  const formHandler = SpotlightApp.DEFAULT_OPTIONS.form.handler;
  const updated = await formHandler.call(controller.app, { target }, {}, {});

  assert.equal(updated, true);
  assert.equal(harness.soundVolume, 38);
  assert.equal(controller.soundVolumePercent, 38);
  assert.equal(controller.soundVolume, 0.38);
  assert.equal(target.value, "38");
});

test("the registered ApplicationV2 form handler persists a manual claim-count edit", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  controller.app.rendered = true;
  const target = {
    value: "7.8",
    disabled: false,
    isConnected: true,
    dataset: { countUser: harness.ada.id }
  };

  const formHandler = SpotlightApp.DEFAULT_OPTIONS.form.handler;
  const updated = await formHandler.call(controller.app, { target }, {}, {});

  assert.equal(updated, true);
  assert.equal(harness.state.counts.ada, 7);
  assert.equal(target.value, "7");
  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("a world Setting change immediately updates a player client's authoritative view", () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  controller._state = createInitialState();
  controller.app.rendered = true;
  game.user = harness.ada;

  controller.onStateChanged(setPlayerEligibility(createInitialState(), harness.ada.id, false));

  assert.equal(controller.state.eligible.ada, false);
  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("every client resorts the roster from lowest to highest when claim counts change", async () => {
  let state = setPlayerCount(createInitialState(), "ada", 4);
  state = setPlayerCount(state, "bea", 1);
  const harness = createHarness(state);
  const controller = new SpotlightController();
  controller._state = state;
  controller.app.rendered = true;
  game.user = harness.ada;

  let context = await controller.app._prepareContext({});
  assert.deepEqual(context.players.map((player) => player.id), ["bea", "ada"]);

  controller.onStateChanged(setPlayerCount(state, "ada", 0));
  context = await controller.app._prepareContext({});

  assert.deepEqual(context.players.map((player) => player.id), ["ada", "bea"]);
  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("a non-authority GM waits for the world Setting instead of rendering stale state", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  controller._state = createInitialState();
  controller.app.rendered = true;
  controller._recordGMClient(harness.gm.id, "000-authority-client");

  assert.equal(await controller.requestEligibility(harness.ada.id, false), true);
  assert.equal(controller.state.eligible.ada, undefined, "the request does not invent an optimistic second authority");
  assert.equal(harness.emitted.at(-1).message.command, REQUEST.SET_ELIGIBLE);

  controller.onStateChanged(setPlayerEligibility(createInitialState(), harness.ada.id, false));
  assert.equal(controller.state.eligible.ada, false);
  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("an excluded player does not auto-open when the GM throws the spotlight", () => {
  const harness = createHarness();
  game.user = harness.ada;
  const controller = new SpotlightController();
  controller._state = setPlayerEligibility(createInitialState(), harness.ada.id, false);

  const open = startRound(controller.state, {
    roundId: "excluded-auto-open",
    startedAt: 1000,
    durationMs: 10_000
  });
  controller.onStateChanged(open);

  assert.equal(controller.app.rendered, false);
});

test("an eligible player still auto-opens when the GM throws the spotlight", () => {
  const harness = createHarness();
  game.user = harness.bea;
  const controller = new SpotlightController();
  controller._state = createInitialState();

  const open = startRound(createInitialState(), {
    roundId: "eligible-auto-open",
    startedAt: 1000,
    durationMs: 10_000
  });
  controller.onStateChanged(open);

  assert.equal(controller.app.rendered, true);
  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("eligibility is read only from the world state after reopening", () => {
  const harness = createHarness();
  harness.ada.flags[MODULE_ID] = { eligible: false };
  const controller = new SpotlightController();

  assert.equal(controller.isUserEligible(harness.ada, createInitialState()), true);
  assert.equal(controller.isUserEligible(
    harness.ada,
    setPlayerEligibility(createInitialState(), harness.ada.id, false)
  ), false);
});

test("a user document update force-refreshes an open player window", () => {
  createHarness();
  const controller = new SpotlightController();
  controller.app.rendered = true;

  controller.onUserUpdated();

  assert.deepEqual(controller.app.lastRenderOptions, { force: true });
});

test("the GM can take the spotlight during an open countdown without adding a player claim", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });

  const result = await controller._processRequest({ command: REQUEST.TAKE, senderId: harness.gm.id });

  assert.equal(result, true);
  assert.equal(harness.state.round.status, ROUND_STATUS.AWARDED);
  assert.equal(harness.state.round.reason, "gm");
  assert.equal(harness.state.round.winnerId, harness.gm.id);
  assert.deepEqual(harness.state.counts, {});
  assert.equal(harness.playedSounds.at(-1).data.src, DEFAULT_GM_TAKE_SOUND_PATH);
});

test("the GM can hand the spotlight directly to an eligible player", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });

  const result = await controller._processRequest({
    command: REQUEST.HAND_SPOTLIGHT,
    senderId: harness.gm.id,
    userId: harness.ada.id
  });

  assert.equal(result, true);
  assert.equal(harness.state.round.status, ROUND_STATUS.AWARDED);
  assert.equal(harness.state.round.reason, AWARD_REASON.HANDOFF);
  assert.equal(harness.state.round.winnerId, harness.ada.id);
  assert.equal(harness.state.counts.ada, 1);
  assert.equal(harness.playedSounds.at(-1).data.src, DEFAULT_PLAYER_CLAIM_SOUND_PATH);
});

test("direct spotlight handoff requires an eligible online player and a GM sender", async () => {
  const excludedState = setPlayerEligibility(createInitialState(), "ada", false);
  const harness = createHarness(excludedState);
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.HAND_SPOTLIGHT,
    senderId: harness.gm.id,
    userId: harness.ada.id
  }), false);

  assert.equal(await controller._processRequest({
    command: REQUEST.HAND_SPOTLIGHT,
    senderId: harness.bea.id,
    userId: harness.bea.id
  }), false);
  assert.equal(harness.state.round.status, ROUND_STATUS.IDLE);
  assert.deepEqual(harness.state.counts, {});
});

test("the registered GM handoff action routes the selected player id", async () => {
  const harness = createHarness();
  const controller = new SpotlightController();
  const target = {
    dataset: { playerId: harness.ada.id },
    disabled: false,
    isConnected: true,
    setAttribute() {},
    removeAttribute() {}
  };

  const handoffAction = SpotlightApp.DEFAULT_OPTIONS.actions.handSpotlight;
  await handoffAction.call(controller.app, {}, target);

  assert.equal(harness.state.round.reason, AWARD_REASON.HANDOFF);
  assert.equal(harness.state.round.winnerId, harness.ada.id);
  assert.equal(target.disabled, true);
});

test("assigned character identity uses the character name and prototype-token art", () => {
  const harness = createHarness();
  harness.ada.character = {
    name: "Nyx",
    img: "portraits/nyx.webp",
    prototypeToken: { texture: { src: "tokens/nyx.webp" } }
  };
  const controller = new SpotlightController();

  assert.deepEqual(controller.getPlayerPresentation(harness.ada), {
    name: "Nyx",
    image: "tokens/nyx.webp",
    initial: "N"
  });
});

test("the winner display uses a player's current assigned token", () => {
  const harness = createHarness();
  harness.ada.character = {
    name: "Nyx",
    img: "portraits/nyx.webp",
    prototypeToken: { texture: { src: "tokens/nyx.webp" } }
  };
  const controller = new SpotlightController();

  assert.deepEqual(controller.getWinnerPresentation({
    winnerId: harness.ada.id,
    winnerName: "Nyx",
    reason: "claim"
  }), {
    name: "Nyx",
    image: "tokens/nyx.webp",
    initial: "N",
    isGM: false
  });
});

test("the GM winner display uses the configured GM icon", () => {
  createHarness(createInitialState(), { gmIconPath: "worlds/test/custom-gm.webp" });
  const controller = new SpotlightController();

  assert.deepEqual(controller.getWinnerPresentation({
    winnerId: "gm",
    winnerName: "Game Master",
    reason: "gm"
  }), {
    name: "Game Master",
    image: "worlds/test/custom-gm.webp",
    initial: "GM",
    isGM: true
  });
});

test("the GM can disable the throw alert", async () => {
  const harness = createHarness(createInitialState(), { soundEnabled: false });
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.START,
    senderId: harness.gm.id
  }), true);
  assert.equal(harness.playedSounds.length, 0);
  assert.equal(harness.emitted.length, 0);
});

test("the throw alert uses the configured audio file", async () => {
  const harness = createHarness(createInitialState(), {
    soundPath: "worlds/test/custom-braam.ogg"
  });
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.START,
    senderId: harness.gm.id
  }), true);
  assert.equal(harness.playedSounds[0].data.src, "worlds/test/custom-braam.ogg");
});

test("the GM can disable the player claim horn", async () => {
  const harness = createHarness(createInitialState(), { playerClaimSoundEnabled: false });
  const controller = new SpotlightController();

  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });
  await controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: harness.state.round.id
  });

  assert.equal(harness.playedSounds.length, 1);
  assert.equal(harness.playedSounds[0].data.src, DEFAULT_ALERT_SOUND_PATH);
});

test("the player claim horn uses the configured audio file", async () => {
  const harness = createHarness(createInitialState(), {
    playerClaimSoundPath: "worlds/test/custom-heroic-horn.ogg"
  });
  const controller = new SpotlightController();

  await controller._processRequest({ command: REQUEST.START, senderId: harness.gm.id });
  await controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: harness.state.round.id
  });

  assert.equal(harness.playedSounds.at(-1).data.src, "worlds/test/custom-heroic-horn.ogg");
});

test("the player claim horn starts before the world Setting write finishes", async () => {
  const harness = createHarness(createInitialState(), { deferSettingWrite: true });
  const controller = new SpotlightController();
  controller._state = startRound(createInitialState(), {
    roundId: "immediate-audio",
    startedAt: 1_000,
    durationMs: 10_000
  });

  let settled = false;
  const claim = controller._processRequest({
    command: REQUEST.CLAIM,
    senderId: harness.ada.id,
    roundId: "immediate-audio"
  }).finally(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(harness.playedSounds.at(-1).data.src, DEFAULT_PLAYER_CLAIM_SOUND_PATH);

  harness.releaseSettingWrite();
  assert.equal(await claim, true);
});

test("a zero-volume GM still broadcasts configured cues without hearing them locally", async () => {
  const harness = createHarness(createInitialState(), { soundVolume: 0 });
  const controller = new SpotlightController();

  assert.equal(await controller._processRequest({
    command: REQUEST.START,
    senderId: harness.gm.id
  }), true);

  assert.equal(harness.playedSounds.length, 0);
  assert.equal(harness.emitted.length, 1);
  assert.equal(harness.emitted[0].message.command, REQUEST.PLAY_SOUND);
  assert.equal(harness.emitted[0].message.src, DEFAULT_ALERT_SOUND_PATH);
});

test("a zero-volume player suppresses received Claim the Moment cues", () => {
  const harness = createHarness(createInitialState(), { soundVolume: 0 });
  game.user = harness.ada;
  const controller = new SpotlightController();

  controller.receiveSocket({
    command: REQUEST.PLAY_SOUND,
    soundId: "muted-received-sound",
    senderId: harness.gm.id,
    senderClientId: "remote-gm-client",
    src: DEFAULT_PLAYER_CLAIM_SOUND_PATH,
    description: "player spotlight claim"
  });

  assert.equal(harness.playedSounds.length, 0);
});

test("a positive-volume player plays a received Claim the Moment cue locally only", () => {
  const harness = createHarness(createInitialState(), { soundVolume: 35 });
  game.user = harness.ada;
  const controller = new SpotlightController();

  controller.receiveSocket({
    command: REQUEST.PLAY_SOUND,
    soundId: "unmuted-received-sound",
    senderId: harness.gm.id,
    senderClientId: "remote-gm-client",
    src: DEFAULT_PLAYER_CLAIM_SOUND_PATH,
    description: "player spotlight claim"
  });

  assert.equal(harness.playedSounds.length, 1);
  assert.equal(harness.playedSounds[0].data.src, DEFAULT_PLAYER_CLAIM_SOUND_PATH);
  assert.equal(harness.playedSounds[0].data.volume, 0.35);
  assert.equal(harness.playedSounds[0].socketOptions, false);
});

test("the GM can disable the automatic selection cue", async () => {
  const state = startRound(createInitialState(), {
    roundId: "automatic-sound-disabled",
    startedAt: 1_000,
    durationMs: 3_000
  });
  const harness = createHarness(state, { autoSelectSoundEnabled: false });
  harness.serverTime = 4_001;
  const controller = new SpotlightController();

  assert.equal(await controller._resolveExpiredRound(), true);
  assert.equal(harness.playedSounds.length, 0);
});

test("the automatic selection cue uses the configured audio file", async () => {
  const state = startRound(createInitialState(), {
    roundId: "automatic-custom-sound",
    startedAt: 1_000,
    durationMs: 3_000
  });
  const harness = createHarness(state, {
    autoSelectSoundPath: "worlds/test/custom-automatic-selection.ogg"
  });
  harness.serverTime = 4_001;
  const controller = new SpotlightController();

  assert.equal(await controller._resolveExpiredRound(), true);
  assert.equal(harness.playedSounds[0].data.src, "worlds/test/custom-automatic-selection.ogg");
});

test("the automatic selection cue starts before the world Setting write finishes", async () => {
  const state = startRound(createInitialState(), {
    roundId: "automatic-immediate-audio",
    startedAt: 1_000,
    durationMs: 3_000
  });
  const harness = createHarness(state, { deferSettingWrite: true });
  harness.serverTime = 4_001;
  const controller = new SpotlightController();

  let settled = false;
  const resolving = controller._resolveExpiredRound().finally(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(harness.playedSounds[0].data.src, DEFAULT_AUTO_SELECT_SOUND_PATH);

  harness.releaseSettingWrite();
  assert.equal(await resolving, true);
});

test("the GM can disable the GM danger horn", async () => {
  const harness = createHarness(createInitialState(), { gmTakeSoundEnabled: false });
  const controller = new SpotlightController();

  await controller._processRequest({ command: REQUEST.TAKE, senderId: harness.gm.id });
  assert.equal(harness.playedSounds.length, 0);
});

test("the GM danger horn uses the configured audio file", async () => {
  const harness = createHarness(createInitialState(), {
    gmTakeSoundPath: "worlds/test/custom-danger-horn.ogg"
  });
  const controller = new SpotlightController();

  await controller._processRequest({ command: REQUEST.TAKE, senderId: harness.gm.id });
  assert.equal(harness.playedSounds[0].data.src, "worlds/test/custom-danger-horn.ogg");
});
