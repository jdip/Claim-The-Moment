import {
  MODULE_ID,
  RECENT_REQUEST_LIMIT,
  REQUEST,
  SOCKET_NAME,
  SOUND_CUES,
  SOUND_VOLUME_SETTING
} from "./constants.mjs";
import { PreferenceWriter } from "./preference-writer.mjs";

export class SpotlightAudio {
  constructor(clientId) {
    this.clientId = clientId;
    this.recentSoundIds = new Map();
    this.volumeWriter = new PreferenceWriter("the personal sound volume");
  }

  get volumePercent() {
    const configured = Number(game.settings.get(MODULE_ID, SOUND_VOLUME_SETTING));
    if (!Number.isFinite(configured)) return 80;
    return Math.max(0, Math.min(100, Math.round(configured)));
  }

  get volume() {
    return this.volumePercent / 100;
  }

  cueEnabled(cueKey) {
    const cue = SOUND_CUES[cueKey];
    return Boolean(cue && game.settings.get(MODULE_ID, cue.enabledSetting) === true);
  }

  cuePath(cueKey) {
    const cue = SOUND_CUES[cueKey];
    if (!cue) return null;
    const configured = game.settings.get(MODULE_ID, cue.pathSetting);
    return typeof configured === "string" && configured.trim()
      ? configured.trim()
      : cue.defaultPath;
  }

  async setVolume(value) {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed)
      ? Math.max(0, Math.min(100, Math.round(parsed)))
      : 80;
    return this.volumeWriter.write(SOUND_VOLUME_SETTING, normalized);
  }

  playCue(cueKey, { soundId = foundry.utils.randomID(), broadcast = true } = {}) {
    const cue = SOUND_CUES[cueKey];
    if (!cue || !this.cueEnabled(cueKey) || this._hasPlayed(soundId)) return false;

    this._remember(soundId);
    this._playLocally(this.cuePath(cueKey), cue.description);
    if (broadcast) {
      game.socket.emit(SOCKET_NAME, {
        command: REQUEST.PLAY_SOUND,
        soundId,
        senderId: game.user.id,
        senderClientId: this.clientId,
        cueKey
      });
    }
    return true;
  }

  receive(message) {
    const sender = game.users.get(message?.senderId);
    if (!sender?.active || !sender.isGM) return false;
    if (message.senderClientId === this.clientId) return false;
    if (typeof message.soundId !== "string" || !message.soundId || this._hasPlayed(message.soundId)) {
      return false;
    }
    if (!Object.hasOwn(SOUND_CUES, message.cueKey) || !this.cueEnabled(message.cueKey)) return false;

    this._remember(message.soundId);
    const cue = SOUND_CUES[message.cueKey];
    return this._playLocally(this.cuePath(message.cueKey), cue.description);
  }

  preload() {
    if (this.volume <= 0) return;
    for (const [cueKey, cue] of Object.entries(SOUND_CUES)) {
      if (!this.cueEnabled(cueKey)) continue;
      foundry.audio.AudioHelper.preloadSound(this.cuePath(cueKey)).catch((error) => {
        console.warn(`${MODULE_ID} | Could not preload the ${cue.description} sound`, error);
      });
    }
  }

  _playLocally(src, description) {
    if (!src || this.volume <= 0) return false;
    try {
      const playback = foundry.audio.AudioHelper.play({
        src,
        volume: this.volume,
        loop: false,
        autoplay: true,
        channel: "interface"
      }, false);
      playback?.catch?.((error) => {
        console.warn(`${MODULE_ID} | Could not play the ${description} sound`, error);
      });
      return true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not play the ${description} sound`, error);
      return false;
    }
  }

  _hasPlayed(soundId) {
    return this.recentSoundIds.has(soundId);
  }

  _remember(soundId) {
    this.recentSoundIds.set(soundId, Date.now());
    while (this.recentSoundIds.size > RECENT_REQUEST_LIMIT) {
      this.recentSoundIds.delete(this.recentSoundIds.keys().next().value);
    }
  }
}
