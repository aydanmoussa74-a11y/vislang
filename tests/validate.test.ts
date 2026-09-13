import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateConstitution } from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadValid(name: string): unknown {
  return JSON.parse(
    readFileSync(join(root, "spec/0.1/fixtures/valid", name), "utf8"),
  );
}

function minimal(): Record<string, unknown> {
  return structuredClone(loadValid("minimal.json")) as Record<string, unknown>;
}

test("1. valid minimal constitution", () => {
  const result = validateConstitution(minimal(), { file: "minimal.json" });
  assert.equal(result.ok, true);
  assert.equal(result.spec, "0.1");
  assert.equal(result.errors.length, 0);
});

test("2. schema-invalid constitution", () => {
  const doc = minimal();
  doc.vislang = "0.2";
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_SCHEMA"));
});

test("3. duplicate IDs", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants.push({
    id: "INV-PRIMARY-01",
    statement: "Duplicate id.",
    severity: "warning",
    applies_to: [{}],
    predicate: { kind: "role_bound", role: "action.primary" },
  });
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DUP_INVARIANT_ID"));
});

test("4. invariant/forbidden ID collision", () => {
  const doc = minimal();
  doc.forbiddens = [
    {
      id: "INV-PRIMARY-01",
      statement: "Same id as invariant.",
      severity: "error",
      predicate: { kind: "forbidden_role_use", role: "action.primary" },
    },
  ];
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_ID_COLLISION"));
});

test("5. nonexistent predicate role", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].predicate = {
    kind: "single_primary_action_role",
    role: "action.missing",
  };
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_UNBOUND_ROLE"));
});

test("6. nonexistent selector surface", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].applies_to = [{ surface: "home" }];
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_UNKNOWN_SURFACE"));
});

test("7. duplicate single_primary_action_role", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants.push({
    id: "INV-PRIMARY-02",
    statement: "Second primary.",
    severity: "error",
    applies_to: [{}],
    predicate: {
      kind: "single_primary_action_role",
      role: "action.primary",
    },
  });
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DUP_SINGLE_PRIMARY"));
});

test("8. duplicate max_accent_roles", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants.push(
    {
      id: "INV-ACCENT-01",
      statement: "First accent cap.",
      severity: "error",
      applies_to: [{}],
      predicate: {
        kind: "max_accent_roles",
        n: 1,
        accent_roles: ["action.primary"],
      },
    },
    {
      id: "INV-ACCENT-02",
      statement: "Second accent cap.",
      severity: "error",
      applies_to: [{}],
      predicate: {
        kind: "max_accent_roles",
        n: 1,
        accent_roles: ["action.primary"],
      },
    },
  );
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_DUP_MAX_ACCENT"));
});

test("9. invalid max_accent_roles.n", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0] = {
    id: "INV-ACCENT-01",
    statement: "n larger than set.",
    severity: "error",
    applies_to: [{}],
    predicate: {
      kind: "max_accent_roles",
      n: 2,
      accent_roles: ["action.primary"],
    },
  };
  const result = validateConstitution(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_ACCENT_N"));
});

test("10. valid cross-references", () => {
  const result = validateConstitution(loadValid("all-predicates.json"), {
    file: "all-predicates.json",
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});
