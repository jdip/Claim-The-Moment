import {
  MODULE_ID,
  SHOW_WELCOME_SETTING,
  SPOTLIGHT_CONTROL_ICON,
  TOKEN_CONTROLS_ICON
} from "./constants.mjs";
import { PreferenceWriter } from "./preference-writer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class WelcomeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(controller, options = {}) {
    super(options);
    this.controller = controller;
    this.preferenceWriter = new PreferenceWriter("the welcome preference");
  }

  static DEFAULT_OPTIONS = {
    id: "claim-the-moment-welcome",
    classes: ["claim-the-moment", "ctm-onboarding-dialog"],
    tag: "form",
    window: {
      title: "CTM.Onboarding.Title",
      icon: SPOTLIGHT_CONTROL_ICON,
      resizable: false,
      minimizable: true
    },
    position: {
      width: 460,
      height: "auto"
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: WelcomeApp.onSubmitForm
    },
    actions: {
      openSpotlight: WelcomeApp.onOpenSpotlight,
      dismiss: WelcomeApp.onDismiss
    }
  };

  static PARTS = {
    main: {
      root: true,
      template: "modules/claim-the-moment/templates/welcome.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      isGM: game.user.isGM,
      tokenControlsIcon: TOKEN_CONTROLS_ICON,
      spotlightControlIcon: SPOTLIGHT_CONTROL_ICON
    };
  }

  async _preClose(options) {
    await this.preferenceWriter.flush();
    return super._preClose(options);
  }

  static async onSubmitForm(event) {
    const target = event.target;
    if (target?.name !== "skipWelcome") return false;

    const showWelcome = target.checked !== true;
    const saved = await this.preferenceWriter.write(SHOW_WELCOME_SETTING, showWelcome);
    if (!saved) target.checked = showWelcome;
    return saved;
  }

  static async onOpenSpotlight() {
    this.controller.openWindow();
    await this.close();
  }

  static async onDismiss() {
    await this.close();
  }
}
