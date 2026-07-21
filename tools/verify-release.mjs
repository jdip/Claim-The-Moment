import { execFileSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ARTWORK_CREDITS, SOUND_CREDITS, renderAttributionsMarkdown } from "../scripts/asset-credits.mjs";
import { DEFAULT_GM_ICON_PATH, MODULE_ID, SOUND_CUES } from "../scripts/constants.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

function fail(message) {
  failures.push(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory, extensions = null) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target, extensions));
    else if (!extensions || extensions.some((extension) => entry.name.endsWith(extension))) files.push(target);
  }
  return files;
}

function flattenKeys(value, prefix = "") {
  const keys = new Set();
  for (const [key, nested] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      for (const child of flattenKeys(nested, fullKey)) keys.add(child);
    } else {
      keys.add(fullKey);
    }
  }
  return keys;
}

function compareVersions(left, right) {
  const a = String(left).split(".").map(Number);
  const b = String(right).split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

async function verifySystemManifestOnline(system) {
  try {
    const response = await fetch(system.manifest, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      fail(`${system.id} manifest returned HTTP ${response.status}: ${system.manifest}`);
      return;
    }

    const manifest = await response.json();
    if (manifest.id !== system.id) {
      fail(`${system.id} relationship resolves to a manifest with id ${manifest.id ?? "<missing>"}.`);
    }
    if (compareVersions(manifest.version, system.compatibility.minimum) < 0) {
      fail(`${system.id} relationship resolves to ${manifest.version ?? "<missing>"}, below minimum ${system.compatibility.minimum}.`);
    }
    if (manifest.version !== system.compatibility.verified) {
      fail(`${system.id} relationship resolves to ${manifest.version ?? "<missing>"}, not verified ${system.compatibility.verified}.`);
    }
  } catch (error) {
    fail(`Could not validate ${system.id} manifest online: ${error.message}`);
  }
}

async function verifyMagic(relativePath) {
  const buffer = await readFile(path.join(root, relativePath));
  const extension = path.extname(relativePath).toLowerCase();
  let valid = true;
  if (extension === ".png") valid = buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  else if (extension === ".gif") valid = ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  else if (extension === ".flac") valid = buffer.subarray(0, 4).toString("ascii") === "fLaC";
  else if (extension === ".mp3") valid = buffer.subarray(0, 3).toString("ascii") === "ID3"
    || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  else if (extension === ".svg") valid = buffer.toString("utf8", 0, 1024).includes("<svg");
  if (!valid) fail(`${relativePath} does not match its filename extension.`);
}

const moduleManifest = JSON.parse(await readFile(path.join(root, "module.json"), "utf8"));
const packageManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const language = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));

if (moduleManifest.id !== MODULE_ID) fail(`module.json id must be ${MODULE_ID}.`);
if (moduleManifest.version !== packageManifest.version) fail("module.json and package.json versions differ.");
if (compareVersions(moduleManifest.compatibility.minimum, moduleManifest.compatibility.verified) > 0) {
  fail("Foundry minimum compatibility exceeds the verified version.");
}

const daggerheart = moduleManifest.relationships?.systems?.find((system) => system.id === "daggerheart");
if (!daggerheart) {
  fail("module.json must declare the Daggerheart system relationship.");
} else {
  if (compareVersions(daggerheart.compatibility.minimum, daggerheart.compatibility.verified) > 0) {
    fail("Daggerheart minimum compatibility exceeds the verified version.");
  }
  const expectedManifest = `https://github.com/Foundryborne/daggerheart/releases/download/${daggerheart.compatibility.verified}/system.json`;
  if (daggerheart.manifest !== expectedManifest) {
    fail(`Daggerheart manifest must be the immutable verified release asset: ${expectedManifest}`);
  }
  if (process.argv.includes("--online")) await verifySystemManifestOnline(daggerheart);
}

for (const relativePath of [...moduleManifest.esmodules, ...moduleManifest.styles, ...moduleManifest.languages.map((entry) => entry.path)]) {
  if (!await exists(relativePath)) fail(`module.json references missing file: ${relativePath}`);
}

