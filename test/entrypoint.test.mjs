import assert from "node:assert/strict";
import test from "node:test";

import {
  MODULE_ID,
  SHOW_WELCOME_SETTING,
  SOUND_CUES,
  SPOTLIGHT_CONTROL_ICON,
  STATE_SETTING
} from "../scripts/constants.mjs";

class StubApplicationV2 {
  constructor() {
    this.rendered = false;
  }

  render() {
    this.rendered = true;
    return this;
  }
}

const onceHooks = new Map();
const recurringHooks = new Map();
globalThis.Hooks = {
  once: (name, handler) => onceHooks.set(name, handler),
  on: (name, handler) => recurringHooks.set(name, handler)
};

const registeredSettings = new Map();
const registeredKeybindings = new Map();
const moduleRecord = {};
const users = [];
users.get = (id) => users.find((user) => user.id === id);

globalThis.game = {
  user: { id: "gm", name: "GM", active: true, isGM: true, role: 4 },
  users,
  settings: {
    register: (namespace, key, config) => registeredSettings.set(`${namespace}.${key}`, config),
    get: () => undefined
  },
  keybindings: {
    register: (namespace, key, config) => registeredKeybindings.set(`${namespace}.${key}`, config)
  },
  modules: { get: () => moduleRecord },
  i18n: { lang: "en", localize: (key) => key, format: (key) => key }
};

globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: StubApplicationV2,
      DialogV2: { confirm: async () => false },
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    },
    elements: {
      HTMLFilePickerElement: { create: (config) => config }
    }
  },
  audio: {
    AudioHelper: {
      play() {},
      preloadSound: async () => {}
    }
  },
  data: {
    fields: {
      StringField: class StringField {
        constructor(options) {
          this.options = options;
        }
      }
    }
  },
  utils: { randomID: () => "entrypoint-client" }
};

globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

await import("../scripts/claim-the-moment.mjs");

test("entrypoint registers complete settings, keybindings, API, controls, and lifecycle hooks", () => {
  assert.ok(onceHooks.has("init"));
  assert.ok(onceHooks.has("setup"));
  assert.ok(onceHooks.has("ready"));

  onceHooks.get("init")();
  assert.ok(registeredSettings.has(`${MODULE_ID}.${STATE_SETTING}`));
  assert.ok(registeredSettings.has(`${MODULE_ID}.${SHOW_WELCOME_SETTING}`));
  for (const cue of Object.values(SOUND_CUES)) {
    assert.ok(registeredSettings.has(`${MODULE_ID}.${cue.enabledSetting}`));
    assert.ok(registeredSettings.has(`${MODULE_ID}.${cue.pathSetting}`));
  }
  assert.equal(registeredKeybindings.size, 2);
  assert.equal(registeredKeybindings.get(`${MODULE_ID}.openWindow`).editable[0].key, "KeyM");
  assert.equal(registeredKeybindings.get(`${MODULE_ID}.claimSpotlight`).editable[0].key, "KeyC");

  onceHooks.get("setup")();
  assert.deepEqual(Object.keys(moduleRecord.api).sort(), [
    "credits",
    "getState",
    "handSpotlight",
    "help",
    "open",
    "takeSpotlight",
    "throwSpotlight"
  ]);
  assert.equal(moduleRecord.api.open(), undefined);
  assert.equal(registeredKeybindings.get(`${MODULE_ID}.openWindow`).onDown(), true);

  const controls = { tokens: { tools: { select: { order: 0 } } } };
  recurringHooks.get("getSceneControlButtons")(controls);
  assert.equal(controls.tokens.tools.claimTheMoment.icon, SPOTLIGHT_CONTROL_ICON);
  assert.equal(controls.tokens.tools.claimTheMoment.visible, true);

  assert.ok(recurringHooks.has("userConnected"));
  assert.ok(recurringHooks.has("updateUser"));
  assert.ok(recurringHooks.has("deleteUser"));
});
