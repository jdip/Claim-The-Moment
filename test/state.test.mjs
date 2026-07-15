import assert from "node:assert/strict";
import test from "node:test";

import { AWARD_REASON, ROUND_STATUS } from "../scripts/constants.mjs";
import {
  awardSpotlight,
  chooseFallbackWinner,
  createInitialState,
  getPlayerCount,
  handSpotlight,
  isPlayerEligible,
  normalizeState,
  resetPlayerCounts,
  setPlayerCount,
  setPlayerEligibility,
  startRound,
  takeSpotlight
} from "../scripts/state.mjs";

test("normalization clamps malformed counts and preserves default eligibility", () => {
  const state = normalizeState({
    revision: -2,
    counts: { a: -4, b: 2.9, c: "7", d: "nope" },
    eligible: { a: false },
    round: { status: "invalid" }
  });

  assert.deepEqual(state.counts, { a: 0, b: 2, c: 7, d: 0 });
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.revision, 0);
  assert.equal(state.round.status, ROUND_STATUS.IDLE);
  assert.equal(state.round.fallbackExcludedUserId, null);
  assert.equal(isPlayerEligible(state, "a"), false);
  assert.equal(isPlayerEligible(state, "new-player"), true);
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
