import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Constitution, ValidationIssue } from "./types.ts";
import { MAX_BYTES } from "./parse.ts";

const PATH_FIELD = "/binds/tokens/path";

export function posixSegments(raw: string): { ok: true; segments: string[] } | { ok: false; issue: ValidationIssue } {
  if (raw.length === 0) {
    return {
      ok: false,
      issue: {
        code: "E_DTCG_PATH",
        path: PATH_FIELD,
        message: "binds.tokens.path MUST NOT be empty.",
      },
    };
  }
  if (raw.startsWith("/")) {
    return {
      ok: false,
      issue: {
        code: "E_DTCG_PATH",
        path: PATH_FIELD,
        message: "binds.tokens.path MUST NOT be absolute.",
      },
    };
  }

  const segments: string[] = [];
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) {
        return {
          ok: false,
          issue: {
            code: "E_DTCG_ESCAPE",
            path: PATH_FIELD,
            message: "binds.tokens.path escapes the constitution directory.",
          },
        };
      }
      segments.pop();
      continue;
    }
    segments.push(part);
  }

  if (segments.length === 0) {
    return {
      ok: false,
      issue: {
        code: "E_DTCG_PATH",
        path: PATH_FIELD,
        message: "binds.tokens.path MUST be a relative POSIX path to a file.",
      },
    };
  }

  return { ok: true, segments };
}

function containedIn(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function validateDtcgBoundary(
  doc: Constitution,
  constitutionFile: string,
): ValidationIssue[] {
  const format = doc.binds.tokens.format;
  if (format === "none") {
    return [];
  }

  if (constitutionFile === "-" || constitutionFile === "") {
    return [
      {
        code: "E_DTCG_STDIN",
        path: PATH_FIELD,
        message:
          "DTCG path cannot be resolved when the constitution is read from stdin.",
      },
    ];
  }

  const rawPath = doc.binds.tokens.path;
  if (rawPath === undefined) {
    return [
      {
        code: "E_DTCG_PATH",
        path: "/binds/tokens",
        message: "binds.tokens.path is required when format is dtcg-2025.10.",
      },
    ];
  }

  const parsed = posixSegments(rawPath);
  if (!parsed.ok) return [parsed.issue];

  const constitutionDir = path.resolve(path.dirname(constitutionFile));
  const resolved = path.resolve(constitutionDir, ...parsed.segments);

  if (!containedIn(constitutionDir, resolved)) {
    return [
      {
        code: "E_DTCG_ESCAPE",
        path: PATH_FIELD,
        message: "Resolved DTCG path is outside the constitution directory.",
      },
    ];
  }

  let stat;
  try {
    stat = statSync(resolved);
  } catch {
    return [
      {
        code: "E_DTCG_MISSING",
        path: PATH_FIELD,
        message: "Referenced DTCG file does not exist or is not readable.",
      },
    ];
  }

  if (!stat.isFile()) {
    return [
      {
        code: "E_DTCG_MISSING",
        path: PATH_FIELD,
        message: "Referenced DTCG path is not a file.",
      },
    ];
  }

  if (stat.size > MAX_BYTES) {
    return [
      {
        code: "E_DTCG_TOO_LARGE",
        path: PATH_FIELD,
        message: "Referenced DTCG file exceeds 1048576 bytes.",
      },
    ];
  }

  try {
    const realRoot = realpathSync(constitutionDir);
    const realFile = realpathSync(resolved);
    if (!containedIn(realRoot, realFile) && realFile !== realRoot) {
      return [
        {
          code: "E_DTCG_ESCAPE",
          path: PATH_FIELD,
          message: "Resolved DTCG path is outside the constitution directory.",
        },
      ];
    }
  } catch {
    return [
      {
        code: "E_DTCG_UNREADABLE",
        path: PATH_FIELD,
        message: "Referenced DTCG file is not readable.",
      },
    ];
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(resolved);
  } catch {
    return [
      {
        code: "E_DTCG_UNREADABLE",
        path: PATH_FIELD,
        message: "Referenced DTCG file is not readable.",
      },
    ];
  }

  if (bytes.byteLength > MAX_BYTES) {
    return [
      {
        code: "E_DTCG_TOO_LARGE",
        path: PATH_FIELD,
        message: "Referenced DTCG file exceeds 1048576 bytes.",
      },
    ];
  }

  try {
    JSON.parse(bytes.toString("utf8"));
  } catch {
    return [
      {
        code: "E_DTCG_JSON",
        path: PATH_FIELD,
        message: "Referenced DTCG file is not valid JSON.",
      },
    ];
  }

  return [];
}
