export type Severity = "error" | "warning";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  file: string;
  spec: "0.1";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidateOptions {
  file?: string;
}

export interface Selector {
  surface?: string;
  component?: string;
  part?: string;
  state?: string;
}

export interface Predicate {
  kind: string;
  role?: string;
  model?: string;
  items?: string[];
  selector?: Selector;
  n?: number;
  accent_roles?: string[];
}

export interface Law {
  id: string;
  statement: string;
  severity: Severity;
  applies_to?: Selector[];
  predicate: Predicate;
  breaking_if_removed?: boolean;
}

export interface RoleBinding {
  role: string;
  required: boolean;
  token?: string;
  fallback?: string;
}

export interface Surface {
  id: string;
  kind: string;
  required: boolean;
}

export interface Constitution {
  vislang: "0.1";
  id: string;
  name: string;
  version: string;
  status: string;
  binds: {
    tokens: {
      format: "dtcg-2025.10" | "none";
      path?: string;
    };
    roles: RoleBinding[];
  };
  invariants: Law[];
  forbiddens?: Law[];
  surfaces?: Surface[];
  metadata?: Record<string, unknown>;
}
