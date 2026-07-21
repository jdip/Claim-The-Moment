import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));

async function collectModules(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectModules(target));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(target);
  }
  return files;
}

const files = [
  ...await collectModules(path.join(root, "scripts")),
  ...await collectModules(path.join(root, "tools")),
  ...await collectModules(path.join(root, "test"))
].sort();

for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

console.info(`Syntax checked ${files.length} modules.`);