const sourceFiles = [
  ...await collectFiles(path.join(root, "scripts"), [".mjs"]),
  ...await collectFiles(path.join(root, "templates"), [".hbs"])
];
const localizationKeys = flattenKeys(language);
const referencedLocalizationKeys = new Set();
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const referenced = source.match(/CTM(?:\.[A-Za-z0-9]+)+/g) ?? [];
  for (const key of new Set(referenced)) {
    referencedLocalizationKeys.add(key);
    if (!localizationKeys.has(key)) fail(`${path.relative(root, file)} references missing localization key ${key}.`);
  }
}
for (const key of localizationKeys) {
  if (key.startsWith("CTM.") && !referencedLocalizationKeys.has(key)) {
    fail(`lang/en.json contains unused localization key ${key}.`);
  }
}

const expectedAttributions = renderAttributionsMarkdown();
const actualAttributions = await readFile(path.join(root, "ATTRIBUTIONS.md"), "utf8");
if (actualAttributions !== expectedAttributions) {
  fail("ATTRIBUTIONS.md is out of date; run node tools/generate-attributions.mjs.");
}

const creditedFiles = [...ARTWORK_CREDITS, ...SOUND_CREDITS]
  .flatMap((credit) => credit.file.split(",").map((file) => file.trim()));
for (const relativePath of creditedFiles) {
  if (!await exists(relativePath)) fail(`Asset credit references missing file: ${relativePath}`);
  else await verifyMagic(relativePath);
}

const defaultAssets = [
  DEFAULT_GM_ICON_PATH,
  ...Object.values(SOUND_CUES).map((cue) => cue.defaultPath)
].map((modulePath) => modulePath.replace(`modules/${MODULE_ID}/`, ""));
for (const relativePath of defaultAssets) {
  if (!await exists(relativePath)) fail(`Default module asset is missing: ${relativePath}`);
  if (!creditedFiles.includes(relativePath)) fail(`Default module asset is not credited: ${relativePath}`);
}

for (const relativePath of [
  "docs/media/claim-the-moment-gm.png",
  "docs/media/claim-the-moment-player.png",
  "docs/media/claim-the-moment-walkthrough.gif"
]) {
  if (!await exists(relativePath)) fail(`README media is missing: ${relativePath}`);
  else await verifyMagic(relativePath);
}

for (const obsoletePath of ["assets/LICENSE.md", "sounds/LICENSE.md", "sounds/spotlight-alert.wav"]) {
  if (await exists(obsoletePath)) fail(`Obsolete packaged asset remains: ${obsoletePath}`);
}

if (process.argv.includes("--dist")) {
  const distManifestPath = path.join(root, "dist/module.json");
  const archivePath = path.join(root, "dist/claim-the-moment.zip");
  if (!await exists("dist/module.json") || !await exists("dist/claim-the-moment.zip")) {
    fail("Release package outputs are missing.");
  } else {
    const distManifest = JSON.parse(await readFile(distManifestPath, "utf8"));
    if (JSON.stringify(distManifest) !== JSON.stringify(moduleManifest)) fail("dist/module.json differs from module.json.");
    const archiveEntries = execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    for (const required of ["module.json", "CHANGELOG.md", "ATTRIBUTIONS.md", "docs/USER_GUIDE.md"]) {
      if (!archiveEntries.includes(required)) fail(`Release archive is missing ${required}.`);
    }
    for (const entry of archiveEntries) {
      if (/^(test|tools|docs\/media)\//.test(entry)) fail(`Release archive contains development-only path: ${entry}`);
      if (/^(assets|sounds)\/LICENSE\.md$/.test(entry)) fail(`Release archive contains duplicate attribution file: ${entry}`);
    }
  }
}

if (process.argv.includes("--release")) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  if (status) fail("Release check requires a clean working tree.");
  const tags = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: root, encoding: "utf8" }).trim().split("\n");
  if (!tags.includes(`v${moduleManifest.version}`)) fail(`HEAD is not tagged v${moduleManifest.version}.`);
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  if (new RegExp(`## ${moduleManifest.version} [^\n]*Unreleased`, "i").test(changelog)) {
    fail(`CHANGELOG.md still marks ${moduleManifest.version} as unreleased.`);
  }
}

if (failures.length) {
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.info("Release metadata and assets verified.");
}
