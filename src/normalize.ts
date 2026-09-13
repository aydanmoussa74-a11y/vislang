import type { Constitution, Law, Predicate, Selector, Surface } from "./types.ts";

export interface NormalizedLaw {
  id: string;
  statement: string;
  severity: "error" | "warning";
  applies_to: Selector[];
  predicate: Predicate;
  breaking_if_removed: boolean;
}

export interface NormalizedRole {
  role: string;
  required: boolean;
  token?: string;
  fallback?: string;
}

export interface NormalizedDoc {
  id: string;
  name: string;
  version: string;
  status: string;
  tokenFormat: "dtcg-2025.10" | "none";
  tokenPath?: string;
  roles: Map<string, NormalizedRole>;
  invariants: Map<string, NormalizedLaw>;
  forbiddens: Map<string, NormalizedLaw>;
  surfaces: Map<string, Surface>;
  metadata: Record<string, unknown>;
}

const SELECTOR_KEYS = ["surface", "component", "part", "state"] as const;

export function canonicalSelector(selector: Selector): string {
  const ordered: Record<string, string> = {};
  for (const key of SELECTOR_KEYS) {
    const value = selector[key];
    if (value !== undefined) ordered[key] = value;
  }
  return JSON.stringify(ordered);
}

export function normalizeAppliesTo(applies: Selector[] | undefined): Selector[] {
  const list = applies ?? [{}];
  return [...list].sort((a, b) => {
    const left = canonicalSelector(a);
    const right = canonicalSelector(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

export function defaultBreaking(severity: "error" | "warning", explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return severity === "error";
}

function normalizeLaw(law: Law, forbidden: boolean): NormalizedLaw {
  return {
    id: law.id,
    statement: law.statement,
    severity: law.severity,
    applies_to: normalizeAppliesTo(
      law.applies_to ?? (forbidden ? [{}] : law.applies_to),
    ),
    predicate: law.predicate,
    breaking_if_removed: defaultBreaking(law.severity, law.breaking_if_removed),
  };
}

export function normalizeConstitution(doc: Constitution): NormalizedDoc {
  const roles = new Map<string, NormalizedRole>();
  for (const role of doc.binds.roles) {
    roles.set(role.role, {
      role: role.role,
      required: role.required,
      token: role.token,
      fallback: role.fallback,
    });
  }

  const invariants = new Map<string, NormalizedLaw>();
  for (const law of doc.invariants) {
    invariants.set(law.id, normalizeLaw(law, false));
  }

  const forbiddens = new Map<string, NormalizedLaw>();
  for (const law of doc.forbiddens ?? []) {
    forbiddens.set(law.id, normalizeLaw(law, true));
  }

  const surfaces = new Map<string, Surface>();
  for (const surface of doc.surfaces ?? []) {
    surfaces.set(surface.id, surface);
  }

  return {
    id: doc.id,
    name: doc.name,
    version: doc.version,
    status: doc.status,
    tokenFormat: doc.binds.tokens.format,
    tokenPath: doc.binds.tokens.path,
    roles,
    invariants,
    forbiddens,
    surfaces,
    metadata: doc.metadata ?? {},
  };
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!(key in left) || !(key in right)) return false;
    if (!deepEqual(left[key], right[key])) return false;
  }
  return true;
}

export function appliesEqual(a: Selector[], b: Selector[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => canonicalSelector(item) === canonicalSelector(b[index]));
}

export function referencedRoles(doc: NormalizedDoc): Set<string> {
  const names = new Set<string>();
  const scan = (law: NormalizedLaw) => {
    const predicate = law.predicate;
    if (typeof predicate.role === "string") names.add(predicate.role);
    if (Array.isArray(predicate.accent_roles)) {
      for (const role of predicate.accent_roles) names.add(role);
    }
  };
  for (const law of doc.invariants.values()) scan(law);
  for (const law of doc.forbiddens.values()) scan(law);
  return names;
}

export function referencedSurfaces(doc: NormalizedDoc): Set<string> {
  const names = new Set<string>();
  const scanSelector = (selector: Selector) => {
    if (selector.surface) names.add(selector.surface);
  };
  const scan = (law: NormalizedLaw) => {
    for (const selector of law.applies_to) scanSelector(selector);
    if (law.predicate.selector) scanSelector(law.predicate.selector);
  };
  for (const law of doc.invariants.values()) scan(law);
  for (const law of doc.forbiddens.values()) scan(law);
  return names;
}
