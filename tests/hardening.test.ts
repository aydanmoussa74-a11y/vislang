import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validateConstitution } from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function minimal(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, "spec/0.1/fixtures/valid/minimal.json"), "utf8"),
  ) as Record<string, unknown>;
}

test("3C. valid constitution remains valid", () => {
  const result = validateConstitution(minimal(), { file: "minimal.json" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("3C. JSON array is not a constitution object", () => {
  const result = validateConstitution("[]", { file: "bad.json" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_NOT_OBJECT");
  assert.equal(result.errors[0]?.path, "");
});

test("3C. JSON primitive is not a constitution object", () => {
  const result = validateConstitution("null", { file: "bad.json" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_NOT_OBJECT");
});

test("3C. object-input array is not a constitution object", () => {
  const result = validateConstitution([], { file: "bad.json" });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_NOT_OBJECT");
});

test("3C. UTF-8 BOM is stripped before parse", () => {
  const body = "\uFEFF" + JSON.stringify(minimal());
  const result = validateConstitution(body, { file: "minimal.json" });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("3C. W002 for error-severity law with breaking_if_removed false", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].breaking_if_removed = false;
  const result = validateConstitution(doc, { file: "minimal.json" });
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.code, "W002");
  assert.equal(result.warnings[0]?.path, "/invariants/0/breaking_if_removed");
});

test("3C. selector_must_exist empty selector fails", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].predicate = {
    kind: "selector_must_exist",
    selector: {},
  };
  const result = validateConstitution(doc, { file: "minimal.json" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((issue) => issue.code === "E_SCHEMA"));
  assert.ok(result.errors.some((issue) => issue.path.includes("predicate")));
});

test("3C. predicate selector surface must exist", () => {
  const doc = minimal();
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].predicate = {
    kind: "selector_must_exist",
    selector: { surface: "missing-home" },
  };
  const result = validateConstitution(doc, { file: "minimal.json" });
  assert.equal(result.ok, false);
  const issue = result.errors.find((item) => item.code === "E_UNKNOWN_SURFACE");
  assert.ok(issue);
  assert.equal(issue?.path, "/invariants/0/predicate/selector/surface");
});

test("3C. duplicate role names fail with E_DUP_ROLE", () => {
  const doc = minimal();
  const binds = doc.binds as { roles: Array<Record<string, unknown>> };
  binds.roles.push({
    role: "action.primary",
    required: false,
    fallback: "#111111",
  });
  const result = validateConstitution(doc, { file: "minimal.json" });
  assert.equal(result.ok, false);
  const issue = result.errors.find((item) => item.code === "E_DUP_ROLE");
  assert.ok(issue);
  assert.equal(issue?.path, "/binds/roles/1/role");
});

test("3C. issue order is deterministic by path then code", () => {
  const doc = minimal();
  const binds = doc.binds as { roles: Array<Record<string, unknown>> };
  binds.roles.push({
    role: "action.primary",
    required: false,
    fallback: "#111111",
  });
  const invariants = doc.invariants as Array<Record<string, unknown>>;
  invariants[0].applies_to = [{ surface: "ghost" }];
  const first = validateConstitution(doc, { file: "minimal.json" });
  const second = validateConstitution(doc, { file: "minimal.json" });
  assert.equal(first.ok, false);
  assert.deepEqual(first.errors, second.errors);
  const paths = first.errors.map((issue) => `${issue.path}\0${issue.code}`);
  const sorted = [...paths].sort();
  assert.deepEqual(paths, sorted);
});
