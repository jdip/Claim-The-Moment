import {
  AWARD_REASON,
  COUNTDOWN_SETTING,
  MODULE_ID,
  REQUEST,
  ROUND_STATUS
} from "./constants.mjs";
import {
  awardSpotlight,
  cancelRound,
  chooseFallbackWinner,
  hasProcessedRequest,
  handSpotlight,
  recordProcessedRequest,
  resetPlayerCounts,
  setPlayerCount,
  setPlayerEligibility,
  startRound,
  takeSpotlight
} from "./state.mjs";

export class SpotlightService {
  constructor({
    stateStore,
    audio,
    isAuthority,
    onlinePlayers,
    isEligible,
    presentation,
    serverTime
  }) {
    this.stateStore = stateStore;
    this.audio = audio;
    this.isAuthority = isAuthority;
    this.onlinePlayers = onlinePlayers;
    this.isEligible = isEligible;
    this.presentation = presentation;
    this.serverTime = serverTime;
  }

  async processRequest(message) {
    if (!this.isAuthority()) return false;
    if (!message || typeof message !== "object" || typeof message.command !== "string") return false;
    if (typeof message.requestId !== "string" || !message.requestId) {
      message = { ...message, requestId: foundry.utils.randomID() };
    }

    const sender = game.users.get(message.senderId);
    if (!sender?.active) return false;
    if (hasProcessedRequest(this.stateStore.state, message.requestId)) return true;

    switch (message.command) {
      case REQUEST.START:
        return this._startRound(sender, message);
      case REQUEST.TAKE:
        return this._takeSpotlight(sender, message);
      case REQUEST.CLAIM:
        return this._claimRound(sender, message);
      case REQUEST.HAND_SPOTLIGHT:
        return this._handSpotlight(sender, message);
      case REQUEST.SET_ELIGIBLE:
        return this._setEligibility(sender, message);
      case REQUEST.SET_COUNT:
        return this._setCount(sender, message);
      case REQUEST.RESET_COUNTS:
        return this._resetCounts(sender, message);
      default:
        return false;
    }
  }

  async resolveExpiredRound({ requestId = foundry.utils.randomID() } = {}) {
    if (!this.isAuthority()) return false;
    const state = this.stateStore.state;
    if (state.round.status !== ROUND_STATUS.OPEN || this.serverTime() < state.round.endsAt) return false;

    const candidates = this._eligibleOnlinePlayerIds(state)
      .filter((userId) => userId !== state.round.fallbackExcludedUserId);
    const winnerId = chooseFallbackWinner(state, candidates);
    if (!winnerId) {
      await this._commit(state, cancelRound(state), { requestId });
      return false;
    }

    const user = game.users.get(winnerId);
    const winner = awardSpotlight(state, {
      winnerId,
      winnerName: this.presentation(user).name,
      reason: AWARD_REASON.AUTOMATIC,
      awardedAt: this.serverTime()
    });
    return this._commit(state, winner, { cueKey: "automatic", requestId });
  }

  async _startRound(sender, message) {
    if (!sender.isGM) return false;
    const state = this.stateStore.state;
    if (state.round.status === ROUND_STATUS.OPEN) return false;
    if (!this._eligibleOnlinePlayerIds(state).length) return false;

    const configuredSeconds = Number(game.settings.get(MODULE_ID, COUNTDOWN_SETTING));
    const countdownSeconds = Math.min(60, Math.max(3, Math.trunc(configuredSeconds) || 10));
    const next = startRound(state, {
      roundId: message.requestId,
      startedAt: this.serverTime(),
      durationMs: countdownSeconds * 1000
    });
    return this._commit(state, next, { cueKey: "throw", requestId: message.requestId });
  }

  async _takeSpotlight(sender, message) {
    if (!sender.isGM) return false;
    const state = this.stateStore.state;
    const next = takeSpotlight(state, {
      roundId: message.requestId,
      winnerId: sender.id,
      winnerName: this.presentation(sender).name,
      awardedAt: this.serverTime()
    });
    return this._commit(state, next, { cueKey: "gm", requestId: message.requestId });
  }

  async _claimRound(sender, message) {
    if (sender.isGM) return false;
    const state = this.stateStore.state;
    if (state.round.status !== ROUND_STATUS.OPEN || state.round.id !== message.roundId) return false;
    if (this.serverTime() >= state.round.endsAt) {
      await this.resolveExpiredRound({ requestId: `${message.requestId}:expired` });
      return false;
    }
    if (!this.isEligible(sender, state)) return false;

    const winner = awardSpotlight(state, {
      winnerId: sender.id,
      winnerName: this.presentation(sender).name,
      reason: AWARD_REASON.CLAIM,
      awardedAt: this.serverTime()
    });
    return this._commit(state, winner, { cueKey: "player", requestId: message.requestId });
  }

  async _handSpotlight(sender, message) {
    if (!sender.isGM) return false;
    const player = game.users.get(message.userId);
    const state = this.stateStore.state;
    if (!player?.active || player.isGM || !this.isEligible(player, state)) return false;

    const winner = handSpotlight(state, {
      roundId: message.requestId,
      winnerId: player.id,
      winnerName: this.presentation(player).name,
      awardedAt: this.serverTime()
    });
    return this._commit(state, winner, { cueKey: "player", requestId: message.requestId });
  }

  async _setEligibility(sender, message) {
    if (!sender.isGM || !this._isPlayer(message.userId)) return false;
    const state = this.stateStore.state;
    return this._commit(state, setPlayerEligibility(state, message.userId, message.included === true), {
      requestId: message.requestId
    });
  }

  async _setCount(sender, message) {
    if (!sender.isGM || !this._isPlayer(message.userId)) return false;
    const state = this.stateStore.state;
    return this._commit(state, setPlayerCount(state, message.userId, message.count), {
      requestId: message.requestId
    });
  }

  async _resetCounts(sender, message) {
    if (!sender.isGM) return false;
    const state = this.stateStore.state;
    const allPlayerIds = game.users.filter((user) => !user.isGM).map((user) => user.id);
    return this._commit(state, resetPlayerCounts(state, allPlayerIds), {
      requestId: message.requestId
    });
  }

  async _commit(baseState, nextState, { cueKey = null, requestId = null } = {}) {
    if (!this.isAuthority()) return false;
    const committedState = recordProcessedRequest(nextState, requestId);
    const saved = await this.stateStore.save(committedState, { expectedRevision: baseState.revision });
    if (!saved) return false;
    if (cueKey) this.audio.playCue(cueKey, { soundId: `${requestId}:${cueKey}` });
    return true;
  }

  _eligibleOnlinePlayerIds(state) {
    return this.onlinePlayers()
      .filter((user) => this.isEligible(user, state))
      .map((user) => user.id);
  }

  _isPlayer(userId) {
    const user = game.users.get(userId);
    return Boolean(user && !user.isGM);
  }
}
