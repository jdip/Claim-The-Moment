import assert from "node:assert/strict";
import test from "node:test";

import { AWARD_REASON, ROUND_STATUS } from "../scripts/constants.mjs";
import {
  awardSpotlight,
  cancelRound,
  chooseFallbackWinner,
  createInitialState,
  getPlayerCount,
  hasProcessedRequest,
  handSpotlight,
  isPlayerEligible,
  migrateState,
  normalizeState,
  pruneUnknownPlayers,
  recordProcessedRequest,
  resetPlayerCounts,
  setPlayerCount,
  setPlayerEligibility,
  startRound,
  takeSpotlight
} from "../scripts/state.mjs";

test("schema migration explicitly preserves the latest v2 player winner", () => {
  const migrated = migrateState({
    schemaVersion: 2,
    revision: 9,
    counts: { ada: 2 },
    eligible: {},
    round: {
      id: "old-award",
      status: ROUND_STATUS.AWARDED,
      winnerId: "ada",
      winnerName: "Ada",
      reason: AWARD_REASON.CLAIM,
      awardedAt: 1_500,
      fallbackExcludedUserId: null
    }
  });

  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.lastPlayerWinnerId, "ada");
  assert.equal(normalizeState(migrated).lastPlayerWinnerId, "ada");
});

test("normalization clamps malformed counts and preserves default eligibility", () => {
  const state = normalizeState({
    revision: -2,
    counts: { a: -4, b: 2.9, c: "7", d: "nope" },
    eligible: { a: false },
    round: { status: "invalid" }
  });

  assert.deepEqual(state.counts, { a: 0, b: 2, c: 7, d: 0 });
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.revision, 0);
  assert.equal(state.round.status, ROUND_STATUS.IDLE);
  assert.equal(state.round.fallbackExcludedUserId, null);
  assert.equal(isPlayerEligible(state, "a"), false);
  assert.equal(isPlayerEligible(state, "new-player"), true);
});

test("processed request ids are normalized, deduplicated, and recorded without changing the revision", () => {
  const initial = normalizeState({
    schemaVersion: 3,
    revision: 7,
    processedRequestIds: [" first ", "second", "first", "", null]
  });
  assert.deepEqual(initial.processedRequestIds, ["second", "first"]);
  assert.equal(hasProcessedRequest(initial, "first"), true);
  assert.equal(hasProcessedRequest(initial, "missing"), false);

  const recorded = recordProcessedRequest(initial, "third");
  assert.equal(recorded.revision, 7);
  assert.deepEqual(recorded.processedRequestIds, ["second", "first", "third"]);
});

test("normalization preserves null timestamps and rejects inconsistent round shapes", () => {
  const initial = normalizeState(createInitialState());
  assert.equal(initial.round.startedAt, null);
  assert.equal(initial.round.endsAt, null);
  assert.equal(initial.round.awardedAt, null);

  const malformedOpen = normalizeState({
    round: {
      id: "bad-open",
      status: ROUND_STATUS.OPEN,
      startedAt: 1000,
      endsAt: null
    }
  });
  assert.equal(malformedOpen.round.status, ROUND_STATUS.IDLE);

  const malformedAward = normalizeState({
    round: {
      id: "bad-award",
      status: ROUND_STATUS.AWARDED,
      winnerId: "ada",
      winnerName: "Ada",
      reason: AWARD_REASON.CLAIM,
      awardedAt: null
    }
  });
  assert.equal(malformedAward.round.status, ROUND_STATUS.IDLE);

  const malformedCancelled = normalizeState({
    round: {
      id: "bad-cancelled",
      status: ROUND_STATUS.CANCELLED,
      startedAt: null,
      endsAt: null
    }
  });
  assert.equal(malformedCancelled.round.status, ROUND_STATUS.IDLE);

  const partialDirectAward = normalizeState({
    round: {
      id: "bad-direct-award",
      status: ROUND_STATUS.AWARDED,
      startedAt: 1000,
      endsAt: null,
      winnerId: "gm",
      winnerName: "GM",
      reason: AWARD_REASON.GM,
      awardedAt: 1500
    }
  });
  assert.equal(partialDirectAward.round.status, ROUND_STATUS.IDLE);
});

test("v2 migration repairs zeroed null timestamps for direct awards", () => {
  const migrated = normalizeState({
    schemaVersion: 2,
    round: {
      id: "legacy-gm-take",
      status: ROUND_STATUS.AWARDED,
      startedAt: 0,
      endsAt: 0,
      winnerId: "gm",
      winnerName: "GM",
      reason: AWARD_REASON.GM,
      awardedAt: 1500
    }
  });

  assert.equal(migrated.round.status, ROUND_STATUS.AWARDED);
  assert.equal(migrated.round.startedAt, null);
  assert.equal(migrated.round.endsAt, null);
});

test("fallback chooses the sole least-served eligible candidate", () => {
  let state = createInitialState();
  state = setPlayerCount(state, "ada", 3);
  state = setPlayerCount(state, "bea", 1);
  state = setPlayerCount(state, "cy", 2);

  assert.equal(chooseFallbackWinner(state, ["ada", "bea", "cy"], () => 0.99), "bea");
});

test("fallback breaks least-served ties with the supplied random source", () => {
  let state = createInitialState();
  state = setPlayerCount(state, "ada", 1);
  state = setPlayerCount(state, "bea", 1);
  state = setPlayerCount(state, "cy", 4);

  assert.equal(chooseFallbackWinner(state, ["cy", "bea", "ada"], () => 0), "ada");
  assert.equal(chooseFallbackWinner(state, ["cy", "bea", "ada"], () => 0.75), "bea");
});

