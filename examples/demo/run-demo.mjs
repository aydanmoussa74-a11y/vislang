#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = path.join(root, "src/cli.ts");
const dir = mkdtempSync(path.join(tmpdir(), "vislang-demo-"));

function vislang(args) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cli, ...args, "--no-color"],
    {
      encoding: "utf8",
      cwd: dir,
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

try {
  process.stdout.write(`# working in ${dir}\n`);
  vislang(["init"]);
  vislang(["validate", "vislang.json"]);

  const constitution = JSON.parse(readFileSync(path.join(dir, "vislang.json"), "utf8"));
  writeFileSync(path.join(dir, "old.json"), `${JSON.stringify(constitution, null, 2)}\n`);
  constitution.binds.roles.push({
    role: "action.secondary",
    required: false,
    fallback: "#5F6368",
  });
  writeFileSync(path.join(dir, "new.json"), `${JSON.stringify(constitution, null, 2)}\n`);

  const code = vislang(["diff", "old.json", "new.json"]);
  process.exitCode = code === 0 ? 0 : code;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
