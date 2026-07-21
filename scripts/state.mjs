import { AWARD_REASON, RECENT_REQUEST_LIMIT, ROUND_STATUS } from "./constants.mjs";

const VALID_STATUSES = new Set(Object.values(ROUND_STATUS));
const VALID_REASONS = new Set(Object.values(AWARD_REASON));
export const STATE_SCHEMA_VERSION = 4;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(number)));
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanString(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned.length ? cleaned : null;
}

function idleRound() {
  return {
    id: null,
    status: ROUND_STATUS.IDLE,
    startedAt: null,
    endsAt: null,
    winnerId: null,
    winnerName: null,
    reason: null,
    awardedAt: null,
    fallbackExcludedUserId: null
  };
}

function normalizeRound(rawRound, lastPlayerWinnerId) {
  if (!isRecord(rawRound)) return idleRound();

  const status = VALID_STATUSES.has(rawRound.status) ? rawRound.status : ROUND_STATUS.IDLE;
  if (status === ROUND_STATUS.IDLE) return idleRound();

  const id = cleanString(rawRound.id);
  const startedAt = finiteNumberOrNull(rawRound.startedAt);
  const endsAt = finiteNumberOrNull(rawRound.endsAt);
  const hasValidTimeline = startedAt !== null && endsAt !== null && endsAt > startedAt;
  const hasNoTimeline = startedAt === null && endsAt === null;
  const fallbackExcludedUserId = cleanString(rawRound.fallbackExcludedUserId)
    ?? lastPlayerWinnerId;

  if (status === ROUND_STATUS.OPEN) {
    if (!id || !hasValidTimeline) return idleRound();
    return {
      id,
      status,
      startedAt,
      endsAt,
      winnerId: null,
      winnerName: null,
      reason: null,
      awardedAt: null,
      fallbackExcludedUserId
    };
  }

  if (status === ROUND_STATUS.CANCELLED) {
    if (!id || !hasValidTimeline) return idleRound();
    return {
      id,
      status,
      startedAt,
      endsAt,
      winnerId: null,
      winnerName: null,
      reason: null,
      awardedAt: null,
      fallbackExcludedUserId
    };
  }

  const winnerId = cleanString(rawRound.winnerId);
  const winnerName = cleanString(rawRound.winnerName);
  const reason = VALID_REASONS.has(rawRound.reason) ? rawRound.reason : null;
  const awardedAt = finiteNumberOrNull(rawRound.awardedAt);
  if (!id || !winnerId || !winnerName || !reason || awardedAt === null) return idleRound();
  const isDirectAward = reason === AWARD_REASON.GM || reason === AWARD_REASON.HANDOFF;
  if ((isDirectAward && !hasNoTimeline) || (!isDirectAward && !hasValidTimeline)) return idleRound();
  if (hasValidTimeline && awardedAt < startedAt) return idleRound();

  return {
    id,
    status,
    startedAt,
    endsAt,
    winnerId,
    winnerName,
    reason,
    awardedAt,
    fallbackExcludedUserId
  };
}

export function createInitialState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: 0,
    counts: {},
    eligible: {},
    processedRequestIds: [],
    lastPlayerWinnerId: null,
    round: idleRound()
  };
}

export function migrateState(value) {
  if (!isRecord(value)) return createInitialState();
  const sourceVersion = nonNegativeInteger(value.schemaVersion);
  if (sourceVersion >= STATE_SCHEMA_VERSION) return value;

  const rawRound = isRecord(value.round) ? value.round : {};
  const awardedPlayerWinnerId = rawRound.status === ROUND_STATUS.AWARDED
    && (rawRound.reason === AWARD_REASON.CLAIM
      || rawRound.reason === AWARD_REASON.AUTOMATIC
      || rawRound.reason === AWARD_REASON.HANDOFF)
    ? cleanString(rawRound.winnerId)
    : null;
  const isLegacyDirectAward = sourceVersion <= 2
    && rawRound.status === ROUND_STATUS.AWARDED
    && (rawRound.reason === AWARD_REASON.GM || rawRound.reason === AWARD_REASON.HANDOFF)
    && Number(rawRound.startedAt) === 0
    && Number(rawRound.endsAt) === 0;

  return {
    ...value,
    schemaVersion: STATE_SCHEMA_VERSION,
    round: isLegacyDirectAward
      ? { ...rawRound, startedAt: null, endsAt: null }
      : rawRound,
    lastPlayerWinnerId: cleanString(value.lastPlayerWinnerId)
      ?? awardedPlayerWinnerId
      ?? cleanString(rawRound.fallbackExcludedUserId)
  };
}

