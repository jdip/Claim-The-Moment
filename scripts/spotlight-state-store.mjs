import { MODULE_ID, STATE_SETTING } from "./constants.mjs";
import { normalizeState, pruneUnknownPlayers } from "./state.mjs";

function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class SpotlightStateStore {
  constructor({ isAuthority, onChanged }) {
    this.isAuthority = isAuthority;
    this.onChanged = onChanged;
    this.snapshot = null;
  }

  get state() {
    if (!this.snapshot) this.snapshot = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
    return this.snapshot;
  }

  initialize() {
    this.snapshot = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
    return this.state;
  }

  onSettingChanged(rawState) {
    const next = normalizeState(rawState);
    const previous = this.snapshot;
    if (previous && next.revision < previous.revision) return false;
    if (previous && statesEqual(previous, next)) return false;

    this.snapshot = next;
    this.onChanged(previous, next);
    return true;
  }

  async save(nextState, { expectedRevision = null } = {}) {
    if (!this.isAuthority()) return false;

    const current = this.state;
    const next = normalizeState(nextState);
    const expected = expectedRevision ?? next.revision - 1;
    if (current.revision !== expected || next.revision !== expected + 1) return false;
    if (!this.isAuthority()) return false;

    try {
      const saved = await game.settings.set(MODULE_ID, STATE_SETTING, next);
      this.onSettingChanged(saved ?? next);
      return statesEqual(this.state, next);
    } catch (error) {
      const persisted = normalizeState(game.settings.get(MODULE_ID, STATE_SETTING));
      const previous = this.snapshot;
      this.snapshot = persisted;
      if (previous && !statesEqual(previous, persisted)) this.onChanged(previous, persisted);
      throw error;
    }
  }

  async prune(validPlayerIds) {
    const current = this.state;
    const next = pruneUnknownPlayers(current, validPlayerIds);
    if (statesEqual(current, next)) return false;
    return this.save(next, { expectedRevision: current.revision });
  }
}
