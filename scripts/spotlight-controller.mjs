import {
  AWARD_REASON,
  DEFAULT_GM_ICON_PATH,
  GM_ICON_SETTING,
  MODULE_ID,
  REQUEST,
  ROUND_STATUS,
  SHOW_WELCOME_SETTING,
  SOCKET_NAME
} from "./constants.mjs";
import { CreditsApp } from "./credits-app.mjs";
import { GMAuthority } from "./gm-authority.mjs";
import { HelpApp } from "./help-app.mjs";
import { SpotlightApp } from "./spotlight-app.mjs";
import { SpotlightAudio } from "./spotlight-audio.mjs";
import { SpotlightProtocol } from "./spotlight-protocol.mjs";
import { SpotlightService } from "./spotlight-service.mjs";
import { SpotlightStateStore } from "./spotlight-state-store.mjs";
import { WelcomeApp } from "./welcome-app.mjs";

export class SpotlightController {
  constructor() {
    this.clientId = foundry.utils.randomID();
    this.deadlineTimer = null;
    this.operationQueue = Promise.resolve();
    this.initialized = false;
    this.receiveSocket = this.receiveSocket.bind(this);
    this.dispose = this.dispose.bind(this);

    this.authority = new GMAuthority(this.clientId, {
      onChange: () => this._onAuthorityChanged()
    });
    this.stateStore = new SpotlightStateStore({
      isAuthority: () => this.isAuthorityClient,
      onChanged: (previous, next) => this._applyStateChange(previous, next)
    });
    this.audio = new SpotlightAudio(this.clientId);
    this.service = new SpotlightService({
      stateStore: this.stateStore,
      audio: this.audio,
      isAuthority: () => this.isAuthorityClient,
      onlinePlayers: () => this.onlinePlayers,
      isEligible: (user, state) => this.isUserEligible(user, state),
      presentation: (user) => this.getPlayerPresentation(user),
      serverTime: () => this.serverTime()
    });
    this.protocol = new SpotlightProtocol({
      clientId: this.clientId,
      authority: this.authority,
      isAuthority: () => this.isAuthorityClient,
      processRequest: (message) => this._enqueue(() => this.service.processRequest(message)),
      onFailure: (errorCode) => this._notifyProtocolFailure(errorCode)
    });

    this.app = new SpotlightApp(this);
    this.helpApp = new HelpApp(this);
    this.creditsApp = new CreditsApp();
    this.welcomeApp = new WelcomeApp(this);
  }

  get state() {
    return this.stateStore.state;
  }

  get onlinePlayers() {
    return game.users
      .filter((user) => user.active && !user.isGM)
      .sort((left, right) => this.getPlayerPresentation(left).name.localeCompare(
        this.getPlayerPresentation(right).name,
        game.i18n.lang
      ));
  }

  get isAuthorityClient() {
    if (!this.initialized && game.user.isGM && this.authority.clients.size === 0) return true;
    return this.authority.isAuthorityClient;
  }

  get alertSoundEnabled() {
    return this.audio.cueEnabled("throw");
  }

  get alertSoundPath() {
    return this.audio.cuePath("throw");
  }

  get playerClaimSoundEnabled() {
    return this.audio.cueEnabled("player");
  }

  get playerClaimSoundPath() {
    return this.audio.cuePath("player");
  }

  get autoSelectSoundEnabled() {
    return this.audio.cueEnabled("automatic");
  }

  get autoSelectSoundPath() {
    return this.audio.cuePath("automatic");
  }

  get gmTakeSoundEnabled() {
    return this.audio.cueEnabled("gm");
  }

  get gmTakeSoundPath() {
    return this.audio.cuePath("gm");
  }

  get soundVolumePercent() {
    return this.audio.volumePercent;
  }

  get soundVolume() {
    return this.audio.volume;
  }

