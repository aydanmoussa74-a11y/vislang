import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { diffConstitutions } from "../src/index.ts";

function base(): Record<string, unknown> {
  return {
    vislang: "0.1",
    id: "example",
    name: "Example",
    version: "0.1.0",
    status: "draft",
    binds: {
      tokens: { format: "none" },
      roles: [
        { role: "action.primary", required: true, fallback: "#000000" },
        { role: "action.secondary", required: false, fallback: "#111111" },
      ],
    },
    surfaces: [{ id: "home", kind: "screen", required: true }],
    invariants: [
      {
        id: "INV-PRIMARY-01",
        statement: "One primary action role is bound.",
        severity: "error",
        applies_to: [{}],
        predicate: { kind: "single_primary_action_role", role: "action.primary" },
      },
    ],
  };
}

function clone(): Record<string, unknown> {
  return structuredClone(base());
}

function roles(doc: Record<string, unknown>) {
  return (doc.binds as { roles: Array<Record<string, unknown>> }).roles;
}

function invariants(doc: Record<string, unknown>) {
  return doc.invariants as Array<Record<string, unknown>>;
}

test("4A. invalid old constitution", () => {
  const oldDoc = clone();
  oldDoc.vislang = "0.2";
  const result = diffConstitutions(oldDoc, clone());
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_old");
  assert.equal(result.breaking.length, 0);
});

test("4A. invalid new constitution", () => {
  const next = clone();
  next.vislang = "0.2";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_new");
});

test("4A. mismatched constitution IDs", () => {
  const next = clone();
  next.id = "other-app";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "incomparable_id");
});

test("4A. identical constitutions are nonbreaking", () => {
  const result = diffConstitutions(clone(), clone());
  assert.equal(result.ok, true);
  assert.equal(result.aggregate, "nonbreaking");
  assert.equal(result.breaking.length, 0);
  assert.equal(result.additive.length, 0);
  assert.equal(result.unknown.length, 0);
  assert.equal(result.nonbreaking.length, 0);
});

test("4A. optional role added is additive", () => {
  const next = clone();
  roles(next).push({ role: "text.muted", required: false, fallback: "#222" });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.aggregate, "additive");
  assert.equal(result.additive[0]?.id, "text.muted");
  assert.equal(result.additive[0]?.op, "add");
});

test("4A. required role added is additive", () => {
  const next = clone();
  roles(next).push({ role: "surface.base", required: true, fallback: "#010101" });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.id, "surface.base");
  assert.equal(result.aggregate, "additive");
});

test("4A. unreferenced optional role removed is additive", () => {
  const next = clone();
  roles(next).splice(1, 1);
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.id, "action.secondary");
  assert.equal(result.additive[0]?.op, "remove");
});

test("4A. referenced or required role removed is breaking", () => {
  const next = clone();
  roles(next).splice(0, 1);
  invariants(next)[0] = {
    id: "INV-ROLE-01",
    statement: "Secondary is bound.",
    severity: "error",
    applies_to: [{}],
    predicate: { kind: "role_bound", role: "action.secondary" },
  };
  const result = diffConstitutions(clone(), next);
  assert.ok(result.breaking.some((item) => item.id === "action.primary"));
  assert.equal(result.aggregate, "breaking");
});

test("4A. required false to true is additive", () => {
  const next = clone();
  roles(next)[1].required = true;
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.field, "required");
});

test("4A. required role fallback change is breaking", () => {
  const next = clone();
  roles(next)[0].fallback = "#FFFFFF";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.collection, "roles");
});

test("4A. warning invariant added is additive", () => {
  const next = clone();
  invariants(next).push({
    id: "INV-WARN-01",
    statement: "Secondary exists.",
    severity: "warning",
    applies_to: [{}],
    predicate: { kind: "role_bound", role: "action.secondary" },
  });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.id, "INV-WARN-01");
});

test("4A. error invariant added is breaking", () => {
  const next = clone();
  invariants(next).push({
    id: "INV-ERR-01",
    statement: "Secondary exists.",
    severity: "error",
    applies_to: [{}],
    predicate: { kind: "role_bound", role: "action.secondary" },
  });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.id, "INV-ERR-01");
});

test("4A. removable law uses breaking_if_removed", () => {
  const oldDoc = clone();
  invariants(oldDoc)[0].breaking_if_removed = false;
  const next = clone();
  next.invariants = [
    {
      id: "INV-OTHER-01",
      statement: "Secondary bound.",
      severity: "error",
      applies_to: [{}],
      predicate: { kind: "role_bound", role: "action.secondary" },
    },
  ];
  const result = diffConstitutions(oldDoc, next);
  assert.ok(result.additive.some((item) => item.id === "INV-PRIMARY-01" && item.op === "remove"));
});

test("4A. predicate change is breaking", () => {
  const next = clone();
  invariants(next)[0].predicate = { kind: "role_bound", role: "action.primary" };
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "predicate");
});

test("4A. applies_to change is breaking", () => {
  const next = clone();
  invariants(next)[0].applies_to = [{ surface: "home" }];
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "applies_to");
});

