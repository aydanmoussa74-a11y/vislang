import type { ValidationResult } from "./types.ts";

export type DiffClass = "breaking" | "additive" | "nonbreaking" | "unknown";
export type DiffOp = "add" | "remove" | "modify";
export type DiffCollection =
  | "document"
  | "roles"
  | "invariants"
  | "forbiddens"
  | "surfaces";

export interface DiffChange {
  collection: DiffCollection;
  id: string;
  op: DiffOp;
  class: DiffClass;
  field?: string;
  message: string;
}

export type DiffFailureReason =
  | "invalid_old"
  | "invalid_new"
  | "incomparable_id";

export interface DiffResult {
  ok: boolean;
  reason?: DiffFailureReason;
  oldValidation?: ValidationResult;
  newValidation?: ValidationResult;
  old?: string;
  new?: string;
  id?: string;
  aggregate?: DiffClass;
  breaking: DiffChange[];
  additive: DiffChange[];
  nonbreaking: DiffChange[];
  unknown: DiffChange[];
  semver_ok: boolean;
}

export interface DiffOptions {
  oldFile?: string;
  newFile?: string;
}
