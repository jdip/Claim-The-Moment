import { MODULE_ID } from "./constants.mjs";

export class PreferenceWriter {
  constructor(description) {
    this.description = description;
    this.tail = Promise.resolve();
  }

  write(setting, value) {
    const operation = this.tail.then(() => game.settings.set(MODULE_ID, setting, value));
    this.tail = operation.catch((error) => {
      console.error(`${MODULE_ID} | Could not update ${this.description}`, error);
      ui.notifications.error(game.i18n.localize("CTM.Notifications.OperationFailed"));
    });
    return operation.then(() => true, () => false);
  }

  async flush() {
    await this.tail;
  }
}
