import {
  RECENT_REQUEST_LIMIT,
  REQUEST,
  REQUEST_RETRY_MS,
  REQUEST_TIMEOUT_MS,
  SOCKET_NAME
} from "./constants.mjs";

function trimMap(map, limit = RECENT_REQUEST_LIMIT) {
  while (map.size > limit) map.delete(map.keys().next().value);
}

export class SpotlightProtocol {
  constructor({
    clientId,
    authority,
    isAuthority,
    processRequest,
    onFailure = () => {},
    retryMs = REQUEST_RETRY_MS,
    timeoutMs = REQUEST_TIMEOUT_MS
  }) {
    this.clientId = clientId;
    this.authority = authority;
    this.isAuthority = isAuthority ?? (() => authority.isAuthorityClient);
    this.processRequest = processRequest;
    this.onFailure = onFailure;
    this.retryMs = retryMs;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.inFlight = new Map();
    this.completed = new Map();
  }

  request(command, data = {}) {
    if (!this.authority.hasActiveGM) return Promise.resolve(false);

    const requestId = foundry.utils.randomID();
    const message = {
      command,
      requestId,
      senderId: game.user.id,
      senderClientId: this.clientId,
      ...data
    };

    return new Promise((resolve) => {
      this.pending.set(requestId, {
        message,
        resolve,
        deadline: Date.now() + this.timeoutMs,
        timer: null,
        dispatchedLocally: false
      });
      this._dispatch(requestId);
    });
  }

  receive(message) {
    if (!message || typeof message !== "object") return false;
    if (message.command === REQUEST.RESULT) return this._receiveResult(message);
    if (typeof message.requestId !== "string" || !message.requestId) return false;

    if (!this.isAuthority()) return false;
    void this._runAsAuthority(message);
    return true;
  }

  retryPending() {
    for (const requestId of this.pending.keys()) this._dispatch(requestId);
  }

  dispose() {
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.resolve(false);
    }
    this.pending.clear();
    this.inFlight.clear();
    this.completed.clear();
  }

  _dispatch(requestId) {
    const entry = this.pending.get(requestId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);

    if (Date.now() >= entry.deadline) {
      this.pending.delete(requestId);
      entry.resolve(false);
      this.onFailure("timeout");
      return;
    }

    if (this.isAuthority()) {
      if (!entry.dispatchedLocally) {
        entry.dispatchedLocally = true;
        void this._runAsAuthority(entry.message);
      }
    } else {
      game.socket.emit(SOCKET_NAME, entry.message);
    }

    entry.timer = setTimeout(() => this._dispatch(requestId), this.retryMs);
  }

  async _runAsAuthority(message) {
    const cached = this.completed.get(message.requestId);
    if (cached) {
      this._sendResult(message, cached);
      return cached;
    }

    const existing = this.inFlight.get(message.requestId);
    if (existing) {
      const result = await existing;
      this._sendResult(message, result);
      return result;
    }

    const processing = Promise.resolve()
      .then(() => this.processRequest(message))
      .then((ok) => ({ ok: ok === true, errorCode: ok === true ? null : "rejected" }))
      .catch((error) => {
        console.error("claim-the-moment | Spotlight request failed", error);
        return { ok: false, errorCode: "operationFailed" };
      });
    this.inFlight.set(message.requestId, processing);

    const result = await processing;
    this.inFlight.delete(message.requestId);
    this.completed.set(message.requestId, result);
    trimMap(this.completed);
    this._sendResult(message, result);
    return result;
  }

  _sendResult(request, result) {
    const message = {
      command: REQUEST.RESULT,
      requestId: request.requestId,
      recipientId: request.senderId,
      recipientClientId: request.senderClientId,
      responderId: game.user.id,
      responderClientId: this.clientId,
      ok: result.ok === true,
      errorCode: result.errorCode ?? null
    };

    if (request.senderClientId === this.clientId) this._receiveResult(message);
    else game.socket.emit(SOCKET_NAME, message);
  }

  _receiveResult(message) {
    const responder = game.users.get(message?.responderId);
    if (!responder?.active || !responder.isGM) return false;
    if (message.recipientId !== game.user.id || message.recipientClientId !== this.clientId) return false;
    const entry = this.pending.get(message.requestId);
    if (!entry) return false;

    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(message.requestId);
    entry.resolve(message.ok === true);
    if (message.errorCode === "operationFailed") this.onFailure(message.errorCode);
    return true;
  }
}
