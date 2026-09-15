import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import { validateDtcgBoundary } from "./dtcg.ts";
import { parseJsonBytes, rejectNonDocument } from "./parse.ts";
import type {
  Constitution,
  Law,
  Predicate,
  Selector,
  ValidateOptions,
  ValidationIssue,
  ValidationResult,
} from "./types.ts";

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "spec",
  "0.1",
  "schema.json",
);

const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
const ajv = new Ajv({ strict: false, allErrors: true });
const schemaValidate = ajv.compile(schema);

function pointer(parts: Array<string | number>): string {
  if (parts.length === 0) return "";
  return (
    "/" +
    parts
      .map((part) =>
        String(part).replaceAll("~", "~0").replaceAll("/", "~1"),
      )
      .join("/")
  );
}

function schemaIssues(data: unknown): ValidationIssue[] {
  const ok = schemaValidate(data);
  if (ok || !schemaValidate.errors) return [];
  return schemaValidate.errors.map((err) => ({
    code: "E_SCHEMA",
    path: err.instancePath ?? "",
    message: err.message ? `${err.instancePath || "/"} ${err.message}` : "Schema validation failed.",
  }));
}

function collectLaws(doc: Constitution): Array<{ law: Law; path: string[] }> {
  const out: Array<{ law: Law; path: string[] }> = [];
  for (let i = 0; i < doc.invariants.length; i += 1) {
    out.push({ law: doc.invariants[i], path: ["invariants", String(i)] });
  }
  const forbiddens = doc.forbiddens ?? [];
  for (let i = 0; i < forbiddens.length; i += 1) {
    out.push({ law: forbiddens[i], path: ["forbiddens", String(i)] });
  }
  return out;
}

function predicateRoles(predicate: Predicate): string[] {
  const roles: string[] = [];
  if (typeof predicate.role === "string") roles.push(predicate.role);
  if (Array.isArray(predicate.accent_roles)) {
    roles.push(...predicate.accent_roles);
  }
  return roles;
}

function walkSelectors(law: Law, emit: (selector: Selector, path: string[]) => void): void {
  const applies = law.applies_to ?? [];
  for (let i = 0; i < applies.length; i += 1) {
    emit(applies[i], ["applies_to", String(i)]);
  }
  if (law.predicate.selector) {
    emit(law.predicate.selector, ["predicate", "selector"]);
  }
}