test("4A. severity change is breaking", () => {
  const next = clone();
  invariants(next)[0].severity = "warning";
  invariants(next)[0].breaking_if_removed = true;
  const result = diffConstitutions(clone(), next);
  assert.ok(result.breaking.length > 0);
});

test("4A. breaking_if_removed true to false is breaking", () => {
  const next = clone();
  invariants(next)[0].breaking_if_removed = false;
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "breaking_if_removed");
});

test("4A. breaking_if_removed false to true is additive", () => {
  const oldDoc = clone();
  invariants(oldDoc)[0].breaking_if_removed = false;
  const next = clone();
  invariants(next)[0].breaking_if_removed = true;
  const result = diffConstitutions(oldDoc, next);
  assert.equal(result.additive[0]?.field, "breaking_if_removed");
});

test("4A. statement-only change is nonbreaking", () => {
  const next = clone();
  invariants(next)[0].statement = "Primary action role remains unique.";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.aggregate, "nonbreaking");
  assert.equal(result.nonbreaking[0]?.field, "statement");
});

test("4A. optional surface added is additive", () => {
  const next = clone();
  (next.surfaces as Array<Record<string, unknown>>).push({ id: "drawer", kind: "region", required: false });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.id, "drawer");
});

test("4A. required surface added is additive", () => {
  const next = clone();
  (next.surfaces as Array<Record<string, unknown>>).push({ id: "library", kind: "screen", required: true });
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.id, "library");
});

test("4A. unreferenced optional surface removed is additive", () => {
  const oldDoc = clone();
  (oldDoc.surfaces as Array<Record<string, unknown>>).push({ id: "drawer", kind: "region", required: false });
  const result = diffConstitutions(oldDoc, clone());
  assert.equal(result.additive[0]?.id, "drawer");
  assert.equal(result.additive[0]?.op, "remove");
});

test("4A. referenced surface removed is breaking", () => {
  const oldDoc = clone();
  invariants(oldDoc)[0].applies_to = [{ surface: "home" }];
  const next = clone();
  next.surfaces = [];
  invariants(next)[0].applies_to = [{}];
  const result = diffConstitutions(oldDoc, next);
  assert.ok(result.breaking.some((item) => item.collection === "surfaces"));
});

test("4A. surface kind change is breaking", () => {
  const next = clone();
  (next.surfaces as Array<Record<string, unknown>>)[0].kind = "region";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "kind");
});

test("4A. surface required false to true is additive", () => {
  const oldDoc = clone();
  (oldDoc.surfaces as Array<Record<string, unknown>>)[0].required = false;
  const result = diffConstitutions(oldDoc, clone());
  assert.equal(result.additive[0]?.field, "required");
});

test("4A. surface required true to false is breaking", () => {
  const next = clone();
  (next.surfaces as Array<Record<string, unknown>>)[0].required = false;
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "required");
});

function withAccents(n: number, accents: string[]): Record<string, unknown> {
  const doc = clone();
  invariants(doc).push({
    id: "INV-ACCENT-01",
    statement: "Accent cap.",
    severity: "warning",
    applies_to: [{}],
    predicate: { kind: "max_accent_roles", n, accent_roles: accents },
  });
  return doc;
}

test("4A. max_accent_roles n increase is additive", () => {
  const result = diffConstitutions(
    withAccents(1, ["action.primary", "action.secondary"]),
    withAccents(2, ["action.primary", "action.secondary"]),
  );
  assert.equal(result.additive[0]?.field, "predicate");
});

test("4A. max_accent_roles n decrease is breaking", () => {
  const result = diffConstitutions(
    withAccents(2, ["action.primary", "action.secondary"]),
    withAccents(1, ["action.primary", "action.secondary"]),
  );
  assert.equal(result.breaking[0]?.field, "predicate");
});

test("4A. accent role added is additive", () => {
  const result = diffConstitutions(withAccents(1, ["action.primary"]), withAccents(1, ["action.primary", "action.secondary"]));
  assert.equal(result.additive[0]?.id, "INV-ACCENT-01");
});

test("4A. accent role removed is breaking", () => {
  const result = diffConstitutions(withAccents(1, ["action.primary", "action.secondary"]), withAccents(1, ["action.primary"]));
  assert.equal(result.breaking[0]?.id, "INV-ACCENT-01");
});

test("4A. accent role reorder is nonbreaking", () => {
  const result = diffConstitutions(
    withAccents(1, ["action.primary", "action.secondary"]),
    withAccents(1, ["action.secondary", "action.primary"]),
  );
  assert.equal(result.aggregate, "nonbreaking");
});

test("4A. nav_model change is breaking", () => {
  const oldDoc = clone();
  invariants(oldDoc).push({
    id: "INV-NAV-01",
    statement: "Bottom nav.",
    severity: "warning",
    applies_to: [{}],
    predicate: { kind: "nav_model", model: "bottom_tabs", items: ["home", "train"] },
  });
  const next = structuredClone(oldDoc);
  (invariants(next)[1].predicate as { model: string }).model = "top_tabs";
  const result = diffConstitutions(oldDoc, next);
  assert.equal(result.breaking[0]?.id, "INV-NAV-01");
});

