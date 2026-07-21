import { AWARD_REASON, ROUND_STATUS, SPOTLIGHT_CONTROL_ICON } from "./constants.mjs";
import { getPlayerCount } from "./state.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpotlightApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(controller, options = {}) {
    super(options);
    this.controller = controller;
    this._ticker = null;
    this._lastAnnouncedSecond = null;
  }

  static DEFAULT_OPTIONS = {
    id: "claim-the-moment",
    classes: ["claim-the-moment"],
    tag: "form",
    window: {
      title: "CTM.Window.Title",
      icon: SPOTLIGHT_CONTROL_ICON,
      resizable: true,
      minimizable: true
    },
    position: {
      width: 480,
      height: "auto"
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: SpotlightApp.onSubmitForm
    },
    actions: {
      throwSpotlight: SpotlightApp.onThrowSpotlight,
      takeSpotlight: SpotlightApp.onTakeSpotlight,
      claimSpotlight: SpotlightApp.onClaimSpotlight,
      handSpotlight: SpotlightApp.onHandSpotlight,
      openHelp: SpotlightApp.onOpenHelp,
      toggleEligibility: SpotlightApp.onToggleEligibility,
      resetCounts: SpotlightApp.onResetCounts
    }
  };

  static PARTS = {
    main: {
      root: true,
      template: "modules/claim-the-moment/templates/spotlight.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this.controller.state;
    const round = state.round;
    const now = this.controller.serverTime();
    const duration = Math.max(1, (round.endsAt ?? now) - (round.startedAt ?? now));
    const remaining = round.status === ROUND_STATUS.OPEN
      ? Math.max(0, (round.endsAt ?? now) - now)
      : 0;

    const players = this.controller.onlinePlayers
      .map((user) => ({
        id: user.id,
        ...this.controller.getPlayerPresentation(user),
        count: state.counts[user.id] ?? 0,
        eligible: this.controller.isUserEligible(user, state)
      }))
      .sort((left, right) => (left.count - right.count)
        || left.name.localeCompare(right.name, game.i18n.lang)
        || left.id.localeCompare(right.id));

    const currentPlayer = players.find((player) => player.id === game.user.id);
    const isOpen = round.status === ROUND_STATUS.OPEN;
    const isGM = game.user.isGM;
    const canClaim = !isGM && isOpen && Boolean(currentPlayer?.eligible) && remaining > 0;
    const eligibleCount = players.filter((player) => player.eligible).length;
    const hasWinner = round.status === ROUND_STATUS.AWARDED && Boolean(round.winnerName);
    const winner = hasWinner ? this.controller.getWinnerPresentation(round) : null;
    const soundVolumePercent = this.controller.soundVolumePercent;

    let claimLabel = "CTM.Actions.WaitingForThrow";
    if (isOpen && !currentPlayer?.eligible) claimLabel = "CTM.Actions.NotInContention";
    else if (isOpen) claimLabel = "CTM.Actions.ClaimSpotlight";

    let throwDisabledReason = null;
    if (isGM && !isOpen && players.length === 0) {
      throwDisabledReason = "CTM.Readiness.NoOnlinePlayers";
    } else if (isGM && !isOpen && eligibleCount === 0) {
      throwDisabledReason = "CTM.Readiness.NoEligiblePlayers";
    }

    return {
      ...context,
      isGM,
      players,
      hasPlayers: players.length > 0,
      eligibleCount,
      isOpen,
      hasWinner,
      isCancelled: round.status === ROUND_STATUS.CANCELLED,
      winnerName: winner?.name ?? round.winnerName,
      winnerImage: winner?.image,
      winnerInitial: winner?.initial,
      winnerIsGM: winner?.isGM === true,
      wasAutomatic: round.reason === AWARD_REASON.AUTOMATIC,
      wasHandedByGM: round.reason === AWARD_REASON.HANDOFF,
      wasTakenByGM: round.reason === AWARD_REASON.GM,
      remainingSeconds: Math.ceil(remaining / 1000),
      progressPercent: Math.max(0, Math.min(100, Math.round((remaining / duration) * 100))),
      roundId: round.id,
      soundVolumePercent,
      soundVolumeZero: soundVolumePercent === 0,
      canClaim,
      claimLabel,
      throwDisabledReason,
      canThrow: isGM && !isOpen && eligibleCount > 0,
      canTake: isGM
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._startTicker();
  }

  _onClose(options) {
    this._stopTicker();
    return super._onClose(options);
  }

  _startTicker() {
    this._stopTicker();
    if (this.controller.state.round.status !== ROUND_STATUS.OPEN) return;
    this._updateCountdown();
    this._ticker = setInterval(() => this._updateCountdown(), 100);
  }

  _stopTicker() {
    if (this._ticker) clearInterval(this._ticker);
    this._ticker = null;
    this._lastAnnouncedSecond = null;
  }

  _updateCountdown() {
    const state = this.controller.state;
    if (state.round.status !== ROUND_STATUS.OPEN) {
      this._stopTicker();
      if (this.rendered) this.render();
      return;
    }

    const now = this.controller.serverTime();
    const remaining = Math.max(0, state.round.endsAt - now);
    const duration = Math.max(1, state.round.endsAt - state.round.startedAt);
    const percent = Math.max(0, Math.min(100, Math.round((remaining / duration) * 100)));
    const seconds = Math.ceil(remaining / 1000);

    const number = this.element.querySelector("[data-countdown-number]");
    const ring = this.element.querySelector("[data-countdown-ring]");
    const bar = this.element.querySelector("[data-countdown-bar]");
    const announcement = this.element.querySelector("[data-countdown-announcement]");
    if (number) number.textContent = String(seconds);
    if (ring) ring.style.setProperty("--ctm-progress", `${percent}%`);
    if (bar) bar.style.width = `${percent}%`;
    if (announcement && seconds !== this._lastAnnouncedSecond) {
      announcement.textContent = game.i18n.format("CTM.Status.CountdownAnnouncement", { seconds });
      this._lastAnnouncedSecond = seconds;
    }

    if (remaining <= 0) this.controller.ensureRoundResolved();
  }

  static async onThrowSpotlight(_event, target) {
    return SpotlightApp.runPendingAction(target, () => this.controller.requestStart());
  }

  static async onTakeSpotlight(_event, target) {
    return SpotlightApp.runPendingAction(target, () => this.controller.requestTake());
  }

  static async onClaimSpotlight(_event, target) {
    return SpotlightApp.runPendingAction(
      target,
      () => this.controller.requestClaim(target.dataset.roundId),
      { busy: true }
    );
  }

  static async onHandSpotlight(_event, target) {
    return SpotlightApp.runPendingAction(
      target,
      () => this.controller.requestHandSpotlight(target.dataset.playerId),
      { busy: true }
    );
  }

  static onOpenHelp() {
    this.controller.openHelp();
  }

  static async onToggleEligibility(_event, target) {
    const included = target.checked;
    return SpotlightApp.runPendingAction(
      target,
      () => this.controller.requestEligibility(target.dataset.eligibleUser, included),
      { onFailure: () => { target.checked = !included; } }
    );
  }

  static async onSubmitForm(event, _form, _formData) {
    const target = event.target;

    if (target?.dataset && "soundVolume" in target.dataset) {
      const parsed = Number(target.value);
      const volume = Number.isFinite(parsed)
        ? Math.max(0, Math.min(100, Math.round(parsed)))
        : 80;
      target.value = String(volume);
      const output = this.element?.querySelector?.("[data-volume-output]");
      if (output) output.textContent = `${volume}%`;
      const updated = await this.controller.setSoundVolume(volume);
      if (!updated) {
        const persisted = this.controller.soundVolumePercent;
        target.value = String(persisted);
        if (output) output.textContent = `${persisted}%`;
      }
      return updated;
    }

    const userId = target?.dataset?.countUser;
    if (!userId) return false;

    const parsed = Number(target.value);
    const count = Number.isFinite(parsed)
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(parsed)))
      : 0;
    target.value = String(count);
    return SpotlightApp.runPendingAction(
      target,
      () => this.controller.requestCount(userId, count),
      {
        onFailure: () => {
          target.value = String(getPlayerCount(this.controller.state, userId));
        }
      }
    );
  }

  static async onResetCounts(_event, target) {
    return SpotlightApp.runPendingAction(target, async () => {
      const confirmed = await DialogV2.confirm({
        window: {
          title: game.i18n.localize("CTM.Reset.Title"),
          icon: "fa-solid fa-arrow-rotate-left"
        },
        content: `<p>${game.i18n.localize("CTM.Reset.Confirm")}</p>`
      });
      if (!confirmed) return false;
      return this.controller.requestResetCounts();
    });
  }

  static async runPendingAction(target, operation, { busy = false, onFailure = null } = {}) {
    target.disabled = true;
    if (busy) target.setAttribute?.("aria-busy", "true");

    let succeeded = false;
    try {
      succeeded = await operation() === true;
      return succeeded;
    } catch (error) {
      console.error("claim-the-moment | Window action failed", error);
      ui.notifications.error(game.i18n.localize("CTM.Notifications.OperationFailed"));
      return false;
    } finally {
      if (!succeeded && target.isConnected !== false) {
        onFailure?.();
        target.disabled = false;
        if (busy) target.removeAttribute?.("aria-busy");
      }
    }
  }
}