export function normalizeState(value) {
  const initial = createInitialState();
  const migrated = migrateState(value);
  if (!isRecord(migrated)) return initial;

  const counts = {};
  if (isRecord(migrated.counts)) {
    for (const [userId, count] of Object.entries(migrated.counts)) {
      if (userId) counts[userId] = nonNegativeInteger(count);
    }
  }

  const eligible = {};
  if (isRecord(migrated.eligible)) {
    for (const [userId, included] of Object.entries(migrated.eligible)) {
      if (userId) eligible[userId] = included !== false;
    }
  }

  const processedRequestIds = [];
  if (Array.isArray(migrated.processedRequestIds)) {
    for (const value of migrated.processedRequestIds) {
      const requestId = cleanString(value);
      if (!requestId) continue;
      const duplicateIndex = processedRequestIds.indexOf(requestId);
      if (duplicateIndex >= 0) processedRequestIds.splice(duplicateIndex, 1);
      processedRequestIds.push(requestId);
    }
  }

  const rawRound = isRecord(migrated.round) ? migrated.round : {};
  const lastPlayerWinnerId = cleanString(migrated.lastPlayerWinnerId);

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    revision: nonNegativeInteger(migrated.revision),
    counts,
    eligible,
    processedRequestIds: processedRequestIds.slice(-RECENT_REQUEST_LIMIT),
    lastPlayerWinnerId,
    round: normalizeRound(rawRound, lastPlayerWinnerId)
  };
}

function withRevision(current, changes) {
  return {
    ...current,
    ...changes,
    revision: current.revision + 1
  };
}

export function getPlayerCount(state, userId) {
  return normalizeState(state).counts[userId] ?? 0;
}

export function isPlayerEligible(state, userId) {
  return normalizeState(state).eligible[userId] !== false;
}

export function hasProcessedRequest(state, requestId) {
  const cleaned = cleanString(requestId);
  return Boolean(cleaned && normalizeState(state).processedRequestIds.includes(cleaned));
}

export function recordProcessedRequest(state, requestId) {
  const current = normalizeState(state);
  const cleaned = cleanString(requestId);
  if (!cleaned) return current;
  return {
    ...current,
    processedRequestIds: [
      ...current.processedRequestIds.filter((existing) => existing !== cleaned),
      cleaned
    ].slice(-RECENT_REQUEST_LIMIT)
  };
}

export function setPlayerCount(state, userId, count) {
  const current = normalizeState(state);
  return withRevision(current, {
    counts: {
      ...current.counts,
      [userId]: nonNegativeInteger(count)
    }
  });
}

export function setPlayerEligibility(state, userId, included) {
  const current = normalizeState(state);
  return withRevision(current, {
    eligible: {
      ...current.eligible,
      [userId]: Boolean(included)
    }
  });
}

export function resetPlayerCounts(state, userIds = []) {
  const current = normalizeState(state);
  const counts = { ...current.counts };
  for (const userId of new Set([...Object.keys(counts), ...userIds])) counts[userId] = 0;
  return withRevision(current, { counts });
}

export function startRound(state, { roundId, startedAt, durationMs }) {
  const current = normalizeState(state);
  const safeStartedAt = finiteNumberOrNull(startedAt) ?? Date.now();
  const safeDuration = Math.max(1, finiteNumberOrNull(durationMs) ?? 1);
  return withRevision(current, {
    round: {
      id: String(roundId),
      status: ROUND_STATUS.OPEN,
      startedAt: safeStartedAt,
      endsAt: safeStartedAt + safeDuration,
      winnerId: null,
      winnerName: null,
      reason: null,
      awardedAt: null,
      fallbackExcludedUserId: current.lastPlayerWinnerId
    }
  });
}