function crossReferenceIssues(doc: Constitution): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const roles = doc.binds.roles;
  const roleSeen = new Map<string, number>();
  for (let i = 0; i < roles.length; i += 1) {
    const name = roles[i].role;
    if (roleSeen.has(name)) {
      errors.push({
        code: "E_DUP_ROLE",
        path: pointer(["binds", "roles", i, "role"]),
        message: `Role "${name}" is not unique.`,
      });
    } else {
      roleSeen.set(name, i);
    }
  }
  const boundRoles = new Set(roles.map((role) => role.role));

  const surfaces = doc.surfaces ?? [];
  const surfaceSeen = new Map<string, number>();
  for (let i = 0; i < surfaces.length; i += 1) {
    const id = surfaces[i].id;
    if (surfaceSeen.has(id)) {
      errors.push({
        code: "E_DUP_SURFACE",
        path: pointer(["surfaces", i, "id"]),
        message: `Surface id "${id}" is not unique.`,
      });
    } else {
      surfaceSeen.set(id, i);
    }
  }
  const surfaceIds = new Set(surfaces.map((surface) => surface.id));

  const invariantIds = new Map<string, number>();
  for (let i = 0; i < doc.invariants.length; i += 1) {
    const id = doc.invariants[i].id;
    if (invariantIds.has(id)) {
      errors.push({
        code: "E_DUP_INVARIANT_ID",
        path: pointer(["invariants", i, "id"]),
        message: `Invariant id "${id}" is not unique.`,
      });
    } else {
      invariantIds.set(id, i);
    }
  }

  const forbiddenIds = new Map<string, number>();
  const forbiddens = doc.forbiddens ?? [];
  for (let i = 0; i < forbiddens.length; i += 1) {
    const id = forbiddens[i].id;
    if (forbiddenIds.has(id)) {
      errors.push({
        code: "E_DUP_FORBIDDEN_ID",
        path: pointer(["forbiddens", i, "id"]),
        message: `Forbidden id "${id}" is not unique.`,
      });
    } else {
      forbiddenIds.set(id, i);
    }
    if (invariantIds.has(id)) {
      errors.push({
        code: "E_ID_COLLISION",
        path: pointer(["forbiddens", i, "id"]),
        message: `Forbidden id "${id}" collides with an invariant id.`,
      });
    }
  }

  let primaryCount = 0;
  let accentCount = 0;

  for (const { law, path } of collectLaws(doc)) {
    const kind = law.predicate.kind;
    if (kind === "single_primary_action_role") {
      primaryCount += 1;
      if (primaryCount > 1) {
        errors.push({
          code: "E_DUP_SINGLE_PRIMARY",
          path: pointer([...path, "predicate"]),
          message: "A document MUST contain at most one single_primary_action_role predicate.",
        });
      }
    }
    if (kind === "max_accent_roles") {
      accentCount += 1;
      if (accentCount > 1) {
        errors.push({
          code: "E_DUP_MAX_ACCENT",
          path: pointer([...path, "predicate"]),
          message: "A document MUST contain at most one max_accent_roles predicate.",
        });
      }
      const n = law.predicate.n;
      const accents = law.predicate.accent_roles ?? [];
      if (typeof n === "number" && n > accents.length) {
        errors.push({
          code: "E_ACCENT_N",
          path: pointer([...path, "predicate", "n"]),
          message: "max_accent_roles.n MUST be <= accent_roles.length.",
        });
      }
    }
    for (const role of predicateRoles(law.predicate)) {
      if (!boundRoles.has(role)) {
        errors.push({
          code: "E_UNBOUND_ROLE",
          path: pointer([...path, "predicate"]),
          message: `Predicate role "${role}" is not bound in binds.roles.`,
        });
      }
    }
    walkSelectors(law, (selector, selectorPath) => {
      if (selector.surface && !surfaceIds.has(selector.surface)) {
        errors.push({
          code: "E_UNKNOWN_SURFACE",
          path: pointer([...path, ...selectorPath, "surface"]),
          message: `Selector surface "${selector.surface}" is not declared in surfaces.`,
        });
      }
    });
    if (law.severity === "error" && law.breaking_if_removed === false) {
      warnings.push({
        code: "W002",
        path: pointer([...path, "breaking_if_removed"]),
        message: "Error-severity law has breaking_if_removed false.",
      });
    }
  }

  return { errors, warnings };
}

export function validateConstitution(
  input: string | unknown,
  options: ValidateOptions = {},
): ValidationResult {
  const file = options.file ?? "-";
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  let data: unknown;
  if (typeof input === "string" || input instanceof Uint8Array) {
    const parsed = parseJsonBytes(input);
    errors.push(...parsed.errors);
    data = parsed.value;
  } else {
    data = input;
    const objectError = rejectNonDocument(data);
    if (objectError) {
      errors.push(objectError);
    } else if (jsonNeedsDepthCheck(data) && depthOf(data) > 32) {
      errors.push({
        code: "E_DEPTH",
        path: "",
        message: "JSON nesting exceeds 32 levels.",
      });
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      file,
      spec: "0.1",
      errors: sortIssues(errors),
      warnings: sortIssues(warnings),
    };
  }

  errors.push(...schemaIssues(data));
  if (errors.length > 0) {
    return {
      ok: false,
      file,
      spec: "0.1",
      errors: sortIssues(errors),
      warnings: sortIssues(warnings),
    };
  }

  const doc = data as Constitution;
  const xref = crossReferenceIssues(doc);
  errors.push(...xref.errors);
  warnings.push(...xref.warnings);
  errors.push(...validateDtcgBoundary(doc, file));

  return {
    ok: errors.length === 0,
    file,
    spec: "0.1",
    errors: sortIssues(errors),
    warnings: sortIssues(warnings),
  };
}

function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.message !== b.message) return a.message < b.message ? -1 : 1;
    return 0;
  });
}

function jsonNeedsDepthCheck(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function depthOf(value: unknown): number {
  if (value === null || typeof value !== "object") return 0;
  const children = Array.isArray(value) ? value : Object.values(value);
  let max = 0;
  for (const child of children) {
    const depth = depthOf(child);
    if (depth > max) max = depth;
  }
  return 1 + max;
}
