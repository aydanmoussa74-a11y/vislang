import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

function run(args: string[], options: { input?: string; cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", ...(options.env ?? {}) };
  return spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], {
    encoding: "utf8",
    input: options.input,
    cwd: options.cwd ?? root,
    env,
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

function onlyJson(stdout: string): unknown {
  const parsed = JSON.parse(stdout);
  assert.equal(stdout.trim().slice(-1), "}");
  return parsed;
}

function withDtcg(dir: string, tokenFile: string): Record<string, unknown> {
  writeFileSync(path.join(dir, tokenFile), "{}");
  const doc = minimal();
  (doc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: tokenFile };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles[0] = {
    role: "action.primary", required: true, token: "color.action.primary",
  };
  return doc;
}

test("4D missing command with flags exits 64", () => { assert.equal(run(["--quiet"]).status, 64); });
test("4D unknown flag exits 64", () => { assert.equal(run(["validate", "x.json", "--wat"]).status, 64); });
test("4D missing --id value exits 64", () => { assert.equal(run(["init", "--id"]).status, 64); });
test("4D too many validate operands exits 64", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "a.json", minimal());
  assert.equal(run(["validate", file, file]).status, 64);
});
test("4D too many diff operands exits 64", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "a.json", minimal());
  assert.equal(run(["diff", file, file, file]).status, 64);
});
test("4D too many init operands exits 64", () => { assert.equal(run(["init", "a", "b"]).status, 64); });
test("4D validate rejects --require-semver", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "a.json", minimal());
  assert.equal(run(["validate", file, "--require-semver"]).status, 64);
});
test("4D init rejects --allow-unknown", () => {
  assert.equal(run(["init", mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "--allow-unknown"]).status, 64);
});
test("4D diff new from stdin works", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const result = run(["diff", writeJson(dir, "old.json", minimal()), "-"], { input: JSON.stringify(minimal({ name: "Renamed" })) });
  assert.equal(result.status, 0);
});
test("4D stdin DTCG constitution exits 2", () => {
  const doc = minimal();
  (doc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens.json" };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles[0] = { role: "action.primary", required: true, token: "color.action.primary" };
  assert.equal(run(["validate", "-"], { input: JSON.stringify(doc) }).status, 2);
});
test("4D invalid validate --json stdout is only JSON", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "bad.json", minimal({ vislang: "0.2" }));
  const result = run(["validate", file, "--json"]);
  assert.equal((onlyJson(result.stdout) as { ok: boolean }).ok, false);
  assert.equal(result.status, 1);
});
test("4D --quiet --json still prints JSON", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "ok.json", minimal());
  const result = run(["validate", file, "--quiet", "--json"]);
  assert.equal((onlyJson(result.stdout) as { ok: boolean }).ok, true);
});
test("4D --no-color emits no ANSI", () => {
  const env = { ...process.env }; delete env.NO_COLOR;
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "bad.json", minimal({ vislang: "0.2" }));
  const result = run(["validate", file, "--no-color"], { env });
  assert.doesNotMatch(result.stderr + result.stdout, /\u001b/);
});
test("4D allow-unknown + additive is effective additive", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const oldDoc = withDtcg(dir, "a.json");
  const newDoc = withDtcg(dir, "b.json");
  (newDoc.binds as { roles: object[] }).roles.push({ role: "action.secondary", required: false, token: "color.action.secondary" });
  const result = run(["diff", writeJson(dir, "old.json", oldDoc), writeJson(dir, "new.json", newDoc), "--allow-unknown", "--json"]);
  const body = onlyJson(result.stdout) as { aggregate: string; unknown: unknown[]; additive: unknown[] };
  assert.equal(result.status, 0);
  assert.equal(body.aggregate, "additive");
  assert.ok(body.unknown.length > 0);
  assert.ok(body.additive.length > 0);
});
test("4D allow-unknown + breaking stays breaking", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const oldDoc = withDtcg(dir, "a.json");
  const newDoc = withDtcg(dir, "b.json");
  (newDoc.invariants as Array<Record<string, unknown>>)[0].predicate = { kind: "role_bound", role: "action.primary" };
  const result = run(["diff", writeJson(dir, "old.json", oldDoc), writeJson(dir, "new.json", newDoc), "--allow-unknown", "--json"]);
  const body = onlyJson(result.stdout) as { aggregate: string; unknown: unknown[] };
  assert.equal(result.status, 3);
  assert.equal(body.aggregate, "breaking");
  assert.ok(body.unknown.length > 0);
});
test("4D require-semver nonbreaking downgrade exits 3", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const result = run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", minimal({ name: "Renamed", version: "0.0.9" })), "--require-semver", "--json"]);
  const body = onlyJson(result.stdout) as { aggregate: string; semver_ok: boolean };
  assert.equal(result.status, 3);
  assert.equal(body.aggregate, "nonbreaking");
  assert.equal(body.semver_ok, false);
});
test("4D require-semver nonbreaking compatible bump exits 0", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", minimal({ name: "Renamed", version: "0.1.1" })), "--require-semver"]).status, 0);
});
test("4D invalid new constitution exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), writeJson(dir, "new.json", minimal({ vislang: "0.2" }))]).status, 2);
});
test("4D malformed JSON exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const file = path.join(dir, "bad.json"); writeFileSync(file, "{not-json");
  assert.equal(run(["validate", file]).status, 2);
});
test("4D diff missing file exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  assert.equal(run(["diff", writeJson(dir, "old.json", minimal()), path.join(dir, "missing.json")]).status, 2);
});
test("4D init default directory writes only vislang.json", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  assert.equal(run(["init"], { cwd: dir }).status, 0);
  assert.deepEqual(readdirSync(dir).sort(), ["vislang.json"]);
});
test("4D init output is deterministic", () => {
  const a = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  const b = mkdtempSync(path.join(tmpdir(), "vislang-4d-"));
  assert.equal(run(["init", a, "--id", "same-id", "--name", "Same"]).status, 0);
  assert.equal(run(["init", b, "--id", "same-id", "--name", "Same"]).status, 0);
  assert.equal(readFileSync(path.join(a, "vislang.json"), "utf8"), readFileSync(path.join(b, "vislang.json"), "utf8"));
});
test("4D JSON validate is deterministic", () => {
  const file = writeJson(mkdtempSync(path.join(tmpdir(), "vislang-4d-")), "ok.json", minimal());
  const first = run(["validate", file, "--json"]);
  const second = run(["validate", file, "--json"]);
  assert.equal(first.stdout, second.stdout);
  onlyJson(first.stdout);
});
