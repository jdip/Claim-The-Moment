export const MODULE_ID = "claim-the-moment";
export const STATE_SETTING = "spotlightState";
export const COUNTDOWN_SETTING = "countdownSeconds";
export const SOUND_ENABLED_SETTING = "soundEnabled";
export const SOUND_PATH_SETTING = "alertSoundPath";
export const PLAYER_CLAIM_SOUND_ENABLED_SETTING = "playerClaimSoundEnabled";
export const PLAYER_CLAIM_SOUND_PATH_SETTING = "playerClaimSoundPath";
export const AUTO_SELECT_SOUND_ENABLED_SETTING = "autoSelectSoundEnabled";
export const AUTO_SELECT_SOUND_PATH_SETTING = "autoSelectSoundPath";
export const MUTE_SOUNDS_SETTING = "muteSounds";
export const GM_TAKE_SOUND_ENABLED_SETTING = "gmTakeSoundEnabled";
export const GM_TAKE_SOUND_PATH_SETTING = "gmTakeSoundPath";
export const GM_ICON_SETTING = "gmIconPath";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const DEFAULT_ALERT_SOUND_PATH = `modules/${MODULE_ID}/sounds/spotlight-alert.flac`;
export const DEFAULT_PLAYER_CLAIM_SOUND_PATH = `modules/${MODULE_ID}/sounds/player-claim-horn.mp3`;
export const DEFAULT_AUTO_SELECT_SOUND_PATH = `modules/${MODULE_ID}/sounds/automatic-selection.mp3`;
export const DEFAULT_GM_TAKE_SOUND_PATH = `modules/${MODULE_ID}/sounds/gm-take-horn.mp3`;
export const DEFAULT_GM_ICON_PATH = `modules/${MODULE_ID}/assets/gm-skull.png`;

export const ROUND_STATUS = Object.freeze({
  IDLE: "idle",
  OPEN: "open",
  AWARDED: "awarded",
  CANCELLED: "cancelled"
});

export const AWARD_REASON = Object.freeze({
  CLAIM: "claim",
  AUTOMATIC: "automatic",
  GM: "gm"
});

export const REQUEST = Object.freeze({
  START: "start",
  TAKE: "take",
  CLAIM: "claim",
  SET_ELIGIBLE: "setEligible",
  SET_COUNT: "setCount",
  RESET_COUNTS: "resetCounts",
  PLAY_SOUND: "playSound",
  GM_PRESENCE: "gmPresence"
});

export const GM_PRESENCE_INTERVAL_MS = 2_000;
export const GM_PRESENCE_TIMEOUT_MS = 7_000;
