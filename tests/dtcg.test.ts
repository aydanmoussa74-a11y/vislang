import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateConstitution } from "../src/index.ts";

function constitution(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vislang: "0.1",
    id: "token-app",
    name: "Token App",
    version: "0.1.0",
    status: "draft",
    binds: {
      tokens: {
        format: "dtcg-2025.10",
        path: "tokens.json",
      },
      roles: [
        {
          role: "action.primary",
          required: true,
          token: "color.action.primary",
        },
      ],
    },
    invariants: [
      {
        id: "INV-PRIMARY-01",
        statement: "Primary action role is bound.",
        severity: "error",
        applies_to: [{}],
        predicate: { kind: "role_bound", role: "action.primary" },
      },
    ],
    ...overrides,
  };
}

function writeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-dtcg-"));
  for (const [relative, body] of Object.entries(files)) {
    const full = path.join(dir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

test("1. valid readable DTCG JSON file", () => {
  const doc = constitution();
  const dir = writeTree({
    "vislang.json": JSON.stringify(doc),
    "tokens.json": "{}",
  });
  const result = validateConstitution(doc, { file: path.join(dir, "vislang.json") });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("2. missing DTCG file", () => {
  const dir = writeTree({
    "vislang.json": JSON.stringify(constitution()),
  });
  const result = validateConstitution(constitution(), {
    file: path.join(dir, "vislang.json"),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DTCG_MISSING"));
});

test("3. invalid DTCG JSON", () => {
  const dir = writeTree({
    "vislang.json": JSON.stringify(constitution()),
    "tokens.json": "{ not json",
  });
  const result = validateConstitution(constitution(), {
    file: path.join(dir, "vislang.json"),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DTCG_JSON"));
});

test("4. DTCG file exceeding 1 MiB", () => {
  const dir = writeTree({
    "vislang.json": JSON.stringify(constitution()),
    "tokens.json": `{"x":${"0".repeat(1_048_577)}}`,
  });
  const result = validateConstitution(constitution(), {
    file: path.join(dir, "vislang.json"),
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DTCG_TOO_LARGE"));
});

test("5. absolute token path", () => {
  const doc = constitution();
  (doc.binds as { tokens: { path: string } }).tokens.path = "/tmp/tokens.json";
  const dir = writeTree({ "vislang.json": JSON.stringify(doc) });
  const result = validateConstitution(doc, { file: path.join(dir, "vislang.json") });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DTCG_PATH" || issue.code === "E_SCHEMA"));
});

test("6. .. traversal", () => {
  const doc = constitution();
  (doc.binds as { tokens: { path: string } }).tokens.path = "../tokens.json";
  const dir = writeTree({ "vislang.json": JSON.stringify(doc) });
  const result = validateConstitution(doc, { file: path.join(dir, "vislang.json") });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (issue) => issue.code === "E_DTCG_ESCAPE" || issue.code === "E_SCHEMA",
    ),
    JSON.stringify(result.errors),
  );
});

test("7. constitution using stdin with DTCG path", () => {
  const result = validateConstitution(constitution(), { file: "-" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DTCG_STDIN"));
});

test("8. format none with a path", () => {
  const doc = constitution();
  (doc.binds as { tokens: Record<string, string> }).tokens = {
    format: "none",
    path: "tokens.json",
  };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles = [
    { role: "action.primary", required: true, fallback: "#000000" },
  ];
  const result = validateConstitution(doc, { file: "vislang.json" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_SCHEMA"));
});

test("9. valid format none without a path", () => {
  const doc = constitution();
  (doc.binds as { tokens: Record<string, string> }).tokens = { format: "none" };
  (doc.binds as { roles: Array<Record<string, unknown>> }).roles = [
    { role: "action.primary", required: true, fallback: "#000000" },
  ];
  const result = validateConstitution(doc, { file: "vislang.json" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("10. valid nested relative DTCG path", () => {
  const doc = constitution();
  (doc.binds as { tokens: { path: string } }).tokens.path = "tokens/color.tokens.json";
  const dir = writeTree({
    "vislang.json": JSON.stringify(doc),
    "tokens/color.tokens.json": "{}",
  });
  const result = validateConstitution(doc, { file: path.join(dir, "vislang.json") });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});
