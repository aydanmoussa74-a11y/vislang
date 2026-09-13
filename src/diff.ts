import type { Constitution } from "./types.ts";
import type {
  DiffChange,
  DiffClass,
  DiffCollection,
  DiffOptions,
  DiffResult,
  DiffOp,
} from "./diff-types.ts";
import {
  appliesEqual,
  deepEqual,
  normalizeConstitution,
  referencedRoles,
  referencedSurfaces,
  type NormalizedDoc,
  type NormalizedLaw,
} from "./normalize.ts";
import { validateConstitution } from "./validate.ts";

const CLASS_RANK: Record<DiffClass, number> = {
  nonbreaking: 0,
  additive: 1,
  unknown: 2,
  breaking: 3,
};

const COLLECTION_RANK: Record<DiffCollection, number> = {
  document: 0,
  roles: 1,
  invariants: 2,
  forbiddens: 3,
  surfaces: 4,
};

const OP_RANK: Record<DiffOp, number> = {
  add: 0,
  remove: 1,
  modify: 2,
};

function worse(a: DiffClass, b: DiffClass): DiffClass {
  return CLASS_RANK[a] >= CLASS_RANK[b] ? a : b;
}

function change(
  collection: DiffCollection,
  id: string,
  op: DiffOp,
  klass: DiffClass,
  message: string,
  field?: string,
): DiffChange {
  const item: DiffChange = { collection, id, op, class: klass, message };
  if (field !== undefined) item.field = field;
  return item;
}

