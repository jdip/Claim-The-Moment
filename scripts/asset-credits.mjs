const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const CC_BY_3_URL = "https://creativecommons.org/licenses/by/3.0/";
const CC_BY_4_URL = "https://creativecommons.org/licenses/by/4.0/";

export const ARTWORK_CREDITS = Object.freeze([
  Object.freeze({
    file: "assets/gm-skull.svg, assets/gm-skull.png",
    title: "Daemon skull",
    titleUrl: "https://game-icons.net/1x1/lorc/daemon-skull.html",
    creator: "Lorc",
    creatorUrl: "https://lorcblog.blogspot.com/",
    source: "Game-icons.net",
    sourceUrl: "https://game-icons.net/",
    license: "CC BY 3.0",
    licenseUrl: CC_BY_3_URL,
    noteKey: "CTM.Credits.Notes.GMIcon",
    note: "The adaptation changes the original icon's colors to a pale lavender foreground (`#e9d5ff`) on a dark purple background (`#210b35`). The PNG is a 512-by-512 rasterization of the recolored SVG. No generative AI was used for these adaptations."
  })
]);

export const SOUND_CREDITS = Object.freeze([
  Object.freeze({
    roleKey: "CTM.Credits.Roles.Throw",
    file: "sounds/spotlight-alert.flac",
    title: "Braam",
    titleUrl: "https://freesound.org/people/unfa/sounds/647712/",
    creator: "unfa",
    creatorUrl: "https://freesound.org/people/unfa/",
    source: "Freesound",
    sourceUrl: "https://freesound.org/",
    license: "CC0 1.0",
    licenseUrl: CC0_URL,
    noteKey: "CTM.Credits.Notes.Unchanged",
    note: "It is used unchanged."
  }),
  Object.freeze({
    roleKey: "CTM.Credits.Roles.PlayerClaim",
    file: "sounds/player-claim-horn.mp3",
    title: "tadaa.wav",
    titleUrl: "https://freesound.org/people/Maikkihapsis/sounds/626950/",
    creator: "Maikkihapsis",
    creatorUrl: "https://freesound.org/people/Maikkihapsis/",
    source: "Freesound",
    sourceUrl: "https://freesound.org/",
    license: "CC0 1.0",
    licenseUrl: CC0_URL,
    noteKey: "CTM.Credits.Notes.UnchangedPreview",
    note: "It is used as the unchanged published high-quality preview."
  }),
  Object.freeze({
    roleKey: "CTM.Credits.Roles.Automatic",
    file: "sounds/automatic-selection.mp3",
    title: "String Wow",
    titleUrl: "https://freesound.org/people/akelley6/sounds/825586/",
    creator: "akelley6",
    creatorUrl: "https://freesound.org/people/akelley6/",
    source: "Freesound",
    sourceUrl: "https://freesound.org/",
    license: "CC BY 4.0",
    licenseUrl: CC_BY_4_URL,
    noteKey: "CTM.Credits.Notes.UnchangedPreview",
    note: "It is used as the unchanged published high-quality preview."
  }),
  Object.freeze({
    roleKey: "CTM.Credits.Roles.GMTake",
    file: "sounds/gm-take-horn.mp3",
    title: "Short scary violins.wav",
    titleUrl: "https://freesound.org/people/Victor_Natas/sounds/554754/",
    creator: "Victor_Natas",
    creatorUrl: "https://freesound.org/people/Victor_Natas/",
    source: "Freesound",
    sourceUrl: "https://freesound.org/",
    license: "CC BY 4.0",
    licenseUrl: CC_BY_4_URL,
    noteKey: "CTM.Credits.Notes.GMTake",
    note: "The adaptation removes 1.137 seconds of leading silence and re-encodes the audio as MP3; no other creative changes were made."
  })
]);

function markdownCredit(credit) {
  return `\`${credit.file}\` is [${credit.title}](${credit.titleUrl}) by [${credit.creator}](${credit.creatorUrl}), available from [${credit.source}](${credit.sourceUrl}) under [${credit.license}](${credit.licenseUrl}). ${credit.note}`;
}

export function renderAttributionsMarkdown() {
  const artwork = ARTWORK_CREDITS.map(markdownCredit).join("\n\n");
  const audio = SOUND_CREDITS.map((credit) => `- ${markdownCredit(credit)}`).join("\n");
  return `# Third-party asset credits

This document covers the third-party artwork and audio distributed with Claim the Moment. The module's source code remains licensed separately under the MIT License.

## Artwork

${artwork}

## Audio

${audio}

Claim the Moment did not use generative AI to create or adapt any bundled asset.
`;
}
