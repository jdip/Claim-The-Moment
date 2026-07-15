import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateUrl = new URL("../templates/spotlight.hbs", import.meta.url);
const applicationUrl = new URL("../scripts/spotlight-app.mjs", import.meta.url);
const entrypointUrl = new URL("../scripts/claim-the-moment.mjs", import.meta.url);

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

test("every window exposes a persistent per-user sound mute action", async () => {
  const [template, application, entrypoint] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8"),
    readFile(entrypointUrl, "utf8")
  ]);

  assert.match(template, /data-action="toggleSounds"/);
  assert.match(application, /toggleSounds:\s*SpotlightApp\.onToggleSounds/);
  assert.match(entrypoint, /register\(MODULE_ID, MUTE_SOUNDS_SETTING,[\s\S]*?scope: "user"[\s\S]*?config: false/);
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