test("4A. single_primary_action_role change is breaking", () => {
  const next = clone();
  (invariants(next)[0].predicate as { role: string }).role = "action.secondary";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.breaking[0]?.field, "predicate");
});

test("4A. name-only change is nonbreaking", () => {
  const next = clone();
  next.name = "Renamed";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.nonbreaking[0]?.field, "name");
});

test("4A. metadata-only change is nonbreaking", () => {
  const next = clone();
  next.metadata = { note: "x" };
  const result = diffConstitutions(clone(), next);
  assert.equal(result.nonbreaking[0]?.field, "metadata");
});

test("4A. status draft to stable is additive", () => {
  const next = clone();
  next.status = "stable";
  const result = diffConstitutions(clone(), next);
  assert.equal(result.additive[0]?.field, "status");
});

test("4A. status stable to draft is breaking", () => {
  const oldDoc = clone();
  oldDoc.status = "stable";
  const result = diffConstitutions(oldDoc, clone());
  assert.equal(result.breaking[0]?.field, "status");
});

test("4A. token format change is breaking", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-diff-"));
  writeFileSync(path.join(dir, "tokens.json"), "{}");
  const next = clone();
  (next.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens.json" };
  roles(next).forEach((role) => {
    delete role.fallback;
    role.token = "color.action.primary";
  });
  writeFileSync(path.join(dir, "vislang.json"), JSON.stringify(next));
  const result = diffConstitutions(clone(), next, { newFile: path.join(dir, "vislang.json") });
  assert.equal(result.ok, true, JSON.stringify(result.newValidation?.errors));
  assert.ok(result.breaking.some((item) => item.field === "binds.tokens.format"));
});

test("4A. token path change is unknown", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-diff-"));
  mkdirSync(path.join(dir, "tokens"));
  writeFileSync(path.join(dir, "tokens.json"), "{}");
  writeFileSync(path.join(dir, "tokens", "color.json"), "{}");
  const oldDoc = clone();
  const next = clone();
  (oldDoc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens.json" };
  (next.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "tokens/color.json" };
  for (const doc of [oldDoc, next]) {
    roles(doc).forEach((role) => {
      delete role.fallback;
      role.token = "color.action.primary";
    });
  }
  writeFileSync(path.join(dir, "old.json"), JSON.stringify(oldDoc));
  writeFileSync(path.join(dir, "new.json"), JSON.stringify(next));
  const result = diffConstitutions(oldDoc, next, {
    oldFile: path.join(dir, "old.json"),
    newFile: path.join(dir, "new.json"),
  });
  assert.equal(result.ok, true, JSON.stringify(result.newValidation?.errors));
  assert.equal(result.unknown[0]?.field, "binds.tokens.path");
  assert.equal(result.aggregate, "unknown");
});

test("4A. unknown is preserved in unknown array", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-diff-"));
  writeFileSync(path.join(dir, "a.json"), "{}");
  writeFileSync(path.join(dir, "b.json"), "{}");
  const oldDoc = clone();
  const next = clone();
  (oldDoc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "a.json" };
  (next.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "b.json" };
  for (const doc of [oldDoc, next]) {
    roles(doc).forEach((role) => {
      delete role.fallback;
      role.token = "color.action.primary";
    });
  }
  writeFileSync(path.join(dir, "old.json"), JSON.stringify(oldDoc));
  writeFileSync(path.join(dir, "new.json"), JSON.stringify(next));
  const result = diffConstitutions(oldDoc, next, {
    oldFile: path.join(dir, "old.json"),
    newFile: path.join(dir, "new.json"),
  });
  assert.equal(result.unknown[0]?.class, "unknown");
});

test("4A. aggregate precedence breaking over unknown", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vislang-diff-"));
  writeFileSync(path.join(dir, "a.json"), "{}");
  writeFileSync(path.join(dir, "b.json"), "{}");
  const oldDoc = clone();
  const next = clone();
  next.name = "Changed";
  (oldDoc.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "a.json" };
  (next.binds as { tokens: Record<string, string> }).tokens = { format: "dtcg-2025.10", path: "b.json" };
  for (const doc of [oldDoc, next]) {
    roles(doc).forEach((role) => {
      delete role.fallback;
      role.token = "color.action.primary";
    });
  }
  (invariants(next)[0].predicate as { role: string }).role = "action.secondary";
  writeFileSync(path.join(dir, "old.json"), JSON.stringify(oldDoc));
  writeFileSync(path.join(dir, "new.json"), JSON.stringify(next));
  const result = diffConstitutions(oldDoc, next, {
    oldFile: path.join(dir, "old.json"),
    newFile: path.join(dir, "new.json"),
  });
  assert.ok(result.unknown.length > 0);
  assert.ok(result.breaking.length > 0);
  assert.equal(result.aggregate, "breaking");
});
