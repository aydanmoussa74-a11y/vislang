import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MAX_BYTES, parseJsonBytes } from "../src/parse.ts";
import { validateConstitution } from "../src/validate.ts";
import { validateDtcgBoundary } from "../src/dtcg.ts";
import type { Constitution } from "../src/types.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src/cli.ts");

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

function run(args: string[], options: { input?: Buffer | string } = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", cli, ...args], {
    encoding: "utf8",
    input: options.input,
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

test("4E valid ASCII constitution from bytes", () => {
  assert.equal(validateConstitution(Buffer.from(JSON.stringify(minimal()), "utf8"), { file: "ascii.json" }).ok, true);
});

test("4E valid Unicode and emoji name", () => {
  assert.equal(validateConstitution(Buffer.from(JSON.stringify(minimal({ name: "\u8bad\u7ec3\ud83d\udcaa Workout" })), "utf8"), { file: "unicode.json" }).ok, true);
});

test("4E BOM-prefixed bytes remain valid", () => {
  const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(minimal()), "utf8")]);
  assert.equal(validateConstitution(body, { file: "bom.json" }).ok, true);
});

test("4E malformed continuation byte is E_UTF8", () => {
  assert.equal(parseJsonBytes(Buffer.from([0x7b, 0x80, 0x7d])).errors[0]?.code, "E_UTF8");
});

test("4E truncated multibyte sequence is E_UTF8", () => {
  assert.equal(parseJsonBytes(Buffer.from([0x22, 0xe2, 0x82])).errors[0]?.code, "E_UTF8");
});

test("4E invalid leading byte is E_UTF8", () => {
  assert.equal(parseJsonBytes(Buffer.from([0xff, 0xfe])).errors[0]?.code, "E_UTF8");
});

test("4E exact size boundary is not E_FILE_TOO_LARGE", () => {
  assert.ok(!parseJsonBytes(Buffer.alloc(MAX_BYTES, 0x20)).errors.some((issue) => issue.code === "E_FILE_TOO_LARGE"));
});

test("4E over-limit bytes are E_FILE_TOO_LARGE", () => {
  assert.equal(parseJsonBytes(Buffer.alloc(MAX_BYTES + 1, 0x20)).errors[0]?.code, "E_FILE_TOO_LARGE");
});

test("4E validate malformed UTF-8 exits 2 not 1", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vislang-4e-")), "bad.json");
  writeFileSync(file, Buffer.from([0x7b, 0x80, 0x7d]));
  assert.equal(run(["validate", file]).status, 2);
});

test("4E validate malformed UTF-8 JSON mode is parseable and not exit 1", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "vislang-4e-")), "bad.json");
  writeFileSync(file, Buffer.from([0xff]));
  const result = run(["validate", file, "--json"]);
  assert.equal(result.status, 2);
  const body = JSON.parse(result.stdout) as { ok: boolean; errors: Array<{ code: string }> };
  assert.equal(body.ok, false);
  assert.equal(body.errors[0]?.code, "E_UTF8");
});

test("4E diff malformed UTF-8 exits 2", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4e-"));
  const good = path.join(dir, "good.json");
  writeFileSync(good, JSON.stringify(minimal()));
  const bad = path.join(dir, "bad.json");
  writeFileSync(bad, Buffer.from([0x80]));
  assert.equal(run(["diff", good, bad]).status, 2);
});

test("4E stdin malformed UTF-8 exits 2", () => {
  assert.equal(run(["validate", "-"], { input: Buffer.from([0xc3]) }).status, 2);
});

test("4E malformed UTF-8 DTCG file is rejected", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4e-"));
  writeFileSync(path.join(dir, "tokens.json"), Buffer.from([0x80]));
  const constitution = path.join(dir, "vislang.json");
  const doc = minimal();
  (doc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens.json" };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles[0] = { role: "action.primary", required: true, token: "color.action.primary" };
  writeFileSync(constitution, JSON.stringify(doc));
  assert.ok(validateDtcgBoundary(doc as Constitution, constitution).some((issue) => issue.code === "E_DTCG_JSON"));
});

test("4E valid Unicode DTCG JSON is accepted", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-4e-"));
  writeFileSync(path.join(dir, "tokens.json"), Buffer.from(JSON.stringify({ note: "ok" }), "utf8"));
  const constitution = path.join(dir, "vislang.json");
  const doc = minimal();
  (doc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens.json" };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles[0] = { role: "action.primary", required: true, token: "color.action.primary" };
  writeFileSync(constitution, JSON.stringify(doc));
  assert.deepEqual(validateDtcgBoundary(doc as Constitution, constitution), []);
});
