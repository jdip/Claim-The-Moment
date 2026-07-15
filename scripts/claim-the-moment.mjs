import {
  AUTO_SELECT_SOUND_ENABLED_SETTING,
  AUTO_SELECT_SOUND_PATH_SETTING,
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
  SOUND_ENABLED_SETTING,
  SOUND_PATH_SETTING,
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

  game.settings.register(MODULE_ID, SOUND_ENABLED_SETTING, {
    name: "CTM.Settings.SoundEnabled.Name",
    hint: "CTM.Settings.SoundEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, SOUND_PATH_SETTING, {
    name: "CTM.Settings.SoundPath.Name",
    hint: "CTM.Settings.SoundPath.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
    default: DEFAULT_ALERT_SOUND_PATH,
    input: filePickerInput("audio"),
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, PLAYER_CLAIM_SOUND_ENABLED_SETTING, {
    name: "CTM.Settings.PlayerClaimSoundEnabled.Name",
    hint: "CTM.Settings.PlayerClaimSoundEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, PLAYER_CLAIM_SOUND_PATH_SETTING, {
    name: "CTM.Settings.PlayerClaimSoundPath.Name",
    hint: "CTM.Settings.PlayerClaimSoundPath.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
    default: DEFAULT_PLAYER_CLAIM_SOUND_PATH,
    input: filePickerInput("audio"),
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, AUTO_SELECT_SOUND_ENABLED_SETTING, {
    name: "CTM.Settings.AutoSelectSoundEnabled.Name",
    hint: "CTM.Settings.AutoSelectSoundEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, AUTO_SELECT_SOUND_PATH_SETTING, {
    name: "CTM.Settings.AutoSelectSoundPath.Name",
    hint: "CTM.Settings.AutoSelectSoundPath.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
    default: DEFAULT_AUTO_SELECT_SOUND_PATH,
    input: filePickerInput("audio"),
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, GM_TAKE_SOUND_ENABLED_SETTING, {
    name: "CTM.Settings.GMTakeSoundEnabled.Name",
    hint: "CTM.Settings.GMTakeSoundEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => controller?.onMediaSettingsChanged()
  });

  game.settings.register(MODULE_ID, GM_TAKE_SOUND_PATH_SETTING, {
    name: "CTM.Settings.GMTakeSoundPath.Name",
    hint: "CTM.Settings.GMTakeSoundPath.Hint",
    scope: "world",
    config: true,
    type: new foundry.data.fields.StringField({ nullable: false, blank: true }),
    default: DEFAULT_GM_TAKE_SOUND_PATH,
    input: filePickerInput("audio"),
    onChange: () => controller?.onMediaSettingsChanged()
  });

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

  game.settings.register(MODULE_ID, MUTE_SOUNDS_SETTING, {
    name: "CTM.Settings.MuteSounds.Name",
    hint: "CTM.Settings.MuteSounds.Hint",
    scope: "user",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => controller?.onSoundMuteChanged()
  });
});

Hooks.once("setup", () => {
  controller = new SpotlightController();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: () => controller.openWindow(),
      throwSpotlight: () => controller.requestStart(),
      takeSpotlight: () => controller.requestTake(),
      getState: () => controller.state
    };
  }
});

Hooks.once("ready", () => {
  controller.initialize();
  console.info(`${MODULE_ID} | Ready for Foundry ${game.version} and ${game.system.id} ${game.system.version}`);
});

Hooks.on("getSceneControlButtons", (controls) => {
  if (!controller) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;

  const nextOrder = Math.max(-1, ...Object.values(tokenControls.tools).map((tool) => tool.order ?? 0)) + 1;
  tokenControls.tools.claimTheMoment = {
    name: "claimTheMoment",
    title: "CTM.Controls.Open",
    icon: "fa-solid fa-wand-sparkles",
    order: nextOrder,
    button: true,
    visible: true,
    onChange: () => controller.openWindow()
  };
});

Hooks.on("userConnected", () => controller?.onUserConnectionChanged());
Hooks.on("updateUser", (user, changes) => controller?.onUserUpdated(user, changes));
