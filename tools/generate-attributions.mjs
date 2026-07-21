import { readFile, writeFile } from "node:fs/promises";

import { renderAttributionsMarkdown } from "../scripts/asset-credits.mjs";

const outputUrl = new URL("../ATTRIBUTIONS.md", import.meta.url);
const expected = renderAttributionsMarkdown();

if (process.argv.includes("--check")) {
  const actual = await readFile(outputUrl, "utf8");
  if (actual !== expected) {
    console.error("ATTRIBUTIONS.md is out of date. Run: node tools/generate-attributions.mjs");
    process.exitCode = 1;
  }
} else {
  await writeFile(outputUrl, expected, "utf8");
  console.info("Updated ATTRIBUTIONS.md");
}
