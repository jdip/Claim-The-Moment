import {
  MODULE_ID,
  SHOW_WELCOME_SETTING,
  SPOTLIGHT_CONTROL_ICON,
  TOKEN_CONTROLS_ICON
} from "./constants.mjs";
import { PreferenceWriter } from "./preference-writer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HelpApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(controller, options = {}) {
    super(options);
    this.controller = controller;
    this.preferenceWriter = new PreferenceWriter("the welcome preference");
  }

  static DEFAULT_OPTIONS = {
    id: "claim-the-moment-help",
    classes: ["claim-the-moment", "ctm-help-app"],
    tag: "form",
    window: {
      title: "CTM.Help.Title",
      icon: "fa-solid fa-circle-question",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 600,
      height: 640
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: HelpApp.onSubmitForm
    },
    actions: {
      openSpotlight: HelpApp.onOpenSpotlight,
      openCredits: HelpApp.onOpenCredits
    }
  };

  static PARTS = {
    main: {
      root: true,
      template: "modules/claim-the-moment/templates/help.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      isGM: game.user.isGM,
      showWelcomeOnLogin: game.settings.get(MODULE_ID, SHOW_WELCOME_SETTING) === true,
      tokenControlsIcon: TOKEN_CONTROLS_ICON,
      spotlightControlIcon: SPOTLIGHT_CONTROL_ICON,
      guideUrl: "modules/claim-the-moment/docs/USER_GUIDE.md"
    };
  }

  async _preClose(options) {
    await this.preferenceWriter.flush();
    return super._preClose(options);
  }

  static async onSubmitForm(event) {
    const target = event.target;
    if (target?.name !== "showWelcomeOnLogin") return false;

    const showWelcome = target.checked === true;
    const saved = await this.preferenceWriter.write(SHOW_WELCOME_SETTING, showWelcome);
    if (!saved) target.checked = !showWelcome;
    return saved;
  }

  static onOpenSpotlight() {
    this.controller.openWindow();
  }

  static onOpenCredits() {
    this.controller.openCredits();
  }
}
