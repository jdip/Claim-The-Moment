import { AWARD_REASON, ROUND_STATUS } from "./constants.mjs";

const VALID_STATUSES = new Set(Object.values(ROUND_STATUS));
const VALID_REASONS = new Set(Object.values(AWARD_REASON));

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.trunc(number));
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanString(value) {
  return typeof value === "string" && value.length ? value : null;
}

export function createInitialState() {
  return {
    schemaVersion: 2,
    revision: 0,
    counts: {},
    eligible: {},
    round: {
      id: null,
      status: ROUND_STATUS.IDLE,
      startedAt: null,
      endsAt: null,
      winnerId: null,
      winnerName: null,
      reason: null,
      awardedAt: null,
      fallbackExcludedUserId: null
    }
  };
}

export function normalizeState(value) {
  const initial = createInitialState();
  if (!isRecord(value)) return initial;

  const counts = {};
  if (isRecord(value.counts)) {
    for (const [userId, count] of Object.entries(value.counts)) {
      if (userId) counts[userId] = nonNegativeInteger(count);
    }
  }

  const eligible = {};
  if (isRecord(value.eligible)) {
    for (const [userId, included] of Object.entries(value.eligible)) {
      if (userId) eligible[userId] = included !== false;
    }
  }

  const rawRound = isRecord(value.round) ? value.round : {};
  const status = VALID_STATUSES.has(rawRound.status) ? rawRound.status : ROUND_STATUS.IDLE;
  const reason = VALID_REASONS.has(rawRound.reason) ? rawRound.reason : null;

  return {
    schemaVersion: 2,
    revision: nonNegativeInteger(value.revision),
    counts,
    eligible,
    round: {
      id: cleanString(rawRound.id),
      status,
      startedAt: finiteNumberOrNull(rawRound.startedAt),
      endsAt: finiteNumberOrNull(rawRound.endsAt),
      winnerId: cleanString(rawRound.winnerId),
      winnerName: cleanString(rawRound.winnerName),
      reason,
      awardedAt: finiteNumberOrNull(rawRound.awardedAt),
      fallbackExcludedUserId: cleanString(rawRound.fallbackExcludedUserId)
    }
  };
}

function withRevision(state, changes) {
  const current = normalizeState(state);
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
  const safeDuration = Math.max(0, finiteNumberOrNull(durationMs) ?? 0);
  const priorPlayerWinner = current.round.status === ROUND_STATUS.AWARDED
    && (current.round.reason === AWARD_REASON.CLAIM
      || current.round.reason === AWARD_REASON.AUTOMATIC
      || current.round.reason === AWARD_REASON.HANDOFF)
    ? current.round.winnerId
    : null;
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
      fallbackExcludedUserId: priorPlayerWinner
    }
  });
}

export function awardSpotlight(state, { winnerId, winnerName, reason, awardedAt }) {
  const current = normalizeState(state);
  if (current.round.status !== ROUND_STATUS.OPEN) return current;

  const safeReason = VALID_REASONS.has(reason) ? reason : AWARD_REASON.CLAIM;
  const counts = {
    ...current.counts,
    [winnerId]: getPlayerCount(current, winnerId) + 1
  };

  return withRevision(current, {
    counts,
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
    [winnerId]: getPlayerCount(current, winnerId) + 1
  };

  return withRevision(current, {
    counts,
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
  const uniqueIds = [...new Set(candidateIds)].filter(Boolean).sort();
  if (!uniqueIds.length) return null;

  let minimum = Infinity;
  for (const userId of uniqueIds) minimum = Math.min(minimum, getPlayerCount(state, userId));

  const tied = uniqueIds.filter((userId) => getPlayerCount(state, userId) === minimum);
  const roll = Number(random());
  const normalizedRoll = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999999) : 0;
  return tied[Math.floor(normalizedRoll * tied.length)];
}
