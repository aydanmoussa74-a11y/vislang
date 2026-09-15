import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateConstitution } from "../src/index.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

test("init validates generated constitution through validateConstitution before success", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-init-"));
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", cli, "init", dir, "--json"],
    { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, cwd: root },
  );
  assert.equal(result.status, 0);
  const file = path.join(dir, "vislang.json");
  const text = readFileSync(file, "utf8");
  const check = validateConstitution(text, { file });
  assert.equal(check.ok, true);
  assert.equal(check.errors.length, 0);
  assert.equal(JSON.parse(result.stdout).ok, true);
});
