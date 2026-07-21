import { ARTWORK_CREDITS, SOUND_CREDITS } from "./asset-credits.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CreditsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "claim-the-moment-credits",
    classes: ["claim-the-moment", "ctm-credits-app"],
    tag: "div",
    window: {
      title: "CTM.Credits.Title",
      icon: "fa-solid fa-copyright",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 620,
      height: 640
    }
  };

  static PARTS = {
    main: {
      root: true,
      template: "modules/claim-the-moment/templates/credits.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      artworkCredits: ARTWORK_CREDITS,
      soundCredits: SOUND_CREDITS,
      attributionsUrl: "modules/claim-the-moment/ATTRIBUTIONS.md"
    };
  }
}
