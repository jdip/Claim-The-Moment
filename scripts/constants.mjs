export const MODULE_ID = "claim-the-moment";
export const STATE_SETTING = "spotlightState";
export const COUNTDOWN_SETTING = "countdownSeconds";
export const SOUND_ENABLED_SETTING = "soundEnabled";
export const SOUND_PATH_SETTING = "alertSoundPath";
export const PLAYER_CLAIM_SOUND_ENABLED_SETTING = "playerClaimSoundEnabled";
export const PLAYER_CLAIM_SOUND_PATH_SETTING = "playerClaimSoundPath";
export const AUTO_SELECT_SOUND_ENABLED_SETTING = "autoSelectSoundEnabled";
export const AUTO_SELECT_SOUND_PATH_SETTING = "autoSelectSoundPath";
export const SOUND_VOLUME_SETTING = "soundVolume";
export const SHOW_WELCOME_SETTING = "showWelcomeOnLogin";
export const GM_TAKE_SOUND_ENABLED_SETTING = "gmTakeSoundEnabled";
export const GM_TAKE_SOUND_PATH_SETTING = "gmTakeSoundPath";
export const GM_ICON_SETTING = "gmIconPath";
export const TOKEN_CONTROLS_ICON = "fa-solid fa-user-large";
export const SPOTLIGHT_CONTROL_ICON = "fa-solid fa-person-rays";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const DEFAULT_ALERT_SOUND_PATH = `modules/${MODULE_ID}/sounds/spotlight-alert.flac`;
export const DEFAULT_PLAYER_CLAIM_SOUND_PATH = `modules/${MODULE_ID}/sounds/player-claim-horn.mp3`;
export const DEFAULT_AUTO_SELECT_SOUND_PATH = `modules/${MODULE_ID}/sounds/automatic-selection.mp3`;
export const DEFAULT_GM_TAKE_SOUND_PATH = `modules/${MODULE_ID}/sounds/gm-take-horn.mp3`;
export const DEFAULT_GM_ICON_PATH = `modules/${MODULE_ID}/assets/gm-skull.png`;

export const SOUND_CUES = Object.freeze({
  throw: Object.freeze({
    enabledSetting: SOUND_ENABLED_SETTING,
    enabledName: "CTM.Settings.SoundEnabled.Name",
    enabledHint: "CTM.Settings.SoundEnabled.Hint",
    pathSetting: SOUND_PATH_SETTING,
    pathName: "CTM.Settings.SoundPath.Name",
    pathHint: "CTM.Settings.SoundPath.Hint",
    defaultPath: DEFAULT_ALERT_SOUND_PATH,
    description: "spotlight throw"
  }),
  player: Object.freeze({
    enabledSetting: PLAYER_CLAIM_SOUND_ENABLED_SETTING,
    enabledName: "CTM.Settings.PlayerClaimSoundEnabled.Name",
    enabledHint: "CTM.Settings.PlayerClaimSoundEnabled.Hint",
    pathSetting: PLAYER_CLAIM_SOUND_PATH_SETTING,
    pathName: "CTM.Settings.PlayerClaimSoundPath.Name",
    pathHint: "CTM.Settings.PlayerClaimSoundPath.Hint",
    defaultPath: DEFAULT_PLAYER_CLAIM_SOUND_PATH,
    description: "player spotlight"
  }),
  automatic: Object.freeze({
    enabledSetting: AUTO_SELECT_SOUND_ENABLED_SETTING,
    enabledName: "CTM.Settings.AutoSelectSoundEnabled.Name",
    enabledHint: "CTM.Settings.AutoSelectSoundEnabled.Hint",
    pathSetting: AUTO_SELECT_SOUND_PATH_SETTING,
    pathName: "CTM.Settings.AutoSelectSoundPath.Name",
    pathHint: "CTM.Settings.AutoSelectSoundPath.Hint",
    defaultPath: DEFAULT_AUTO_SELECT_SOUND_PATH,
    description: "automatic spotlight selection"
  }),
  gm: Object.freeze({
    enabledSetting: GM_TAKE_SOUND_ENABLED_SETTING,
    enabledName: "CTM.Settings.GMTakeSoundEnabled.Name",
    enabledHint: "CTM.Settings.GMTakeSoundEnabled.Hint",
    pathSetting: GM_TAKE_SOUND_PATH_SETTING,
    pathName: "CTM.Settings.GMTakeSoundPath.Name",
    pathHint: "CTM.Settings.GMTakeSoundPath.Hint",
    defaultPath: DEFAULT_GM_TAKE_SOUND_PATH,
    description: "GM spotlight take"
  })
});

export const ROUND_STATUS = Object.freeze({
  IDLE: "idle",
  OPEN: "open",
  AWARDED: "awarded",
  CANCELLED: "cancelled"
});

export const AWARD_REASON = Object.freeze({
  CLAIM: "claim",
  AUTOMATIC: "automatic",
  HANDOFF: "handoff",
  GM: "gm"
});

export const REQUEST = Object.freeze({
  START: "start",
  TAKE: "take",
  CLAIM: "claim",
  HAND_SPOTLIGHT: "handSpotlight",
  SET_ELIGIBLE: "setEligible",
  SET_COUNT: "setCount",
  RESET_COUNTS: "resetCounts",
  RESULT: "requestResult",
  PLAY_SOUND: "playSound",
  GM_PRESENCE: "gmPresence"
});

export const GM_PRESENCE_INTERVAL_MS = 2_000;
export const GM_PRESENCE_TIMEOUT_MS = 7_000;
export const GM_AUTHORITY_SETTLE_MS = 300;
export const REQUEST_RETRY_MS = 500;
export const REQUEST_TIMEOUT_MS = 12_000;
export const RECENT_REQUEST_LIMIT = 100;
