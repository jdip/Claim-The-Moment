import {
  GM_AUTHORITY_SETTLE_MS,
  GM_PRESENCE_INTERVAL_MS,
  GM_PRESENCE_TIMEOUT_MS,
  REQUEST,
  SOCKET_NAME
} from "./constants.mjs";

export class GMAuthority {
  constructor(clientId, { onChange = () => {} } = {}) {
    this.clientId = clientId;
    this.onChange = onChange;
    this.clients = new Map();
    this.authorityClientId = null;
    this.candidateSince = 0;
    this.presenceTimer = null;
    this.settleTimer = null;
    this.lastAuthorityState = false;
  }

  get primaryGMUser() {
    return game.users
      .filter((user) => user.active && user.isGM)
      .sort((left, right) => (right.role - left.role) || left.id.localeCompare(right.id))[0] ?? null;
  }

  get hasActiveGM() {
    return Boolean(this.primaryGMUser);
  }

  get isAuthorityClient() {
    if (!game.user.isGM) return false;
    this.refresh();
    return this._isSettledAuthority(Date.now());
  }

  start() {
    if (!game.user.isGM || this.presenceTimer) return;
    this.record(game.user.id, this.clientId);
    this.broadcast(true);
    this.refresh();
    this.presenceTimer = setInterval(() => {
      this.record(game.user.id, this.clientId);
      this.broadcast(false);
      this.refresh();
    }, GM_PRESENCE_INTERVAL_MS);
    this.presenceTimer.unref?.();
  }

  dispose() {
    if (this.presenceTimer) clearInterval(this.presenceTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.presenceTimer = null;
    this.settleTimer = null;
    this.clients.clear();
    this.authorityClientId = null;
    this.candidateSince = 0;
    this.lastAuthorityState = false;
  }

  onUserConnectionChanged() {
    if (game.user.isGM) this.broadcast(true);
    return this.refresh();
  }

  broadcast(requestReply) {
    if (!game.user.isGM) return false;
    this.record(game.user.id, this.clientId);
    game.socket.emit(SOCKET_NAME, {
      command: REQUEST.GM_PRESENCE,
      senderId: game.user.id,
      clientId: this.clientId,
      requestReply: requestReply === true
    });
    return true;
  }

  receive(message) {
    const sender = game.users.get(message?.senderId);
    if (!sender?.active || !sender.isGM || typeof message.clientId !== "string" || !message.clientId) {
      return false;
    }

    this.record(sender.id, message.clientId);
    if (message.requestReply === true && game.user.isGM) this.broadcast(false);
    this.refresh();
    return true;
  }

  record(userId, clientId) {
    this.clients.set(clientId, { userId, lastSeen: Date.now() });
  }

  refresh() {
    const now = Date.now();
    const activeGMIds = new Set(game.users
      .filter((user) => user.active && user.isGM)
      .map((user) => user.id));

    if (game.user.isGM && activeGMIds.has(game.user.id) && !this.clients.has(this.clientId)) {
      this.record(game.user.id, this.clientId);
    }

    for (const [clientId, presence] of this.clients) {
      if (!activeGMIds.has(presence.userId) || now - presence.lastSeen > GM_PRESENCE_TIMEOUT_MS) {
        this.clients.delete(clientId);
      }
    }

    const next = [...this.clients.entries()]
      .map(([clientId, presence]) => ({ clientId, user: game.users.get(presence.userId) }))
      .filter((candidate) => candidate.user?.active && candidate.user.isGM)
      .sort((left, right) => (right.user.role - left.user.role)
        || left.user.id.localeCompare(right.user.id)
        || left.clientId.localeCompare(right.clientId))[0]?.clientId ?? null;

    const previous = this.authorityClientId;
    if (next !== previous) {
      this.authorityClientId = next;
      this.candidateSince = now;
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => this.refresh(), GM_AUTHORITY_SETTLE_MS + 10);
      this.settleTimer.unref?.();
    }
    const isAuthority = this._isSettledAuthority(now);
    if (next !== previous || isAuthority !== this.lastAuthorityState) {
      this.lastAuthorityState = isAuthority;
      this.onChange(previous, next, isAuthority);
    }
    return this.authorityClientId;
  }

  _isSettledAuthority(now) {
    return game.user.isGM
      && this.authorityClientId === this.clientId
      && now - this.candidateSince >= GM_AUTHORITY_SETTLE_MS;
  }
}
