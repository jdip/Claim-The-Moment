import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateUrl = new URL("../templates/spotlight.hbs", import.meta.url);
const applicationUrl = new URL("../scripts/spotlight-app.mjs", import.meta.url);
const entrypointUrl = new URL("../scripts/claim-the-moment.mjs", import.meta.url);
const stylesheetUrl = new URL("../styles/claim-the-moment.css", import.meta.url);

test("the spotlight window omits the decorative module header", async () => {
  const template = await readFile(templateUrl, "utf8");

  assert.doesNotMatch(template, /ctm-hero/);
  assert.doesNotMatch(template, /CTM\.Window\.Heading/);
});

test("the winner stage renders configured winner artwork", async () => {
  const template = await readFile(templateUrl, "utf8");

  assert.match(template, /winnerImage/);
  assert.match(template, /ctm-winner-avatar/);
  assert.match(template, /winnerIsGM/);
});

test("the contention checkbox uses Foundry's native ApplicationV2 action dispatch", async () => {
  const [template, application] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8")
  ]);

  assert.match(template, /data-action="toggleEligibility"/);
  assert.match(application, /toggleEligibility:\s*SpotlightApp\.onToggleEligibility/);
  assert.doesNotMatch(application, /querySelectorAll\("\[data-eligible-user\]"\)/);
});

test("eligible player rows expose the native GM handoff action", async () => {
  const [template, application] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8")
  ]);

  assert.match(template, /\{\{#if eligible\}\}[\s\S]*?data-action="handSpotlight"[\s\S]*?data-player-id="\{\{id\}\}"/);
  assert.match(application, /handSpotlight:\s*SpotlightApp\.onHandSpotlight/);
  assert.match(application, /requestHandSpotlight\(target\.dataset\.playerId\)/);
});

test("every window exposes one streamlined persistent volume popover", async () => {
  const [template, application, entrypoint, stylesheet] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8"),
    readFile(entrypointUrl, "utf8"),
    readFile(stylesheetUrl, "utf8")
  ]);

  assert.match(template, /class="ctm-volume-trigger"/);
  assert.match(template, /popovertarget="ctm-volume-popover"/);
  assert.doesNotMatch(template, /class="ctm-volume-trigger"[^>]*data-tooltip/);
  assert.match(template, /popover="auto"/);
  assert.match(template, /data-sound-volume/);
  assert.match(template, /data-volume-popover/);
  assert.doesNotMatch(template, /toggleSounds|MuteSounds|UnmuteSounds|ctm-volume-widget/);
  assert.doesNotMatch(application, /toggleSounds|onToggleSounds|setSoundsMuted/);
  assert.match(application, /this\.controller\.setSoundVolume\(volume\)/);
  assert.match(entrypoint, /register\(MODULE_ID, SOUND_VOLUME_SETTING,[\s\S]*?scope: "user"[\s\S]*?config: false/);
  assert.match(stylesheet, /left:\s*anchor\(right\)[\s\S]*?transform:\s*translate\(-100%, -100%\)/);

  const footerIndex = template.indexOf('class="ctm-footer-tools"');
  const resetIndex = template.indexOf('data-action="resetCounts"');
  const soundIndex = template.indexOf('class="ctm-audio-preference"');
  assert.ok(footerIndex > template.indexOf('class="ctm-roster"'));
  assert.ok(resetIndex > footerIndex);
  assert.ok(soundIndex > resetIndex, "the GM reset control precedes the bottom-right sound control");
});

test("manual count edits use ApplicationV2 submit-on-change instead of custom listeners", async () => {
  const [template, application] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8")
  ]);

  assert.match(template, /name="count\.\{\{id\}\}"/);
  assert.match(application, /tag:\s*"form"/);
  assert.match(application, /submitOnChange:\s*true/);
  assert.match(application, /handler:\s*SpotlightApp\.onSubmitForm/);
  assert.doesNotMatch(application, /_attachPartListeners/);
});
