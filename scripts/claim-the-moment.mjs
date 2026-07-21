import {
  COUNTDOWN_SETTING,
  DEFAULT_GM_ICON_PATH,
  GM_ICON_SETTING,
  MODULE_ID,
  ROUND_STATUS,
  SHOW_WELCOME_SETTING,
  SOUND_CUES,
  SOUND_VOLUME_SETTING,
  SPOTLIGHT_CONTROL_ICON,
  STATE_SETTING
} from "./constants.mjs";
import { createInitialState } from "./state.mjs";
import { SpotlightController } from "./spotlight-controller.mjs";

let controller = null;

function filePickerInput(type) {
  return (_field, config) => {
    const { input: _input, ...pickerConfig } = config;
    return foundry.applications.elements.HTMLFilePickerElement.create({
      ...pickerConfig,
      type
    });
  };
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, STATE_SETTING, {
    name: "CTM.Settings.State.Name",
    hint: "CTM.Settings.State.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: createInitialState(),
    onChange: (state) => controller?.onStateChanged(state)
  });

  game.settings.register(MODULE_ID, COUNTDOWN_SETTING, {
    name: "CTM.Settings.Countdown.Name",
    hint: "CTM.Settings.Countdown.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
    range: {
      min: 3,
      max: 60,
      step: 1
    }
  });

  for (const cue of Object.values(SOUND_CUES)) {
    game.settings.register(MODULE_ID, cue.enabledSetting, {
      name: cue.enabledName,
      hint: cue.enabledHint,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => controller?.onMediaSettingsChanged()
    });

    game.settings.register(MODULE_ID, cue.pathSetting, {
      name: cue.pathName,
      hint: cue.pathHint,
      scope: "world",
      config: true,
      type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
      default: cue.defaultPath,
      input: filePickerInput("audio"),
      onChange: () => controller?.onMediaSettingsChanged()
    });
  }

  game.settings.register(MODULE_ID, GM_ICON_SETTING, {
    name: "CTM.Settings.GMIcon.Name",
    hint: "CTM.Settings.GMIcon.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
    default: DEFAULT_GM_ICON_PATH,
    input: filePickerInput("image"),
    onChange: () => controller?.onAppearanceSettingsChanged()
  });

  game.settings.register(MODULE_ID, SOUND_VOLUME_SETTING, {
    name: "CTM.Settings.SoundVolume.Name",
    hint: "CTM.Settings.SoundVolume.Hint",
    scope: "user",
    config: false,
    type: Number,
    default: 80,
    range: {
      min: 0,
      max: 100,
      step: 5
    },
    onChange: () => controller?.onSoundVolumeChanged()
  });

  game.settings.register(MODULE_ID, SHOW_WELCOME_SETTING, {
    name: "CTM.Settings.ShowWelcome.Name",
    hint: "CTM.Settings.ShowWelcome.Hint",
    scope: "user",
    config: true,
    type: Boolean,
    default: true
  });

  game.keybindings.register(MODULE_ID, "openWindow", {
    name: "CTM.Keybindings.Open.Name",
    hint: "CTM.Keybindings.Open.Hint",
    editable: [{ key: "KeyM", modifiers: ["Shift"] }],
    onDown: () => {
      if (!controller) return false;
      controller.openWindow();
      return true;
    },
    restricted: false
  });

  game.keybindings.register(MODULE_ID, "claimSpotlight", {
    name: "CTM.Keybindings.Claim.Name",
    hint: "CTM.Keybindings.Claim.Hint",
    editable: [{ key: "KeyC", modifiers: ["Shift"] }],
    onDown: () => {
      if (!controller || game.user.isGM) return false;
      const state = controller.state;
      if (state.round.status !== ROUND_STATUS.OPEN) return false;
      if (!controller.isUserEligible(game.user, state)) return false;
      void controller.requestClaim(state.round.id);
      return true;
    },
    restricted: false
  });
});

Hooks.once("setup", () => {
  controller = new SpotlightController();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: () => controller.openWindow(),
      help: () => controller.openHelp(),
      credits: () => controller.openCredits(),
      throwSpotlight: () => controller.requestStart(),
      takeSpotlight: () => controller.requestTake(),
      handSpotlight: (userId) => controller.requestHandSpotlight(userId),
      getState: () => controller.state
    };
  }
});

Hooks.once("ready", async () => {
  try {
    await controller.initialize();
    await controller.showWelcomeIfNeeded();
    console.info(`${MODULE_ID} | Ready for Foundry ${game.version} and ${game.system.id} ${game.system.version}`);
  } catch (error) {
    console.error(`${MODULE_ID} | Initialization failed`, error);
    ui.notifications.error(game.i18n.localize("CTM.Notifications.InitializationFailed"));
  }
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controller) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;

  const nextOrder = Math.max(-1, ...Object.values(tokenControls.tools).map((tool) => tool.order ?? 0)) + 1;
  tokenControls.tools.claimTheMoment = {
    name: "claimTheMoment",
    title: "CTM.Controls.Open",
    icon: SPOTLIGHT_CONTROL_ICON,
    order: nextOrder,
    button: true,
    visible: true,
    onChange: () => controller.openWindow()
  };
});

Hooks.on("userConnected", () => controller?.onUserConnectionChanged());
Hooks.on("updateUser", (user, changes) => controller?.onUserUpdated(user, changes));
Hooks.on("deleteUser", () => controller?.onUserDeleted());
