import assert from "node:assert/strict";
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
    surfaces: [
      { id: "home", kind: "screen", required: true },
      { id: "drawer", kind: "region", required: false },
    ],
    invariants: [
      {
        id: "INV-PRIMARY-01",
        statement: "One primary action role is bound.",
        severity: "error",
        applies_to: [{}],
        predicate: {
          kind: "single_primary_action_role",
          role: "action.primary",
        },
      },
    ],
  };
}

test("removal: optional referenced role gone with its reference is breaking", () => {
  const oldDoc = base();
  (oldDoc.invariants as Array<Record<string, unknown>>).push({
    id: "INV-SECONDARY-01",
    statement: "Secondary is bound.",
    severity: "warning",
    applies_to: [{}],
    predicate: { kind: "role_bound", role: "action.secondary" },
  });
  const next = base();
  (next.binds as { roles: unknown[] }).roles = [
    { role: "action.primary", required: true, fallback: "#000000" },
  ];
  const result = diffConstitutions(oldDoc, next);
  const removed = result.breaking.find(
    (item) => item.collection === "roles" && item.id === "action.secondary" && item.op === "remove",
  );
  assert.ok(removed, JSON.stringify(result.additive.concat(result.breaking)));
});

test("removal: optional referenced surface gone with its reference is breaking", () => {
  const oldDoc = base();
  (oldDoc.invariants as Array<Record<string, unknown>>)[0].applies_to = [
    { surface: "drawer" },
  ];
  const next = base();
  next.surfaces = [{ id: "home", kind: "screen", required: true }];
  const result = diffConstitutions(oldDoc, next);
  const removed = result.breaking.find(
    (item) => item.collection === "surfaces" && item.id === "drawer" && item.op === "remove",
  );
  assert.ok(removed, JSON.stringify(result.additive.concat(result.breaking)));
});