export function awardSpotlight(state, { winnerId, winnerName, reason, awardedAt }) {
  const current = normalizeState(state);
  if (current.round.status !== ROUND_STATUS.OPEN) return current;

  const safeReason = reason === AWARD_REASON.AUTOMATIC ? reason : AWARD_REASON.CLAIM;
  const counts = {
    ...current.counts,
    [winnerId]: nonNegativeInteger((current.counts[winnerId] ?? 0) + 1)
  };
  return withRevision(current, {
    counts,
    lastPlayerWinnerId: String(winnerId),
    round: {
      ...current.round,
      status: ROUND_STATUS.AWARDED,
      winnerId,
      winnerName: String(winnerName),
      reason: safeReason,
      awardedAt: finiteNumberOrNull(awardedAt) ?? Date.now()
    }
  });
}

export function takeSpotlight(state, { roundId, winnerId, winnerName, awardedAt }) {
  const current = normalizeState(state);
  return withRevision(current, {
    round: {
      id: String(roundId),
      status: ROUND_STATUS.AWARDED,
      startedAt: null,
      endsAt: null,
      winnerId: String(winnerId),
      winnerName: String(winnerName),
      reason: AWARD_REASON.GM,
      awardedAt: finiteNumberOrNull(awardedAt) ?? Date.now(),
      fallbackExcludedUserId: null
    }
  });
}

export function handSpotlight(state, { roundId, winnerId, winnerName, awardedAt }) {
  const current = normalizeState(state);
  const counts = {
    ...current.counts,
    [winnerId]: nonNegativeInteger((current.counts[winnerId] ?? 0) + 1)
  };

  return withRevision(current, {
    counts,
    lastPlayerWinnerId: String(winnerId),
    round: {
      id: String(roundId),
      status: ROUND_STATUS.AWARDED,
      startedAt: null,
      endsAt: null,
      winnerId: String(winnerId),
      winnerName: String(winnerName),
      reason: AWARD_REASON.HANDOFF,
      awardedAt: finiteNumberOrNull(awardedAt) ?? Date.now(),
      fallbackExcludedUserId: null
    }
  });
}

export function cancelRound(state) {
  const current = normalizeState(state);
  if (current.round.status !== ROUND_STATUS.OPEN) return current;
  return withRevision(current, {
    round: {
      ...current.round,
      status: ROUND_STATUS.CANCELLED,
      winnerId: null,
      winnerName: null,
      reason: null,
      awardedAt: null
    }
  });
}

export function chooseFallbackWinner(state, candidateIds, random = Math.random) {
  const current = normalizeState(state);
  const uniqueIds = [...new Set(candidateIds)].filter(Boolean).sort();
  if (!uniqueIds.length) return null;

  let minimum = Infinity;
  for (const userId of uniqueIds) minimum = Math.min(minimum, current.counts[userId] ?? 0);

  const tied = uniqueIds.filter((userId) => (current.counts[userId] ?? 0) === minimum);
  const roll = Number(random());
  const normalizedRoll = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999999) : 0;
  return tied[Math.floor(normalizedRoll * tied.length)];
}

export function pruneUnknownPlayers(state, validPlayerIds = []) {
  const current = normalizeState(state);
  const validIds = new Set(validPlayerIds.filter(Boolean));
  const counts = Object.fromEntries(Object.entries(current.counts)
    .filter(([userId]) => validIds.has(userId)));
  const eligible = Object.fromEntries(Object.entries(current.eligible)
    .filter(([userId]) => validIds.has(userId)));
  const lastPlayerWinnerId = validIds.has(current.lastPlayerWinnerId)
    ? current.lastPlayerWinnerId
    : null;
  const fallbackExcludedUserId = validIds.has(current.round.fallbackExcludedUserId)
    ? current.round.fallbackExcludedUserId
    : lastPlayerWinnerId;

  const unchanged = JSON.stringify(counts) === JSON.stringify(current.counts)
    && JSON.stringify(eligible) === JSON.stringify(current.eligible)
    && lastPlayerWinnerId === current.lastPlayerWinnerId
    && fallbackExcludedUserId === current.round.fallbackExcludedUserId;
  if (unchanged) return current;

  return withRevision(current, {
    counts,
    eligible,
    lastPlayerWinnerId,
    round: {
      ...current.round,
      fallbackExcludedUserId
    }
  });
}
