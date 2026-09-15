import type { ValidationIssue } from "./types.ts";

export const MAX_BYTES = 1_048_576;
export const MAX_DEPTH = 32;

function utf8Decoder(): TextDecoder {
  return new TextDecoder("utf-8", { fatal: true });
}

export type ParseInput = string | Buffer | Uint8Array;

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function decodeUtf8Strict(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; issue: ValidationIssue } {
  try {
    return { ok: true, text: utf8Decoder().decode(bytes) };
  } catch {
    return {
      ok: false,
      issue: {
        code: "E_UTF8",
        path: "",
        message: "Input is not valid UTF-8.",
      },
    };
  }
}

function inputBytes(input: ParseInput): { bytes?: Uint8Array; text?: string; size: number } {
  if (typeof input === "string") {
    return { text: input, size: Buffer.byteLength(input, "utf8") };
  }
  return { bytes: input, size: input.byteLength };
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
  input: ParseInput,
): { value?: unknown; errors: ValidationIssue[] } {
  const raw = inputBytes(input);
  if (raw.size > MAX_BYTES) {
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

  let decoded = raw.text;
  if (decoded === undefined) {
    const utf8 = decodeUtf8Strict(raw.bytes as Uint8Array);
    if (!utf8.ok) return { errors: [utf8.issue] };
    decoded = utf8.text;
  }

  const text = stripBom(decoded);
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