  get gmIconPath() {
    const configured = game.settings.get(MODULE_ID, GM_ICON_SETTING);
    return typeof configured === "string" && configured.trim()
      ? configured.trim()
      : DEFAULT_GM_ICON_PATH;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const state = this.stateStore.initialize();
      game.socket.on(SOCKET_NAME, this.receiveSocket);
      globalThis.addEventListener?.("beforeunload", this.dispose, { once: true });
      this.authority.start();
      this._scheduleDeadline(state);

      this.audio.preload();

      if (state.round.status === ROUND_STATUS.OPEN && this._shouldAutoOpen(state)) this.openWindow();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  dispose() {
    if (!this.initialized) return;
    this.initialized = false;
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    this.protocol.dispose();
    this.authority.dispose();
    game.socket.off?.(SOCKET_NAME, this.receiveSocket);
    globalThis.removeEventListener?.("beforeunload", this.dispose);
  }

  openWindow() {
    this.app.render({ force: true });
  }

  openHelp() {
    this.helpApp.render({ force: true });
  }

  openCredits() {
    this.creditsApp.render({ force: true });
  }

  async showWelcomeIfNeeded() {
    if (this.state.round.status === ROUND_STATUS.OPEN) return false;
    if (game.settings.get(MODULE_ID, SHOW_WELCOME_SETTING) !== true) return false;
    this.welcomeApp.render({ force: true });
    return true;
  }

  receiveSocket(message) {
    if (!message || typeof message !== "object") return false;
    if (message.command === REQUEST.PLAY_SOUND) return this.audio.receive(message);
    if (message.command === REQUEST.GM_PRESENCE) return this.authority.receive(message);
    return this.protocol.receive(message);
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

  requestHandSpotlight(userId) {
    return this._request(REQUEST.HAND_SPOTLIGHT, { userId });
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

  async setSoundVolume(volume) {
    try {
      return await this.audio.setVolume(volume);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update the personal sound volume`, error);
      ui.notifications.error(game.i18n.localize("CTM.Notifications.OperationFailed"));
      return false;
    }
  }

  onStateChanged(rawState) {
    return this.stateStore.onSettingChanged(rawState);
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

    return { name, image, initial: name.charAt(0).toUpperCase() || "?" };
  }

  getWinnerPresentation(round) {
    if (round?.reason === AWARD_REASON.GM) {
      const name = typeof round.winnerName === "string" && round.winnerName.trim()
        ? round.winnerName.trim()
        : "GM";
      return { name, image: this.gmIconPath, initial: "GM", isGM: true };
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
    return state.eligible[user?.id] !== false;
  }

  onMediaSettingsChanged() {
    this.audio.preload();
  }

  onSoundVolumeChanged() {
    const volume = this.soundVolumePercent;
    if (volume > 0) this.audio.preload();
    if (!this.app.rendered) return;
    const slider = this.app.element?.querySelector?.("[data-sound-volume]");
    const output = this.app.element?.querySelector?.("[data-volume-output]");
    const icon = this.app.element?.querySelector?.("[data-volume-icon]");
    if (slider && slider !== globalThis.document?.activeElement) slider.value = String(volume);
    if (output) output.textContent = `${volume}%`;
    if (icon) {
      icon.classList.toggle("fa-volume-high", volume > 0);
      icon.classList.toggle("fa-volume-xmark", volume === 0);
    }
  }

  onAppearanceSettingsChanged() {
    if (this.app.rendered) this.app.render({ force: true });
  }

  onUserConnectionChanged() {
    if (this.app.rendered) this.app.render({ force: true });
    this.authority.onUserConnectionChanged();
    this.protocol.retryPending();
    this._scheduleDeadline(this.state);
    this.ensureRoundResolved();
  }

  onUserUpdated() {
    if (this.app.rendered) this.app.render({ force: true });
  }

  onUserDeleted() {
    if (this.app.rendered) this.app.render({ force: true });
    if (this.isAuthorityClient) void this._enqueue(() => this._pruneUnknownPlayers());
  }

  ensureRoundResolved() {
    if (!this.isAuthorityClient) return false;
    const state = this.state;
    if (state.round.status !== ROUND_STATUS.OPEN || this.serverTime() < state.round.endsAt) return false;
    void this._enqueue(() => this._resolveExpiredRound({ requestId: `deadline:${state.round.id}` }));
    return true;
  }

  serverTime() {
    return Number(game.time?.serverTime) || Date.now();
  }

  _request(command, data = {}) {
    if (!this.authority.hasActiveGM) {
      ui.notifications.warn(game.i18n.localize("CTM.Notifications.GMRequired"));
      return Promise.resolve(false);
    }
    return this.protocol.request(command, data);
  }

  _enqueue(operation) {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.catch((error) => {
      console.error(`${MODULE_ID} | Spotlight operation failed`, error);
    });
    return result;
  }

  _processRequest(message) {
    return this.service.processRequest(message);
  }

  _resolveExpiredRound(options) {
    return this.service.resolveExpiredRound(options);
  }

  _applyStateChange(previous, next) {
    this._scheduleDeadline(next);

    const isNewOpenRound = next.round.status === ROUND_STATUS.OPEN
      && (previous?.round.id !== next.round.id || previous?.round.status !== ROUND_STATUS.OPEN);
    if (isNewOpenRound && this.welcomeApp.rendered) void this.welcomeApp.close();
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
    if (newlyCancelled) {
      ui.notifications.warn(game.i18n.localize("CTM.Notifications.NoEligibleAtDeadline"));
    }
  }

  _onAuthorityChanged() {
    this.protocol.retryPending();
    this._scheduleDeadline(this.state);
    if (!this.isAuthorityClient) return;
    void this._enqueue(async () => {
      await this._pruneUnknownPlayers();
      this.ensureRoundResolved();
    });
  }

  async _pruneUnknownPlayers() {
    if (!this.isAuthorityClient) return false;
    const playerIds = game.users.filter((user) => !user.isGM).map((user) => user.id);
    return this.stateStore.prune(playerIds);
  }

  _scheduleDeadline(state) {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    if (!this.isAuthorityClient || state.round.status !== ROUND_STATUS.OPEN) return;

    const delay = Math.min(2_147_483_647, Math.max(0, state.round.endsAt - this.serverTime()) + 50);
    this.deadlineTimer = setTimeout(() => this.ensureRoundResolved(), delay);
    this.deadlineTimer.unref?.();
  }

  _shouldAutoOpen(state) {
    return game.user.isGM || this.isUserEligible(game.user, state);
  }

  _notifyProtocolFailure(errorCode) {
    const key = errorCode === "timeout"
      ? "CTM.Notifications.RequestTimedOut"
      : "CTM.Notifications.OperationFailed";
    ui.notifications.error(game.i18n.localize(key));
  }
}