test("a new round remembers the player who held the immediately prior spotlight", () => {
  let state = startRound(createInitialState(), {
    roundId: "prior-round",
    startedAt: 1000,
    durationMs: 5000
  });
  state = awardSpotlight(state, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: AWARD_REASON.CLAIM,
    awardedAt: 1500
  });

  const next = startRound(state, {
    roundId: "next-round",
    startedAt: 2000,
    durationMs: 5000
  });

  assert.equal(next.round.fallbackExcludedUserId, "ada");
  assert.equal(next.lastPlayerWinnerId, "ada");
});

test("a cancelled round does not erase the previous player fallback exclusion", () => {
  let state = startRound(createInitialState(), {
    roundId: "awarded-round",
    startedAt: 1000,
    durationMs: 5000
  });
  state = awardSpotlight(state, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: AWARD_REASON.CLAIM,
    awardedAt: 1500
  });
  state = startRound(state, {
    roundId: "cancelled-round",
    startedAt: 2000,
    durationMs: 5000
  });
  state = cancelRound(state);
  state = startRound(state, {
    roundId: "next-round",
    startedAt: 3000,
    durationMs: 5000
  });

  assert.equal(state.lastPlayerWinnerId, "ada");
  assert.equal(state.round.fallbackExcludedUserId, "ada");
});

test("a new round does not exclude a prior GM spotlight holder", () => {
  const gmState = takeSpotlight(createInitialState(), {
    roundId: "gm-round",
    winnerId: "gm",
    winnerName: "Game Master",
    awardedAt: 1000
  });
  const next = startRound(gmState, {
    roundId: "next-round",
    startedAt: 2000,
    durationMs: 5000
  });

  assert.equal(next.round.fallbackExcludedUserId, null);
});

test("a direct GM handoff awards from any round state and becomes the next fallback exclusion", () => {
  let state = setPlayerCount(createInitialState(), "ada", 2);
  state = startRound(state, { roundId: "open-round", startedAt: 1000, durationMs: 5000 });

  const handed = handSpotlight(state, {
    roundId: "direct-handoff",
    winnerId: "ada",
    winnerName: "Ada",
    awardedAt: 1200
  });

  assert.equal(handed.round.id, "direct-handoff");
  assert.equal(handed.round.status, ROUND_STATUS.AWARDED);
  assert.equal(handed.round.reason, AWARD_REASON.HANDOFF);
  assert.equal(handed.round.winnerId, "ada");
  assert.equal(getPlayerCount(handed, "ada"), 3);

  const next = startRound(handed, {
    roundId: "next-round",
    startedAt: 2000,
    durationMs: 5000
  });
  assert.equal(next.round.fallbackExcludedUserId, "ada");
});

test("awarding an open round increments exactly one player", () => {
  const initial = setPlayerCount(createInitialState(), "ada", 2);
  const open = startRound(initial, { roundId: "round-1", startedAt: 1000, durationMs: 5000 });
  const awarded = awardSpotlight(open, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: AWARD_REASON.CLAIM,
    awardedAt: 1500
  });

  assert.equal(getPlayerCount(awarded, "ada"), 3);
  assert.equal(awarded.round.status, ROUND_STATUS.AWARDED);
  assert.equal(awarded.round.winnerName, "Ada");
  assert.equal(getPlayerCount(open, "ada"), 2, "the prior state remains unchanged");

  const duplicate = awardSpotlight(awarded, {
    winnerId: "ada",
    winnerName: "Ada",
    reason: AWARD_REASON.CLAIM,
    awardedAt: 1600
  });
  assert.equal(getPlayerCount(duplicate, "ada"), 3, "a closed round cannot award twice");
});

test("GM edits, exclusions, and reset are represented in persistent state", () => {
  let state = createInitialState();
  state = setPlayerCount(state, "ada", 8);
  state = setPlayerEligibility(state, "ada", false);
  state = resetPlayerCounts(state, ["ada", "bea"]);

  assert.equal(getPlayerCount(state, "ada"), 0);
  assert.equal(getPlayerCount(state, "bea"), 0);
  assert.equal(isPlayerEligible(state, "ada"), false);
});

test("the GM can take the spotlight from any round state without changing player counts", () => {
  let state = setPlayerCount(createInitialState(), "ada", 3);
  state = startRound(state, { roundId: "open-round", startedAt: 1000, durationMs: 5000 });

  const taken = takeSpotlight(state, {
    roundId: "gm-take",
    winnerId: "gm",
    winnerName: "Game Master",
    awardedAt: 1200
  });

  assert.equal(taken.round.id, "gm-take");
  assert.equal(taken.round.status, ROUND_STATUS.AWARDED);
  assert.equal(taken.round.reason, AWARD_REASON.GM);
  assert.equal(taken.round.winnerId, "gm");
  assert.equal(taken.round.winnerName, "Game Master");
  assert.equal(getPlayerCount(taken, "ada"), 3);
});

test("pruning removes deleted players without removing current players", () => {
  let state = setPlayerCount(createInitialState(), "ada", 2);
  state = setPlayerCount(state, "deleted", 7);
  state = setPlayerEligibility(state, "ada", false);
  state = setPlayerEligibility(state, "deleted", false);
  state = startRound(state, { roundId: "round", startedAt: 1000, durationMs: 5000 });
  state = awardSpotlight(state, {
    winnerId: "deleted",
    winnerName: "Deleted Player",
    reason: AWARD_REASON.CLAIM,
    awardedAt: 1200
  });

  const pruned = pruneUnknownPlayers(state, ["ada"]);

  assert.deepEqual(pruned.counts, { ada: 2 });
  assert.deepEqual(pruned.eligible, { ada: false });
  assert.equal(pruned.lastPlayerWinnerId, null);
});