function sortChanges(items: DiffChange[]): DiffChange[] {
  return [...items].sort((a, b) => {
    if (a.collection !== b.collection) {
      return COLLECTION_RANK[a.collection] - COLLECTION_RANK[b.collection];
    }
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.op !== b.op) return OP_RANK[a.op] - OP_RANK[b.op];
    const af = a.field ?? "";
    const bf = b.field ?? "";
    if (af !== bf) return af < bf ? -1 : 1;
    if (a.class !== b.class) return CLASS_RANK[a.class] - CLASS_RANK[b.class];
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
}

function predicateClass(oldPred: NormalizedLaw["predicate"], newPred: NormalizedLaw["predicate"]): DiffClass | undefined {
  if (deepEqual(oldPred, newPred)) return undefined;
  if (oldPred.kind !== newPred.kind) return "breaking";
  if (oldPred.kind === "max_accent_roles" && newPred.kind === "max_accent_roles") {
    let klass: DiffClass = "nonbreaking";
    const oldN = oldPred.n ?? 0;
    const newN = newPred.n ?? 0;
    if (newN > oldN) klass = worse(klass, "additive");
    if (newN < oldN) klass = worse(klass, "breaking");
    const oldSet = new Set(oldPred.accent_roles ?? []);
    const newSet = new Set(newPred.accent_roles ?? []);
    for (const name of newSet) {
      if (!oldSet.has(name)) klass = worse(klass, "additive");
    }
    for (const name of oldSet) {
      if (!newSet.has(name)) klass = worse(klass, "breaking");
    }
    return klass;
  }
  if (oldPred.kind === "nav_model" && newPred.kind === "nav_model") {
    return "breaking";
  }
  if (
    oldPred.kind === "single_primary_action_role" &&
    newPred.kind === "single_primary_action_role"
  ) {
    return oldPred.role === newPred.role ? undefined : "breaking";
  }
  return "breaking";
}

function classifyRoleRemove(role: { role: string; required: boolean }, referenced: Set<string>): DiffClass {
  let klass: DiffClass = "additive";
  if (role.required) klass = worse(klass, "breaking");
  if (referenced.has(role.role)) klass = worse(klass, "breaking");
  return klass;
}

function classifySurfaceRemove(required: boolean, id: string, referenced: Set<string>): DiffClass {
  let klass: DiffClass = "additive";
  if (required) klass = worse(klass, "breaking");
  if (referenced.has(id)) klass = worse(klass, "breaking");
  return klass;
}

function classifyStatus(from: string, to: string): DiffClass | undefined {
  if (from === to) return undefined;
  if (from === "stable" && to === "draft") return "breaking";
  if (from === "deprecated" && to === "draft") return "breaking";
  return "additive";
}

function diffRoles(oldDoc: NormalizedDoc, newDoc: NormalizedDoc): DiffChange[] {
  const out: DiffChange[] = [];
  const referenced = referencedRoles(oldDoc);
  const ids = new Set([...oldDoc.roles.keys(), ...newDoc.roles.keys()]);
  for (const id of ids) {
    const before = oldDoc.roles.get(id);
    const after = newDoc.roles.get(id);
    if (before && !after) {
      out.push(change("roles", id, "remove", classifyRoleRemove(before, referenced), `Role "${id}" was removed.`));
      continue;
    }
    if (!before && after) {
      out.push(change("roles", id, "add", "additive", `Role "${id}" was added.`));
      continue;
    }
    if (!before || !after) continue;
    let klass: DiffClass | undefined;
    const fields: string[] = [];
    if (before.required !== after.required) {
      fields.push("required");
      klass = worse(klass ?? "nonbreaking", after.required ? "additive" : "breaking");
    }
    if (before.token !== after.token || before.fallback !== after.fallback) {
      fields.push(before.token !== after.token ? "token" : "fallback");
      klass = worse(klass ?? "nonbreaking", after.required || before.required ? "breaking" : "additive");
    }
    if (klass) {
      out.push(change("roles", id, "modify", klass, `Role "${id}" binding changed.`, fields[0]));
    }
  }
  return out;
}

function diffLaws(
  collection: "invariants" | "forbiddens",
  oldMap: Map<string, NormalizedLaw>,
  newMap: Map<string, NormalizedLaw>,
): DiffChange[] {
  const out: DiffChange[] = [];
  const ids = new Set([...oldMap.keys(), ...newMap.keys()]);
  for (const id of ids) {
    const before = oldMap.get(id);
    const after = newMap.get(id);
    if (before && !after) {
      out.push(change(collection, id, "remove", before.breaking_if_removed ? "breaking" : "additive", `${collection.slice(0, -1)} "${id}" was removed.`));
      continue;
    }
    if (!before && after) {
      out.push(change(collection, id, "add", after.severity === "error" ? "breaking" : "additive", `${collection.slice(0, -1)} "${id}" was added.`));
      continue;
    }
    if (!before || !after) continue;
    let klass: DiffClass | undefined;
    let field: string | undefined;
    if (!deepEqual(before.predicate, after.predicate)) {
      const predClass = predicateClass(before.predicate, after.predicate) ?? "breaking";
      klass = worse(klass ?? "nonbreaking", predClass);
      field = "predicate";
    }
    if (!appliesEqual(before.applies_to, after.applies_to)) {
      klass = worse(klass ?? "nonbreaking", "breaking");
      field = field ?? "applies_to";
    }
    if (before.severity !== after.severity) {
      klass = worse(klass ?? "nonbreaking", "breaking");
      field = field ?? "severity";
    }
    if (before.breaking_if_removed !== after.breaking_if_removed) {
      klass = worse(klass ?? "nonbreaking", before.breaking_if_removed && !after.breaking_if_removed ? "breaking" : "additive");
      field = field ?? "breaking_if_removed";
    }
    if (before.statement !== after.statement && klass === undefined) {
      klass = "nonbreaking";
      field = "statement";
    }
    if (klass) {
      out.push(change(collection, id, "modify", klass, `${collection.slice(0, -1)} "${id}" changed.`, field));
    }
  }
  return out;
}

function diffSurfaces(oldDoc: NormalizedDoc, newDoc: NormalizedDoc): DiffChange[] {
  const out: DiffChange[] = [];
  const referenced = referencedSurfaces(oldDoc);
  const ids = new Set([...oldDoc.surfaces.keys(), ...newDoc.surfaces.keys()]);
  for (const id of ids) {
    const before = oldDoc.surfaces.get(id);
    const after = newDoc.surfaces.get(id);
    if (before && !after) {
      out.push(change("surfaces", id, "remove", classifySurfaceRemove(before.required, id, referenced), `Surface "${id}" was removed.`));
      continue;
    }
    if (!before && after) {
      out.push(change("surfaces", id, "add", "additive", `Surface "${id}" was added.`));
      continue;
    }
    if (!before || !after) continue;
    let klass: DiffClass | undefined;
    let field: string | undefined;
    if (before.kind !== after.kind) {
      klass = worse(klass ?? "nonbreaking", "breaking");
      field = "kind";
    }
    if (before.required !== after.required) {
      klass = worse(klass ?? "nonbreaking", after.required ? "additive" : "breaking");
      field = field ?? "required";
    }
    if (klass) {
      out.push(change("surfaces", id, "modify", klass, `Surface "${id}" changed.`, field));
    }
  }
  return out;
}

function diffDocument(oldDoc: NormalizedDoc, newDoc: NormalizedDoc): DiffChange[] {
  const out: DiffChange[] = [];
  if (oldDoc.name !== newDoc.name) {
    out.push(change("document", "", "modify", "nonbreaking", "Name changed.", "name"));
  }
  if (!deepEqual(oldDoc.metadata, newDoc.metadata)) {
    out.push(change("document", "", "modify", "nonbreaking", "Metadata changed.", "metadata"));
  }
  const statusClass = classifyStatus(oldDoc.status, newDoc.status);
  if (statusClass) {
    out.push(change("document", "", "modify", statusClass, `Status changed from ${oldDoc.status} to ${newDoc.status}.`, "status"));
  }
  if (oldDoc.tokenFormat !== newDoc.tokenFormat) {
    out.push(change("document", "", "modify", "breaking", "Token format changed.", "binds.tokens.format"));
  }
  if ((oldDoc.tokenPath ?? "") !== (newDoc.tokenPath ?? "")) {
    out.push(change("document", "", "modify", "unknown", "Token path changed.", "binds.tokens.path"));
  }
  return out;
}

function aggregate(changes: DiffChange[]): DiffClass {
  let result: DiffClass = "nonbreaking";
  for (const item of changes) result = worse(result, item.class);
  return result;
}

function bucket(changes: DiffChange[]): Pick<DiffResult, "breaking" | "additive" | "nonbreaking" | "unknown"> {
  const sorted = sortChanges(changes);
  return {
    breaking: sorted.filter((item) => item.class === "breaking"),
    additive: sorted.filter((item) => item.class === "additive"),
    nonbreaking: sorted.filter((item) => item.class === "nonbreaking"),
    unknown: sorted.filter((item) => item.class === "unknown"),
  };
}

export function diffConstitutions(
  oldInput: string | unknown,
  newInput: string | unknown,
  options: DiffOptions = {},
): DiffResult {
  const oldValidation = validateConstitution(oldInput, { file: options.oldFile ?? "-" });
  const newValidation = validateConstitution(newInput, { file: options.newFile ?? "-" });
  const empty = {
    breaking: [] as DiffChange[],
    additive: [] as DiffChange[],
    nonbreaking: [] as DiffChange[],
    unknown: [] as DiffChange[],
    semver_ok: true,
  };
  if (!oldValidation.ok) {
    return { ok: false, reason: "invalid_old", oldValidation, newValidation, ...empty };
  }
  if (!newValidation.ok) {
    return { ok: false, reason: "invalid_new", oldValidation, newValidation, ...empty };
  }
  const oldNorm = normalizeConstitution(
    typeof oldInput === "string" ? (JSON.parse(oldInput) as Constitution) : (oldInput as Constitution),
  );
  const newNorm = normalizeConstitution(
    typeof newInput === "string" ? (JSON.parse(newInput) as Constitution) : (newInput as Constitution),
  );
  if (oldNorm.id !== newNorm.id) {
    return { ok: false, reason: "incomparable_id", oldValidation, newValidation, ...empty };
  }
  const changes = [
    ...diffDocument(oldNorm, newNorm),
    ...diffRoles(oldNorm, newNorm),
    ...diffLaws("invariants", oldNorm.invariants, newNorm.invariants),
    ...diffLaws("forbiddens", oldNorm.forbiddens, newNorm.forbiddens),
    ...diffSurfaces(oldNorm, newNorm),
  ];
  const groups = bucket(changes);
  return {
    ok: true,
    old: oldNorm.version,
    new: newNorm.version,
    id: oldNorm.id,
    aggregate: aggregate(changes),
    oldValidation,
    newValidation,
    ...groups,
    semver_ok: true,
  };
}
