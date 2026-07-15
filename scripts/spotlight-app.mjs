import { AWARD_REASON, ROUND_STATUS } from "./constants.mjs";
import { getPlayerCount } from "./state.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpotlightApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(controller, options = {}) {
    super(options);
    this.controller = controller;
    this._ticker = null;
  }

  static DEFAULT_OPTIONS = {
    id: "claim-the-moment",
    classes: ["claim-the-moment"],
    tag: "form",
    window: {
      title: "CTM.Window.Title",
      icon: "fa-solid fa-wand-sparkles",
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
        count: getPlayerCount(state, user.id),
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

    let claimLabel = "CTM.Actions.WaitingForThrow";
    if (isOpen && !currentPlayer?.eligible) claimLabel = "CTM.Actions.NotInContention";
    else if (isOpen) claimLabel = "CTM.Actions.ClaimSpotlight";

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
      progressPercent: Math.round((remaining / duration) * 100),
      roundId: round.id,
      soundVolumePercent: this.controller.soundVolumePercent,
      soundVolumeZero: this.controller.soundVolumePercent === 0,
      canClaim,
      claimLabel,
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
    const percent = Math.round((remaining / duration) * 100);
    const seconds = Math.ceil(remaining / 1000);

    const number = this.element.querySelector("[data-countdown-number]");
    const ring = this.element.querySelector("[data-countdown-ring]");
    const bar = this.element.querySelector("[data-countdown-bar]");
    if (number) number.textContent = String(seconds);
    if (ring) ring.style.setProperty("--ctm-progress", `${percent}%`);
    if (bar) bar.style.width = `${percent}%`;

    if (remaining <= 0) this.controller.ensureRoundResolved();
  }

  static async onThrowSpotlight(_event, target) {
    target.disabled = true;
    const started = await this.controller.requestStart();
    if (!started && target.isConnected) target.disabled = false;
  }

  static async onTakeSpotlight(_event, target) {
    target.disabled = true;
    const taken = await this.controller.requestTake();
    if (!taken && target.isConnected) target.disabled = false;
  }

  static async onClaimSpotlight(_event, target) {
    target.disabled = true;
    target.setAttribute("aria-busy", "true");
    const claimed = await this.controller.requestClaim(target.dataset.roundId);
    if (!claimed && target.isConnected) {
      target.disabled = false;
      target.removeAttribute("aria-busy");
    }
  }

  static async onHandSpotlight(_event, target) {
    target.disabled = true;
    target.setAttribute("aria-busy", "true");
    const handed = await this.controller.requestHandSpotlight(target.dataset.playerId);
    if (!handed && target.isConnected) {
      target.disabled = false;
      target.removeAttribute("aria-busy");
    }
  }

  static async onToggleEligibility(_event, target) {
    const included = target.checked;
    target.disabled = true;
    const updated = await this.controller.requestEligibility(target.dataset.eligibleUser, included);
    if (!updated && target.isConnected) {
      target.checked = !included;
      target.disabled = false;
    }
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
      return this.controller.setSoundVolume(volume);
    }

    const userId = target?.dataset?.countUser;
    if (!userId) return false;

    const parsed = Number(target.value);
    const count = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    target.value = String(count);
    target.disabled = true;
    const updated = await this.controller.requestCount(userId, count);
    if (!updated && target.isConnected) target.disabled = false;
    return updated;
  }

  static async onResetCounts(_event, target) {
    target.disabled = true;
    const confirmed = await DialogV2.confirm({
      window: {
        title: game.i18n.localize("CTM.Reset.Title"),
        icon: "fa-solid fa-arrow-rotate-left"
      },
      content: `<p>${game.i18n.localize("CTM.Reset.Confirm")}</p>`
    });

    if (confirmed) await this.controller.requestResetCounts();
    else target.disabled = false;
  }
}
