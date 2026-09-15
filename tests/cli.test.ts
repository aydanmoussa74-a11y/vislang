import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

function run(args: string[], options: { input?: string; env?: NodeJS.ProcessEnv } = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], {
    encoding: "utf8",
    input: options.input,
    cwd: root,
    env: { ...process.env, NO_COLOR: "1", ...(options.env ?? {}) },
  });
}

function minimal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vislang: "0.1",
    id: "example",
    name: "Example",
    version: "0.1.0",
    status: "draft",
    binds: {
      tokens: { format: "none" },
      roles: [{ role: "action.primary", required: true, fallback: "#000000" }],
    },
    invariants: [{
      id: "INV-PRIMARY-01",
      statement: "One primary action role is bound.",
      severity: "error",
      applies_to: [{}],
      predicate: { kind: "single_primary_action_role", role: "action.primary" },
    }],
    ...overrides,
  };
}

function writeJson(dir: string, name: string, value: unknown): string {
  const file = path.join(dir, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

test("validate valid constitution exits 0", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "ok.json", minimal());
  const result = run(["validate", file]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /valid/);
});

test("validate invalid constitution exits 1", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "bad.json", minimal({ vislang: "0.2" }));
  const result = run(["validate", file]);
  assert.equal(result.status, 1);
});

test("validate missing file exits 2", () => {
  assert.equal(run(["validate", path.join(tmpdir(), "missing-vislang.json")]).status, 2);
});

test("validate stdin works", () => {
  assert.equal(run(["validate", "-"], { input: JSON.stringify(minimal()) }).status, 0);
});

test("validate JSON output", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "ok.json", minimal());
  const result = run(["validate", file, "--json"]);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("validate --quiet suppresses success stdout", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "ok.json", minimal());
  const result = run(["validate", file, "--quiet"]);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("help exits 0", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: vislang/);
});

test("short help exits 0", () => {
  assert.equal(run(["-h"]).status, 0);
});

test("unknown command exits 64", () => {
  assert.equal(run(["nope"]).status, 64);
});

test("diff no changes exits 0", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "a.json", minimal());
  assert.equal(run(["diff", file, file]).status, 0);
});

test("diff nonbreaking name change exits 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", minimal({ name: "Renamed" }))]).status, 0);
});

test("diff additive role exits 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal();
  (next.binds as { roles: object[] }).roles.push({ role: "action.secondary", required: false, fallback: "#111" });
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next)]).status, 0);
});

test("diff breaking exits 3", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal();
  (next.invariants as Array<Record<string, unknown>>)[0].predicate = { kind: "role_bound", role: "action.primary" };
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next)]).status, 3);
});

test("diff invalid old exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal({ vislang: "0.2" })), writeJson(dir, "new.json", minimal())]).status, 2);
});

test("diff mismatched ids exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", minimal({ id: "other-app" }))]).status, 2);
});

test("diff JSON output", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "a.json", minimal());
  const body = JSON.parse(run(["diff", file, file, "--json"]).stdout);
  assert.equal(body.aggregate, "nonbreaking");
  assert.equal(body.semver_ok, true);
});

test("diff stdin old", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "new.json", minimal({ name: "Renamed" }));
  assert.equal(run(["diff", "-", file], { input: JSON.stringify(minimal()) }).status, 0);
});

test("diff both stdin exits 64", () => {
  assert.equal(run(["diff", "-", "-"]).status, 64);
});

test("require-semver additive patch-only exits 3", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal({ version: "0.1.1" });
  (next.binds as { roles: object[] }).roles.push({ role: "action.secondary", required: false, fallback: "#111" });
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next), "--require-semver"]).status, 3);
});

test("require-semver additive minor bump passes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal({ version: "0.2.0" });
  (next.binds as { roles: object[] }).roles.push({ role: "action.secondary", required: false, fallback: "#111" });
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next), "--require-semver"]).status, 0);
});

test("require-semver breaking major bump is semver_ok but still exits 3", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal({ version: "1.0.0" });
  (next.invariants as Array<Record<string, unknown>>)[0].predicate = { kind: "role_bound", role: "action.primary" };
  const result = run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next), "--require-semver", "--json"]);
  const body = JSON.parse(result.stdout);
  assert.equal(result.status, 3);
  assert.equal(body.semver_ok, true);
});

test("require-semver breaking same version exits 3", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  const next = minimal();
  (next.invariants as Array<Record<string, unknown>>)[0].predicate = { kind: "role_bound", role: "action.primary" };
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", next), "--require-semver"]).status, 3);
});

function pathChangePair() {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  writeFileSync(path.join(dir, "a.json"), "{}");
  writeFileSync(path.join(dir, "b.json"), "{}");
  const oldDoc = minimal();
  const newDoc = minimal();
  (oldDoc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "a.json" };
  (newDoc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "b.json" };
  for (const doc of [oldDoc, newDoc]) {
    (doc.binds as { roles: Array<Record<string, unknown>> }).roles[0] = {
      role: "action.primary", required: true, token: "color.action.primary",
    };
  }
  return { oldFile: writeJson(dir, "old.json", oldDoc), newFile: writeJson(dir, "new.json", newDoc) };
}

test("unknown path change exits 3", () => {
  const pair = pathChangePair();
  assert.equal(run(["diff", pair.oldFile, pair.newFile]).status, 3);
});

test("allow-unknown keeps unknown items but exits 0 when only unknown", () => {
  const pair = pathChangePair();
  const result = run(["diff", pair.oldFile, pair.newFile, "--allow-unknown", "--json"]);
  const body = JSON.parse(result.stdout);
  assert.equal(result.status, 0);
  assert.equal(body.aggregate, "nonbreaking");
  assert.ok(body.unknown.length > 0);
});

test("allow-unknown plus require-semver uses effective class", () => {
  const pair = pathChangePair();
  const result = run(["diff", pair.oldFile, pair.newFile, "--allow-unknown", "--require-semver", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).semver_ok, true);
});

test("unknown without major bump fails require-semver", () => {
  const pair = pathChangePair();
  assert.equal(run(["diff", pair.oldFile, pair.newFile, "--require-semver"]).status, 3);
});

test("init writes default constitution", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  assert.equal(run(["init", dir]).status, 0);
  assert.equal(run(["validate", path.join(dir, "vislang.json")]).status, 0);
});

test("init --id and --name", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  assert.equal(run(["init", dir, "--id", "workout-pwa", "--name", "Workout"]).status, 0);
  const body = JSON.parse(readFileSync(path.join(dir, "vislang.json"), "utf8"));
  assert.equal(body.id, "workout-pwa");
  assert.equal(body.name, "Workout");
});

test("init refuses overwrite without --force", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  writeFileSync(path.join(dir, "vislang.json"), "{}");
  assert.equal(run(["init", dir]).status, 2);
});

test("init --force overwrites", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-cli-"));
  writeFileSync(path.join(dir, "vislang.json"), "{}");
  const result = run(["init", dir, "--force", "--json"]);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("init bad --id exits 64", () => {
  assert.equal(run(["init", mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "--id", "1bad"]).status, 64);
});

test("json stdout has no ANSI", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "ok.json", minimal());
  assert.doesNotMatch(run(["validate", file, "--json"], { env: { NO_COLOR: "" } }).stdout, /\u001b/);
});

test("NO_COLOR disables color on human output", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-cli-")), "bad.json", minimal({ vislang: "0.2" }));
  assert.doesNotMatch(run(["validate", file], { env: { NO_COLOR: "1" } }).stderr, /\u001b/);
});
