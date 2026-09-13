import type { ValidationIssue } from "./types.ts";

export const MAX_BYTES = 1_048_576;
export const MAX_DEPTH = 32;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function jsonDepth(value: unknown): number {
  if (value === null || typeof value !== "object") {
    return 0;
  }
  const children = Array.isArray(value) ? value : Object.values(value);
  if (children.length === 0) {
    return 1;
  }
  let max = 0;
  for (const child of children) {
    const depth = jsonDepth(child);
    if (depth > max) max = depth;
  }
  return 1 + max;
}

export function parseJsonBytes(
  input: string,
): { value?: unknown; errors: ValidationIssue[] } {
  if (Buffer.byteLength(input, "utf8") > MAX_BYTES) {
    return {
      errors: [
        {
          code: "E_FILE_TOO_LARGE",
          path: "",
          message: "Document exceeds 1048576 bytes.",
        },
      ],
    };
  }

  const text = stripBom(input);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    return {
      errors: [{ code: "E_PARSE", path: "", message }],
    };
  }

  const objectError = rejectNonDocument(value);
  if (objectError) {
    return { errors: [objectError] };
  }

  if (jsonDepth(value) > MAX_DEPTH) {
    return {
      errors: [
        {
          code: "E_DEPTH",
          path: "",
          message: "JSON nesting exceeds 32 levels.",
        },
      ],
    };
  }

  return { value, errors: [] };
}

export function rejectNonDocument(value: unknown): ValidationIssue | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      code: "E_NOT_OBJECT",
      path: "",
      message: "Document MUST be a single JSON object.",
    };
  }
  return undefined;
}
