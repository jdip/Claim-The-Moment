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
  GM_PRESENCE_INTERVAL_MS,
  GM_PRESENCE_TIMEOUT_MS,
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
  SOCKET_NAME,
  STATE_SETTING
} from "./constants.mjs";
import {
  awardSpotlight,
  cancelRound,
  chooseFallbackWinner,
  isPlayerEligible,
  normalizeState,
  resetPlayerCounts,
  setPlayerCount,
  setPlayerEligibility,
  startRound,
  takeSpotlight
} from "./state.mjs";
import { SpotlightApp } from "./spotlight-app.mjs";

function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SpotlightController {
  constructor() {
    this.app = new SpotlightApp(this);
    this._state = null;
    this._deadlineTimer = null;
    this._presenceTimer = null;
    this._operationQueue = Promise.resolve();
    this._clientId = foundry.utils.randomID();
    this._gmClients = new Map();
    this._authorityClientId = null;
    this.receiveSocket = this.receiveSocket.bind(this);
  }

  /**
   * The world setting is the only persisted state. This local snapshot is only
   * a rendering cache and is replaced by the setting's onChange callback.
   */
  get state() {
    if (!this._state) {
      this._state = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
    }
    return normalizeState(this._state);
  }

  get onlinePlayers() {
    return game.users
      .filter((user) => user.active && !user.isGM)
      .sort((left, right) => this.getPlayerPresentation(left).name.localeCompare(
        this.getPlayerPresentation(right).name,
        game.i18n.lang
      ));
  }

  get primaryGM() {
    const activeGMs = game.users
      .filter((user) => user.active && user.isGM)
      .sort((left, right) => (right.role - left.role) || left.id.localeCompare(right.id));
    return activeGMs[0] ?? null;
  }

  get isPrimaryGM() {
    if (!game.user.isGM) return false;
    this._refreshAuthority();
    return this._authorityClientId === this._clientId;
  }

  get alertSoundEnabled() {
    return game.settings.get(MODULE_ID, SOUND_ENABLED_SETTING) === true;
  }

  get alertSoundPath() {
    return this._configuredPath(SOUND_PATH_SETTING, DEFAULT_ALERT_SOUND_PATH);
  }

  get playerClaimSoundEnabled() {
    return game.settings.get(MODULE_ID, PLAYER_CLAIM_SOUND_ENABLED_SETTING) === true;
  }

  get playerClaimSoundPath() {
    return this._configuredPath(PLAYER_CLAIM_SOUND_PATH_SETTING, DEFAULT_PLAYER_CLAIM_SOUND_PATH);
  }

  get autoSelectSoundEnabled() {
    return game.settings.get(MODULE_ID, AUTO_SELECT_SOUND_ENABLED_SETTING) === true;
  }

  get autoSelectSoundPath() {
    return this._configuredPath(AUTO_SELECT_SOUND_PATH_SETTING, DEFAULT_AUTO_SELECT_SOUND_PATH);
  }

  get gmTakeSoundEnabled() {
    return game.settings.get(MODULE_ID, GM_TAKE_SOUND_ENABLED_SETTING) === true;
  }

  get gmTakeSoundPath() {
    return this._configuredPath(GM_TAKE_SOUND_PATH_SETTING, DEFAULT_GM_TAKE_SOUND_PATH);
  }

  get soundsMuted() {
    return game.settings.get(MODULE_ID, MUTE_SOUNDS_SETTING) === true;
  }

  get gmIconPath() {
    const configured = game.settings.get(MODULE_ID, GM_ICON_SETTING);
    return typeof configured === "string" && configured.trim()
      ? configured.trim()
      : DEFAULT_GM_ICON_PATH;
  }

  initialize() {
    this._state = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
    game.socket.on(SOCKET_NAME, this.receiveSocket);
    this._startGMPresence();
    this._scheduleDeadline(this._state);
    this._preloadSounds();

    if (this._state.round.status === ROUND_STATUS.OPEN && this._shouldAutoOpen(this._state)) {
      this.openWindow();
    }
  }

  openWindow() {
    this.app.render({ force: true });
  }

  receiveSocket(message) {
    if (!message || typeof message !== "object") return;

    if (message.command === REQUEST.PLAY_SOUND) {
      this._receiveSound(message);
      return;
    }

    if (message.command === REQUEST.GM_PRESENCE) {
      this._receiveGMPresence(message);
      return;
    }

    if (!this.isPrimaryGM) return;
    this._enqueue(() => this._processRequest(message));
  }

  requestStart() {
    return this._request(REQUEST.START);
  }

  requestTake() {
    return this._request(REQUEST.TAKE);
  }

  requestClaim(roundId) {
    return this._request(REQUEST.CLAIM, { roundId });
  }

  requestEligibility(userId, included) {
    return this._request(REQUEST.SET_ELIGIBLE, { userId, included });
  }

  requestCount(userId, count) {
    return this._request(REQUEST.SET_COUNT, { userId, count });
  }

  requestResetCounts() {
    return this._request(REQUEST.RESET_COUNTS);
  }

  async setSoundsMuted(muted) {
    try {
      await game.settings.set(MODULE_ID, MUTE_SOUNDS_SETTING, muted === true);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update the personal sound preference`, error);
      ui.notifications.error(game.i18n.localize("CTM.Notifications.OperationFailed"));
      return false;
    }
  }

  /**
   * Called by the registered world setting onChange handler on every client.
   * Equal-revision but different snapshots are accepted so the server's final
   * write still wins if two GM connections ever race during leader turnover.
   */
  onStateChanged(rawState) {
    const next = normalizeState(rawState);
    const previous = this._state;
    if (previous && next.revision < previous.revision) return false;
    if (previous && statesEqual(previous, next)) return false;

    this._state = next;
    this._scheduleDeadline(next);

    const isNewOpenRound = next.round.status === ROUND_STATUS.OPEN
      && (previous?.round.id !== next.round.id || previous?.round.status !== ROUND_STATUS.OPEN);

    if (isNewOpenRound && this._shouldAutoOpen(next)) this.openWindow();
    else if (this.app.rendered) this.app.render({ force: true });

    const newlyAwarded = next.round.status === ROUND_STATUS.AWARDED
      && (previous?.round.id !== next.round.id || previous?.round.status !== ROUND_STATUS.AWARDED);
    if (newlyAwarded) {
      ui.notifications.info(game.i18n.format("CTM.Notifications.Awarded", {
        name: next.round.winnerName
      }));
    }

    const newlyCancelled = next.round.status === ROUND_STATUS.CANCELLED
      && previous?.round.status === ROUND_STATUS.OPEN;
    if (newlyCancelled) ui.notifications.warn(game.i18n.localize("CTM.Notifications.NoEligibleAtDeadline"));
    return true;
  }

  getPlayerPresentation(user) {
    const actor = user?.character;
    const userName = typeof user?.name === "string" ? user.name.trim() : "";
    const actorName = typeof actor?.name === "string" ? actor.name.trim() : "";
    const name = actorName || userName || game.i18n.localize("CTM.Player.Unknown");
    const tokenImage = actor?.prototypeToken?.texture?.src;
    const actorImage = actor?.img;
    const usableTokenImage = typeof tokenImage === "string" && tokenImage.length && !tokenImage.includes("*")
      ? tokenImage
      : null;
    const image = usableTokenImage || (typeof actorImage === "string" && actorImage.length ? actorImage : null);

    return {
      name,
      image,
      initial: name.charAt(0).toUpperCase() || "?"
    };
  }

  getWinnerPresentation(round) {
    if (round?.reason === AWARD_REASON.GM) {
      const name = typeof round.winnerName === "string" && round.winnerName.trim()
        ? round.winnerName.trim()
        : "GM";
      return {
        name,
        image: this.gmIconPath,
        initial: "GM",
        isGM: true
      };
    }

    const player = this.getPlayerPresentation(game.users.get(round?.winnerId));
    return {
      ...player,
      name: typeof round?.winnerName === "string" && round.winnerName.trim()
        ? round.winnerName.trim()
        : player.name,
      isGM: false
    };
  }

  isUserEligible(user, state = this.state) {
    return isPlayerEligible(state, user?.id);
  }

  onMediaSettingsChanged() {
    this._preloadSounds();
  }

  onSoundMuteChanged() {
    if (!this.soundsMuted) this._preloadSounds();
    if (this.app.rendered) this.app.render({ force: true });
  }

  onAppearanceSettingsChanged() {
    if (this.app.rendered) this.app.render({ force: true });
  }

  onUserConnectionChanged() {
    if (this.app.rendered) this.app.render({ force: true });
    if (game.user.isGM) this._broadcastGMPresence(true);
    this._refreshAuthority();
    this._scheduleDeadline(this.state);
    if (this.isPrimaryGM && this.state.round.status === ROUND_STATUS.OPEN
      && this.serverTime() >= this.state.round.endsAt) {
      this._enqueue(() => this._resolveExpiredRound());
    }
  }

  onUserUpdated() {
    if (this.app.rendered) this.app.render({ force: true });
  }

  ensureRoundResolved() {
    if (!this.isPrimaryGM) return;
    const state = this.state;
    if (state.round.status === ROUND_STATUS.OPEN && this.serverTime() >= state.round.endsAt) {
      this._enqueue(() => this._resolveExpiredRound());
    }
  }

  serverTime() {
    return Number(game.time?.serverTime) || Date.now();
  }

  _request(command, data = {}) {
    if (!this.primaryGM) {
      ui.notifications.warn(game.i18n.localize("CTM.Notifications.GMRequired"));
      return Promise.resolve(false);
    }

    const message = {
      command,
      requestId: foundry.utils.randomID(),
      senderId: game.user.id,
      senderClientId: this._clientId,
      ...data
    };

    if (this.isPrimaryGM) return this._enqueue(() => this._processRequest(message));
    game.socket.emit(SOCKET_NAME, message);
    return Promise.resolve(true);
  }

  _enqueue(operation) {
    const result = this._operationQueue.then(operation);
    this._operationQueue = result.catch((error) => {
      console.error(`${MODULE_ID} | Spotlight operation failed`, error);
      ui.notifications.error(game.i18n.localize("CTM.Notifications.OperationFailed"));
    });
    return result;
  }

  async _processRequest(message) {
    if (!message || typeof message !== "object" || typeof message.command !== "string") return false;

    const sender = game.users.get(message.senderId);
    if (!sender?.active) return false;

    switch (message.command) {
      case REQUEST.START:
        return this._startRound(sender);
      case REQUEST.TAKE:
        return this._takeSpotlight(sender);
      case REQUEST.CLAIM:
        return this._claimRound(sender, message.roundId);
      case REQUEST.SET_ELIGIBLE:
        return this._setEligibility(sender, message.userId, message.included);
      case REQUEST.SET_COUNT:
        return this._setCount(sender, message.userId, message.count);
      case REQUEST.RESET_COUNTS:
        return this._resetCounts(sender);
      default:
        return false;
    }
  }

  async _startRound(sender) {
    if (!sender.isGM) return false;

    const state = this.state;
    if (state.round.status === ROUND_STATUS.OPEN) return false;

    const candidates = this._eligibleOnlinePlayerIds(state);
    if (!candidates.length) {
      if (sender.id === game.user.id) {
        ui.notifications.warn(game.i18n.localize("CTM.Notifications.NoEligiblePlayers"));
      }
      return false;
    }

    const configuredSeconds = Number(game.settings.get(MODULE_ID, COUNTDOWN_SETTING));
    const countdownSeconds = Math.min(60, Math.max(3, Math.trunc(configuredSeconds) || 10));
    const next = startRound(state, {
      roundId: foundry.utils.randomID(),
      startedAt: this.serverTime(),
      durationMs: countdownSeconds * 1000
    });
    const saving = this._saveState(next);
    this._playConfiguredSound(this.alertSoundEnabled, this.alertSoundPath, "spotlight throw");
    await saving;
    return true;
  }

  async _takeSpotlight(sender) {
    if (!sender.isGM) return false;

    const next = takeSpotlight(this.state, {
      roundId: foundry.utils.randomID(),
      winnerId: sender.id,
      winnerName: this.getPlayerPresentation(sender).name,
      awardedAt: this.serverTime()
    });
    const saving = this._saveState(next);
    this._playConfiguredSound(this.gmTakeSoundEnabled, this.gmTakeSoundPath, "GM spotlight take");
    await saving;
    return true;
  }

  async _claimRound(sender, roundId) {
    if (sender.isGM) return false;

    const state = this.state;
    if (state.round.status !== ROUND_STATUS.OPEN || state.round.id !== roundId) return false;

    if (this.serverTime() >= state.round.endsAt) return this._resolveExpiredRound();
    if (!this.isUserEligible(sender, state)) return false;

    const winner = awardSpotlight(state, {
      winnerId: sender.id,
      winnerName: this.getPlayerPresentation(sender).name,
      reason: AWARD_REASON.CLAIM,
      awardedAt: this.serverTime()
    });
    const saving = this._saveState(winner);
    this._playConfiguredSound(this.playerClaimSoundEnabled, this.playerClaimSoundPath, "player spotlight claim");
    await saving;
    return true;
  }

  async _setEligibility(sender, userId, included) {
    if (!sender.isGM || !this._isPlayer(userId)) return false;
    return this._saveState(setPlayerEligibility(this.state, userId, included === true));
  }

  async _setCount(sender, userId, count) {
    if (!sender.isGM || !this._isPlayer(userId)) return false;
    return this._saveState(setPlayerCount(this.state, userId, count));
  }

  async _resetCounts(sender) {
    if (!sender.isGM) return false;
    const allPlayerIds = game.users.filter((user) => !user.isGM).map((user) => user.id);
    return this._saveState(resetPlayerCounts(this.state, allPlayerIds));
  }

  async _resolveExpiredRound() {
    if (!this.isPrimaryGM) return false;

    const state = this.state;
    if (state.round.status !== ROUND_STATUS.OPEN || this.serverTime() < state.round.endsAt) return false;

    const candidates = this._eligibleOnlinePlayerIds(state)
      .filter((userId) => userId !== state.round.fallbackExcludedUserId);
    const winnerId = chooseFallbackWinner(state, candidates);
    if (!winnerId) {
      await this._saveState(cancelRound(state));
      return false;
    }

    const user = game.users.get(winnerId);
    const winner = awardSpotlight(state, {
      winnerId,
      winnerName: this.getPlayerPresentation(user).name,
      reason: AWARD_REASON.AUTOMATIC,
      awardedAt: this.serverTime()
    });
    const saving = this._saveState(winner);
    this._playConfiguredSound(
      this.autoSelectSoundEnabled,
      this.autoSelectSoundPath,
      "automatic spotlight selection"
    );
    await saving;
    return true;
  }

  _eligibleOnlinePlayerIds(state) {
    return this.onlinePlayers
      .filter((user) => this.isUserEligible(user, state))
      .map((user) => user.id);
  }

  _isPlayer(userId) {
    const user = game.users.get(userId);
    return Boolean(user && !user.isGM);
  }

  async _saveState(state) {
    if (!this.isPrimaryGM) return false;
    const next = normalizeState(state);
    this.onStateChanged(next);

    try {
      await game.settings.set(MODULE_ID, STATE_SETTING, next);
      return true;
    } catch (error) {
      const persisted = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
      this._state = null;
      this.onStateChanged(persisted);
      throw error;
    }
  }

  _configuredPath(setting, fallback) {
    const configured = game.settings.get(MODULE_ID, setting);
    return typeof configured === "string" && configured.trim() ? configured.trim() : fallback;
  }

  _shouldAutoOpen(state) {
    return game.user.isGM || this.isUserEligible(game.user, state);
  }

  _playConfiguredSound(enabled, src, description) {
    if (!enabled) return;

    if (!this.soundsMuted) this._playSoundLocally(src, description);
    game.socket.emit(SOCKET_NAME, {
      command: REQUEST.PLAY_SOUND,
      soundId: foundry.utils.randomID(),
      senderId: game.user.id,
      senderClientId: this._clientId,
      src,
      description
    });
  }

  _receiveSound(message) {
    const sender = game.users.get(message.senderId);
    if (!sender?.active || !sender.isGM) return false;
    if (message.senderClientId === this._clientId) return false;
    if (typeof message.soundId !== "string" || !message.soundId) return false;
    if (typeof message.src !== "string" || !message.src.trim()) return false;

    this._playSoundLocally(message.src.trim(), message.description);
    return true;
  }

  _playSoundLocally(src, description = "spotlight") {
    if (this.soundsMuted) return false;

    try {
      const playback = foundry.audio.AudioHelper.play({
        src,
        volume: 0.8,
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

  _preloadSounds() {
    if (this.soundsMuted) return;
    const sounds = [
      [this.alertSoundEnabled, this.alertSoundPath, "spotlight throw"],
      [this.playerClaimSoundEnabled, this.playerClaimSoundPath, "player spotlight claim"],
      [this.autoSelectSoundEnabled, this.autoSelectSoundPath, "automatic spotlight selection"],
      [this.gmTakeSoundEnabled, this.gmTakeSoundPath, "GM spotlight take"]
    ];

    for (const [enabled, src, description] of sounds) {
      if (!enabled) continue;
      foundry.audio.AudioHelper.preloadSound(src).catch((error) => {
        console.warn(`${MODULE_ID} | Could not preload the ${description} sound`, error);
      });
    }
  }

  _scheduleDeadline(state) {
    if (this._deadlineTimer) clearTimeout(this._deadlineTimer);
    this._deadlineTimer = null;

    if (!this.isPrimaryGM || state.round.status !== ROUND_STATUS.OPEN) return;
    const delay = Math.max(0, state.round.endsAt - this.serverTime()) + 50;
    this._deadlineTimer = setTimeout(() => this.ensureRoundResolved(), delay);
    this._deadlineTimer.unref?.();
  }

  _startGMPresence() {
    if (!game.user.isGM) return;
    this._recordGMClient(game.user.id, this._clientId);
    this._broadcastGMPresence(true);
    this._presenceTimer = setInterval(() => {
      this._recordGMClient(game.user.id, this._clientId);
      this._broadcastGMPresence(false);
      this._refreshAuthority();
    }, GM_PRESENCE_INTERVAL_MS);
    this._presenceTimer.unref?.();
  }

  _broadcastGMPresence(requestReply) {
    if (!game.user.isGM) return;
    this._recordGMClient(game.user.id, this._clientId);
    game.socket.emit(SOCKET_NAME, {
      command: REQUEST.GM_PRESENCE,
      senderId: game.user.id,
      clientId: this._clientId,
      requestReply: requestReply === true
    });
  }

  _receiveGMPresence(message) {
    const sender = game.users.get(message.senderId);
    if (!sender?.active || !sender.isGM || typeof message.clientId !== "string" || !message.clientId) return;
    this._recordGMClient(sender.id, message.clientId);
    if (message.requestReply === true && game.user.isGM) this._broadcastGMPresence(false);
    this._refreshAuthority();
  }

  _recordGMClient(userId, clientId) {
    this._gmClients.set(clientId, {
      userId,
      lastSeen: Date.now()
    });
  }

  _refreshAuthority() {
    const now = Date.now();
    const activeGMIds = new Set(game.users
      .filter((user) => user.active && user.isGM)
      .map((user) => user.id));

    if (game.user.isGM && activeGMIds.has(game.user.id)) {
      const own = this._gmClients.get(this._clientId);
      if (!own) this._recordGMClient(game.user.id, this._clientId);
    }

    for (const [clientId, presence] of this._gmClients) {
      if (!activeGMIds.has(presence.userId) || now - presence.lastSeen > GM_PRESENCE_TIMEOUT_MS) {
        this._gmClients.delete(clientId);
      }
    }

    const previous = this._authorityClientId;
    const candidates = [...this._gmClients.entries()]
      .map(([clientId, presence]) => ({
        clientId,
        user: game.users.get(presence.userId)
      }))
      .filter((candidate) => candidate.user?.active && candidate.user.isGM)
      .sort((left, right) => (right.user.role - left.user.role)
        || left.user.id.localeCompare(right.user.id)
        || left.clientId.localeCompare(right.clientId));

    this._authorityClientId = candidates[0]?.clientId ?? null;
    if (previous && previous !== this._authorityClientId) this._scheduleDeadline(this.state);
    return this._authorityClientId;
  }
}
