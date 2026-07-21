import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateUrl = new URL("../templates/spotlight.hbs", import.meta.url);
const applicationUrl = new URL("../scripts/spotlight-app.mjs", import.meta.url);
const entrypointUrl = new URL("../scripts/claim-the-moment.mjs", import.meta.url);
const helpApplicationUrl = new URL("../scripts/help-app.mjs", import.meta.url);
const helpTemplateUrl = new URL("../templates/help.hbs", import.meta.url);
const creditsApplicationUrl = new URL("../scripts/credits-app.mjs", import.meta.url);
const assetCreditsUrl = new URL("../scripts/asset-credits.mjs", import.meta.url);
const creditsTemplateUrl = new URL("../templates/credits.hbs", import.meta.url);
const welcomeApplicationUrl = new URL("../scripts/welcome-app.mjs", import.meta.url);
const welcomeTemplateUrl = new URL("../templates/welcome.hbs", import.meta.url);
const stylesheetUrl = new URL("../styles/claim-the-moment.css", import.meta.url);
const onboardingStylesheetUrl = new URL("../styles/onboarding.css", import.meta.url);
const languageUrl = new URL("../lang/en.json", import.meta.url);
const guideUrl = new URL("../docs/USER_GUIDE.md", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const roadmapUrl = new URL("../docs/ONBOARDING_ROADMAP.md", import.meta.url);
const listingUrl = new URL("../docs/FOUNDRY_LISTING.md", import.meta.url);
const mediaPreviewUrl = new URL("../tools/onboarding-media-preview.html", import.meta.url);
const gmScreenshotUrl = new URL("../docs/media/claim-the-moment-gm.png", import.meta.url);
const playerScreenshotUrl = new URL("../docs/media/claim-the-moment-player.png", import.meta.url);
const walkthroughUrl = new URL("../docs/media/claim-the-moment-walkthrough.gif", import.meta.url);
const attributionsUrl = new URL("../ATTRIBUTIONS.md", import.meta.url);
const packageReleaseUrl = new URL("../tools/package-release.sh", import.meta.url);

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

test("repeated roster controls expose player-specific table semantics", async () => {
  const template = await readFile(templateUrl, "utf8");

  assert.match(template, /class="ctm-player-list[^>]*role="table"/);
  assert.match(template, /class="ctm-player-header" role="row"/);
  assert.match(template, /role="columnheader"/);
  assert.match(template, /class="ctm-player-row[^>]*role="row"/);
  assert.match(template, /class="ctm-contention-cell" role="cell"/);
  assert.match(template, /CTM\.Roster\.ToggleFor" name=name/);
  assert.match(template, /CTM\.Roster\.ClaimsFor" name=name/);
  assert.match(template, /CTM\.Roster\.HandSpotlightTo" name=name/);
  assert.match(template, /max="9007199254740991"/);
  assert.doesNotMatch(template, /class="ctm-player-header" aria-hidden/);
});

test("the spotlight window routes its question button to native in-app help", async () => {
  const [template, application, helpApplication, helpTemplate, language] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8"),
    readFile(helpApplicationUrl, "utf8"),
    readFile(helpTemplateUrl, "utf8"),
    readFile(languageUrl, "utf8")
  ]);

  assert.match(template, /class="ctm-help-trigger"[^>]*data-action="openHelp"/);
  assert.match(application, /openHelp:\s*SpotlightApp\.onOpenHelp/);
  assert.match(application, /this\.controller\.openHelp\(\)/);
  assert.match(helpApplication, /class HelpApp extends HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(helpApplication, /tag: "form"/);
  assert.match(helpApplication, /submitOnChange: true/);
  assert.match(helpApplication, /handler: HelpApp\.onSubmitForm/);
  assert.match(helpApplication, /new PreferenceWriter\("the welcome preference"\)/);
  assert.match(helpApplication, /this\.preferenceWriter\.write\(SHOW_WELCOME_SETTING, showWelcome\)/);
  assert.match(helpApplication, /await this\.preferenceWriter\.flush\(\)/);
  assert.match(helpTemplate, /CTM\.Help\.Opening\.Title/);
  assert.match(helpTemplate, /data-action="openSpotlight"/);
  assert.match(helpTemplate, /name="showWelcomeOnLogin"/);
  assert.match(helpTemplate, /\{\{checked showWelcomeOnLogin\}\}/);
  assert.match(language, /"Toggle": "Show welcome window on login"/);
});

test("the Help footer opens a complete native credits and licenses window", async () => {
  const [controller, helpApplication, helpTemplate, creditsApplication, assetCredits, creditsTemplate, attributions, readme, packageRelease, stylesheet] = await Promise.all([
    readFile(new URL("../scripts/spotlight-controller.mjs", import.meta.url), "utf8"),
    readFile(helpApplicationUrl, "utf8"),
    readFile(helpTemplateUrl, "utf8"),
    readFile(creditsApplicationUrl, "utf8"),
    readFile(assetCreditsUrl, "utf8"),
    readFile(creditsTemplateUrl, "utf8"),
    readFile(attributionsUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(packageReleaseUrl, "utf8"),
    readFile(onboardingStylesheetUrl, "utf8")
  ]);

  assert.match(helpTemplate, /class="ctm-help-credit-link"[^>]*data-action="openCredits"/);
  assert.match(helpApplication, /openCredits:\s*HelpApp\.onOpenCredits/);
  assert.match(helpApplication, /this\.controller\.openCredits\(\)/);
  assert.match(controller, /this\.creditsApp = new CreditsApp\(\)/);
  assert.match(controller, /openCredits\(\) \{[\s\S]*?this\.creditsApp\.render\(\{ force: true \}\)/);
  assert.match(creditsApplication, /class CreditsApp extends HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(creditsApplication, /template: "modules\/claim-the-moment\/templates\/credits\.hbs"/);
  assert.match(creditsApplication, /attributionsUrl: "modules\/claim-the-moment\/ATTRIBUTIONS\.md"/);
  assert.match(creditsTemplate, /artworkCredits/);
  assert.match(creditsTemplate, /soundCredits/);
  assert.match(creditsTemplate, /rel="noopener"/);
  for (const requiredCredit of ["Daemon skull", "Lorc", "Braam", "unfa", "tadaa.wav", "Maikkihapsis", "String Wow", "akelley6", "Short scary violins.wav", "Victor_Natas"]) {
    assert.match(`${assetCredits}\n${attributions}`, new RegExp(requiredCredit.replace(".", "\\.")));
  }
  assert.match(creditsApplication, /import \{ ARTWORK_CREDITS, SOUND_CREDITS \} from "\.\/asset-credits\.mjs"/);
  assert.equal(assetCredits.match(/roleKey:/g)?.length, 4, "only the four active sound cues are credited");
  assert.match(attributions, /CC BY 3\.0/);
  assert.match(attributions, /CC BY 4\.0/);
  assert.match(attributions, /CC0 1\.0/);
  assert.match(attributions, /removes 1\.137 seconds of leading silence/);
  assert.match(attributions, /did not use generative AI/);
  assert.match(readme, /Credits & licenses[\s\S]*?ATTRIBUTIONS\.md|ATTRIBUTIONS\.md[\s\S]*?Credits & licenses/);
  assert.match(packageRelease, /ATTRIBUTIONS\.md/);
  assert.match(stylesheet, /\.claim-the-moment\.ctm-credits-app \.window-content \{[\s\S]*?padding: 18px 20px;/);
});

test("every module entry point uses the centralized Person Rays control icon", async () => {
  const [constants, entrypoint, application, welcomeApplication, helpTemplate, welcomeTemplate, language] = await Promise.all([
    readFile(new URL("../scripts/constants.mjs", import.meta.url), "utf8"),
    readFile(entrypointUrl, "utf8"),
    readFile(applicationUrl, "utf8"),
    readFile(welcomeApplicationUrl, "utf8"),
    readFile(helpTemplateUrl, "utf8"),
    readFile(welcomeTemplateUrl, "utf8"),
    readFile(languageUrl, "utf8")
  ]);

  assert.match(constants, /TOKEN_CONTROLS_ICON = "fa-solid fa-user-large"/);
  assert.match(constants, /SPOTLIGHT_CONTROL_ICON = "fa-solid fa-person-rays"/);
  assert.match(entrypoint, /icon: SPOTLIGHT_CONTROL_ICON/);
  assert.match(application, /icon: SPOTLIGHT_CONTROL_ICON/);
  assert.match(welcomeApplication, /icon: SPOTLIGHT_CONTROL_ICON/);
  for (const instructionalTemplate of [helpTemplate, welcomeTemplate]) {
    assert.match(instructionalTemplate, /class="ctm-control-path/);
    assert.match(instructionalTemplate, /class="\{\{tokenControlsIcon\}\}"/);
    assert.match(instructionalTemplate, /class="\{\{spotlightControlIcon\}\}"/);
    assert.match(instructionalTemplate, /CTM\.Help\.Opening\.Controls/);
    assert.match(instructionalTemplate, /CTM\.Help\.Opening\.Button/);
    assert.doesNotMatch(instructionalTemplate, /fa-arrow-pointer/);
  }
  assert.match(language, /"Button": "Claim the Moment button"/);

  for (const source of [constants, entrypoint, application, welcomeApplication, helpTemplate, welcomeTemplate, language]) {
    assert.doesNotMatch(source, /wand-and-sparkles|fa-wand-sparkles/i);
  }
});

test("the full user guide is prominent in the README and packaged help covers opening the window", async () => {
  const [guide, readme, language] = await Promise.all([
    readFile(guideUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
    readFile(languageUrl, "utf8")
  ]);

  assert.match(readme, /New to Claim the Moment[\s\S]*?docs\/USER_GUIDE\.md/);
  assert.match(readme, /\?[^\n]*button inside the module window/);
  assert.match(guide, /## Opening Claim the Moment/);
  assert.match(guide, /Token Controls/);
  assert.match(guide, /\*\*Claim the Moment\*\* button/);
  assert.match(guide, /## Player quick start/);
  assert.match(guide, /## GM quick start/);
  assert.match(language, /"ShowWelcome"/);
  assert.match(language, /"OpenPath": "Open Token Controls/);
});

test("the completed onboarding roadmap ships reproducible, listing-ready walkthrough media", async () => {
  const [readme, roadmap, listing, preview, gmScreenshot, playerScreenshot, walkthrough] = await Promise.all([
    readFile(readmeUrl, "utf8"),
    readFile(roadmapUrl, "utf8"),
    readFile(listingUrl, "utf8"),
    readFile(mediaPreviewUrl, "utf8"),
    readFile(gmScreenshotUrl),
    readFile(playerScreenshotUrl),
    readFile(walkthroughUrl)
  ]);

  assert.doesNotMatch(roadmap, /- \[ \]/);
  assert.match(readme, /!\[Animated walkthrough[^\]]+\]\(docs\/media\/claim-the-moment-walkthrough\.gif\)/);
  assert.match(readme, /!\[GM view[^\]]+\]\(docs\/media\/claim-the-moment-gm\.png\)/);
  assert.match(readme, /!\[Player view[^\]]+\]\(docs\/media\/claim-the-moment-player\.png\)/);
  assert.match(listing, /claim-the-moment-walkthrough\.gif/);
  assert.match(listing, /claim-the-moment-gm\.png/);
  assert.match(listing, /claim-the-moment-player\.png/);
  assert.match(preview, /ctm-eligible-count/);
  assert.match(preview, /ctm-help-trigger/);
  assert.match(preview, /state-winner/);
  assert.ok(gmScreenshot.byteLength > 40_000);
  assert.ok(playerScreenshot.byteLength > 40_000);
  assert.ok(walkthrough.byteLength > 100_000);
});

test("login onboarding is a reversible per-user preference", async () => {
  const [entrypoint, controller, welcomeApplication, welcomeTemplate] = await Promise.all([
    readFile(entrypointUrl, "utf8"),
    readFile(new URL("../scripts/spotlight-controller.mjs", import.meta.url), "utf8"),
    readFile(welcomeApplicationUrl, "utf8"),
    readFile(welcomeTemplateUrl, "utf8")
  ]);

  assert.match(entrypoint, /register\(MODULE_ID, SHOW_WELCOME_SETTING,[\s\S]*?scope: "user"[\s\S]*?config: true[\s\S]*?default: true/);
  assert.match(entrypoint, /controller\.showWelcomeIfNeeded\(\)/);
  assert.match(controller, /this\.welcomeApp = new WelcomeApp\(this\)/);
  assert.match(controller, /this\.welcomeApp\.render\(\{ force: true \}\)/);
  assert.doesNotMatch(controller, /DialogV2\.wait\(/);
  assert.match(welcomeApplication, /class WelcomeApp extends HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(welcomeApplication, /tag: "form"/);
  assert.match(welcomeApplication, /submitOnChange: true/);
  assert.match(welcomeApplication, /handler: WelcomeApp\.onSubmitForm/);
  assert.match(welcomeApplication, /async _preClose\(options\) \{[\s\S]*?await this\.preferenceWriter\.flush\(\)/);
  assert.match(welcomeApplication, /this\.preferenceWriter\.write\(SHOW_WELCOME_SETTING, showWelcome\)/);
  assert.match(welcomeTemplate, /name="skipWelcome"/);
  assert.match(welcomeTemplate, /data-action="openSpotlight"/);
});

test("Foundry Configure Controls exposes guarded open and claim shortcuts", async () => {
  const [entrypoint, guide] = await Promise.all([
    readFile(entrypointUrl, "utf8"),
    readFile(guideUrl, "utf8")
  ]);

  assert.match(entrypoint, /keybindings\.register\(MODULE_ID, "openWindow"/);
  assert.match(entrypoint, /editable: \[\{ key: "KeyM", modifiers: \["Shift"\] \}\]/);
  assert.match(entrypoint, /keybindings\.register\(MODULE_ID, "claimSpotlight"/);
  assert.match(entrypoint, /editable: \[\{ key: "KeyC", modifiers: \["Shift"\] \}\]/);
  assert.match(entrypoint, /if \(!controller \|\| game\.user\.isGM\) return false/);
  assert.match(entrypoint, /state\.round\.status !== ROUND_STATUS\.OPEN/);
  assert.match(entrypoint, /!controller\.isUserEligible\(game\.user, state\)/);
  assert.match(guide, /Shift\+M/);
  assert.match(guide, /Shift\+C/);
  assert.match(guide, /Configure Controls/);
});

test("readiness guidance communicates eligibility instead of relying on disabled buttons", async () => {
  const template = await readFile(templateUrl, "utf8");

  assert.match(template, /ctm-eligible-count/);
  assert.match(template, /\{\{eligibleCount\}\} \{\{localize "CTM\.Roster\.Eligible"\}\}/);
  assert.match(template, /\{\{localize throwDisabledReason\}\}/);
  assert.match(template, /CTM\.Readiness\.EnablePlayer/);
  assert.match(template, /CTM\.Readiness\.WaitForGM/);
  assert.match(template, /CTM\.Roster\.EmptyGM/);
});

test("empty roster and help content retain comfortable interior spacing", async () => {
  const [language, mainStylesheet, onboardingStylesheet] = await Promise.all([
    readFile(languageUrl, "utf8"),
    readFile(stylesheetUrl, "utf8"),
    readFile(onboardingStylesheetUrl, "utf8")
  ]);
  assert.match(language, /"Hint": "Set contention, edit totals, or reset all\."/);
  assert.match(mainStylesheet, /\.ctm-empty-roster \{[\s\S]*?padding: 16px 20px;/);
  assert.match(
    onboardingStylesheet,
    /\.claim-the-moment\.ctm-help-app \.window-content,\s*\.claim-the-moment\.ctm-credits-app \.window-content \{[\s\S]*?padding: 18px 20px;/
  );
  assert.match(mainStylesheet, /\.claim-the-moment \.window-content \{[\s\S]*?container-type: inline-size;/);
  assert.match(mainStylesheet, /@container ctm-window \(max-width: 420px\)/);
});

test("the welcome dialog insets both its content and action row", async () => {
  const [welcomeApplication, stylesheet] = await Promise.all([
    readFile(welcomeApplicationUrl, "utf8"),
    readFile(onboardingStylesheetUrl, "utf8")
  ]);

  assert.match(welcomeApplication, /classes: \["claim-the-moment", "ctm-onboarding-dialog"\]/);
  assert.match(stylesheet, /\.claim-the-moment\.ctm-onboarding-dialog \.window-content \{[\s\S]*?padding: 16px 18px;/);
  assert.match(stylesheet, /\.ctm-onboarding \{[\s\S]*?padding: 0;/);
  assert.match(stylesheet, /\.ctm-onboarding-frame \{[\s\S]*?gap: 0;[\s\S]*?width: 100%;/);
  assert.match(stylesheet, /\.claim-the-moment\.ctm-onboarding-dialog \.ctm-onboarding-actions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?width: 100%;[\s\S]*?padding: 16px 0 0;/);
  assert.match(stylesheet, /\.claim-the-moment\.ctm-onboarding-dialog \.ctm-onboarding-actions > button \{[\s\S]*?justify-content: center;[\s\S]*?width: 100%;[\s\S]*?min-height: 40px;/);
  assert.match(stylesheet, /@container ctm-window \(max-width: 420px\)[\s\S]*?\.claim-the-moment\.ctm-onboarding-dialog \.ctm-onboarding-actions \{ grid-template-columns: 1fr; \}/);
});

test("the visual countdown announces at most once per displayed second", async () => {
  const [template, application, stylesheet] = await Promise.all([
    readFile(templateUrl, "utf8"),
    readFile(applicationUrl, "utf8"),
    readFile(stylesheetUrl, "utf8")
  ]);

  assert.doesNotMatch(template, /<section class="ctm-stage" aria-live/);
  assert.match(template, /class="ctm-countdown"[^>]*aria-hidden="true"/);
  assert.match(template, /data-countdown-announcement[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(template, /ctm-stage-copy" aria-live="polite" aria-atomic="true"/);
  assert.match(application, /this\._lastAnnouncedSecond = null/);
  assert.match(application, /seconds !== this\._lastAnnouncedSecond/);
  assert.match(application, /game\.i18n\.format\("CTM\.Status\.CountdownAnnouncement", \{ seconds \}\)/);
  assert.match(stylesheet, /\.claim-the-moment button:focus-visible/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/);
});
