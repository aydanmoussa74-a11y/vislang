#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffConstitutions } from "./diff.ts";
import type { DiffChange, DiffClass, DiffResult } from "./diff-types.ts";
import { checkSemverCompatibility } from "./semver.ts";
import type { ValidationIssue, ValidationResult } from "./types.ts";
import { validateConstitution } from "./validate.ts";

export const EXIT = {
  ok: 0,
  invalid: 1,
  io: 2,
  breaking: 3,
  usage: 64,
} as const;

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{1,63}$/;

const HELP = `Usage: vislang <command> [options] [operands]

Commands:
  validate <file>     Validate a Vislang 0.1 constitution
  diff <old> <new>    Classify semantic changes
  init [dir]          Write <dir>/vislang.json

Operands:
  A filesystem path, or - for stdin.
  At most one operand may be -.

Global flags:
  --json              Machine-readable JSON on stdout
  --quiet             Suppress normal success output
  --no-color          Disable ANSI color (also honors NO_COLOR)
  --help, -h          Show this help and exit 0

diff flags:
  --require-semver    Enforce constitution SemVer against the aggregate class
  --allow-unknown     Keep unknown changes in the report but exclude them from
                      aggregate, exit code, and SemVer enforcement

init flags:
  --id <id>           Constitution id
  --name <name>       Constitution name
  --force             Overwrite an existing vislang.json

Exit codes:
  0   success
  1   invalid constitution (validate)
  2   I/O, parse, incomparable ids
  3   breaking/unknown aggregate, or SemVer failure
  64  usage error
`;

type Command = "validate" | "diff" | "init";

interface ParsedArgs {
  help: boolean;
  json: boolean;
  quiet: boolean;
  noColor: boolean;
  requireSemver: boolean;
  allowUnknown: boolean;
  force: boolean;
  id?: string;
  name?: string;
  command?: Command;
  operands: string[];
  error?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    json: false,
    quiet: false,
    noColor: false,
    requireSemver: false,
    allowUnknown: false,
    force: false,
    operands: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { parsed.help = true; continue; }
    if (arg === "--json") { parsed.json = true; continue; }
    if (arg === "--quiet") { parsed.quiet = true; continue; }
    if (arg === "--no-color") { parsed.noColor = true; continue; }
    if (arg === "--require-semver") { parsed.requireSemver = true; continue; }
    if (arg === "--allow-unknown") { parsed.allowUnknown = true; continue; }
    if (arg === "--force") { parsed.force = true; continue; }
    if (arg === "--id" || arg === "--name") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        parsed.error = `${arg} requires a value.`;
        return parsed;
      }
      if (arg === "--id") parsed.id = value;
      else parsed.name = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("-") && arg !== "-") {
      parsed.error = `Unknown flag: ${arg}`;
      return parsed;
    }
    if (!parsed.command) {
      if (arg === "validate" || arg === "diff" || arg === "init") {
        parsed.command = arg;
        continue;
      }
      parsed.error = `Unknown command: ${arg}`;
      return parsed;
    }
    parsed.operands.push(arg);
  }
  return parsed;
}

function colorEnabled(args: ParsedArgs, stdoutTty: boolean): boolean {
  if (args.noColor || args.json) return false;
  if (process.env.NO_COLOR) return false;
  return stdoutTty;
}

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

function readOperand(operand: string): { ok: true; text: string; file: string } | { ok: false; code: number; message: string } {
  if (operand === "-") {
    return { ok: true, text: readFileSync(0, "utf8"), file: "-" };
  }
  try {
    return { ok: true, text: readFileSync(operand, "utf8"), file: operand };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: EXIT.io, message: `Cannot read ${operand}: ${message}` };
  }
}

function validateExit(result: ValidationResult): number {
  if (result.ok) return EXIT.ok;
  const ioCodes = new Set(["E_PARSE", "E_NOT_OBJECT", "E_FILE_TOO_LARGE", "E_DEPTH", "E_DTCG_STDIN"]);
  if (result.errors.some((issue) => ioCodes.has(issue.code))) return EXIT.io;
  return EXIT.invalid;
}

function formatIssues(label: string, issues: ValidationIssue[], color: boolean, code: string): string {
  if (issues.length === 0) return "";
  const lines = [`${label}:`];
  for (const issue of issues) {
    lines.push(paint(color, code, `  ${issue.code} ${issue.path || "/"} ${issue.message}`));
  }
  return lines.join("\n");
}

function defaultConstitution(id: string, name: string): string {
  return `${JSON.stringify({
    vislang: "0.1",
    id,
    name,
    version: "0.1.0",
    status: "draft",
    binds: {
      tokens: { format: "none" },
      roles: [{ role: "action.primary", required: true, fallback: "#000000" }],
    },
    invariants: [{
      id: "INV-PRIMARY-01",
      statement: "One primary action role is bound.",
      severity: "error",
      applies_to: [{}],
      predicate: { kind: "single_primary_action_role", role: "action.primary" },
    }],
  }, null, 2)}\n`;
}

export function effectiveAggregate(result: DiffResult, allowUnknown: boolean): DiffClass {
  const raw = result.aggregate ?? "nonbreaking";
  if (!allowUnknown) return raw;
  if (result.breaking.length > 0) return "breaking";
  if (result.additive.length > 0) return "additive";
  return "nonbreaking";
}

function diffExit(effective: DiffClass, semverOk: boolean): number {
  if (!semverOk) return EXIT.breaking;
  if (effective === "breaking" || effective === "unknown") return EXIT.breaking;
  return EXIT.ok;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
function writeErr(message: string): void {
  process.stderr.write(`${message}\n`);
}
function writeOut(message: string, args: ParsedArgs): void {
  if (args.quiet || args.json) return;
  process.stdout.write(`${message}\n`);
}
function formatChange(change: DiffChange): string {
  const field = change.field ? ` ${change.field}` : "";
  return `${change.class} ${change.collection} ${change.op} ${change.id || "(document)"}${field} ${change.message}`;
}

export function runCli(argv: string[], options: { stdoutTty?: boolean } = {}): number {
  const args = parseArgs(argv);
  const color = colorEnabled(args, options.stdoutTty === true);
  if (args.error) {
    writeErr(args.error);
    writeErr("Use --help for usage.");
    return EXIT.usage;
  }
  if (args.help || (!args.command && argv.length === 0)) {
    process.stdout.write(HELP);
    return EXIT.ok;
  }
  if (!args.command) {
    writeErr("Missing command.");
    return EXIT.usage;
  }
  if (args.command === "validate") {
    if (args.requireSemver || args.allowUnknown || args.force || args.id || args.name) {
      writeErr("validate does not accept that flag.");
      return EXIT.usage;
    }
    if (args.operands.length !== 1) {
      writeErr("validate requires exactly one file operand.");
      return EXIT.usage;
    }
    const loaded = readOperand(args.operands[0]);
    if (!loaded.ok) {
      writeErr(loaded.message);
      return loaded.code;
    }
    const result = validateConstitution(loaded.text, { file: loaded.file });
    const code = validateExit(result);
    if (args.json) {
      printJson({ ok: result.ok, file: result.file, spec: result.spec, errors: result.errors, warnings: result.warnings });
    } else if (code === EXIT.ok) {
      writeOut(`valid ${result.file}`, args);
      if (result.warnings.length > 0 && !args.quiet) {
        process.stderr.write(`${formatIssues("warnings", result.warnings, color, "33")}\n`);
      }
    } else {
      writeErr(`invalid ${result.file}`);
      const block = [formatIssues("errors", result.errors, color, "31"), formatIssues("warnings", result.warnings, color, "33")].filter(Boolean).join("\n");
      if (block) writeErr(block);
    }
    return code;
  }
  if (args.command === "diff") {
    if (args.force || args.id || args.name) {
      writeErr("diff does not accept that flag.");
      return EXIT.usage;
    }
    if (args.operands.length !== 2) {
      writeErr("diff requires exactly two operands.");
      return EXIT.usage;
    }
    const [oldPath, newPath] = args.operands;
    if (oldPath === "-" && newPath === "-") {
      writeErr("At most one operand may be stdin.");
      return EXIT.usage;
    }
    const oldLoaded = readOperand(oldPath);
    if (!oldLoaded.ok) { writeErr(oldLoaded.message); return oldLoaded.code; }
    const newLoaded = readOperand(newPath);
    if (!newLoaded.ok) { writeErr(newLoaded.message); return newLoaded.code; }
    const diff = diffConstitutions(oldLoaded.text, newLoaded.text, { oldFile: oldLoaded.file, newFile: newLoaded.file });
    if (!diff.ok) {
      const reason = diff.reason === "invalid_old" ? "Old constitution is invalid." : diff.reason === "invalid_new" ? "New constitution is invalid." : "Constitutions are incomparable because their ids differ.";
      if (args.json) {
        printJson({ ok: false, reason: diff.reason, old: diff.oldValidation, new: diff.newValidation, breaking: [], additive: [], nonbreaking: [], unknown: [], semver_ok: true });
      } else writeErr(reason);
      return EXIT.io;
    }
    const effective = effectiveAggregate(diff, args.allowUnknown);
    let semverOk = true;
    let semverReason = "";
    if (args.requireSemver) {
      const check = checkSemverCompatibility(diff.old ?? "", diff.new ?? "", effective);
      semverOk = check.ok;
      semverReason = check.reason;
    }
    const payload = { old: diff.old, new: diff.new, id: diff.id, aggregate: effective, breaking: diff.breaking, additive: diff.additive, nonbreaking: diff.nonbreaking, unknown: diff.unknown, semver_ok: semverOk };
    const code = diffExit(effective, semverOk);
    if (args.json) printJson(payload);
    else if (code === EXIT.ok) {
      writeOut(`aggregate ${effective}`, args);
      if (!args.quiet) {
        for (const change of [...diff.breaking, ...diff.unknown, ...diff.additive, ...diff.nonbreaking]) {
          process.stdout.write(`${formatChange(change)}\n`);
        }
      }
    } else {
      writeErr(`aggregate ${effective}`);
      for (const change of [...diff.breaking, ...diff.unknown, ...diff.additive, ...diff.nonbreaking]) writeErr(formatChange(change));
      if (args.requireSemver && !semverOk) writeErr(`semver ${semverReason}`);
    }
    return code;
  }
  if (args.requireSemver || args.allowUnknown) {
    writeErr("init does not accept that flag.");
    return EXIT.usage;
  }
  if (args.operands.length > 1) {
    writeErr("init accepts at most one directory operand.");
    return EXIT.usage;
  }
  const id = args.id ?? "example";
  const name = args.name ?? "Example";
  if (!ID_PATTERN.test(id)) {
    writeErr("--id must match ^[A-Za-z][A-Za-z0-9._-]{1,63}$");
    return EXIT.usage;
  }
  const dir = resolve(args.operands[0] ?? ".");
  const file = join(dir, "vislang.json");
  if (existsSync(file) && !args.force) {
    writeErr(`${file} already exists. Use --force to overwrite.`);
    return EXIT.io;
  }
  const generated = defaultConstitution(id, name);
  const generatedCheck = validateConstitution(generated, { file });
  if (!generatedCheck.ok) {
    writeErr(`Generated constitution failed validation for ${file}.`);
    const block = formatIssues("errors", generatedCheck.errors, color, "31");
    if (block) writeErr(block);
    return validateExit(generatedCheck);
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, generated, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeErr(`Cannot write ${file}: ${message}`);
    return EXIT.io;
  }
  if (args.json) printJson({ ok: true, file });
  else writeOut(`wrote ${file}`, args);
  return EXIT.ok;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(runCli(process.argv.slice(2), { stdoutTty: Boolean(process.stdout.isTTY) }));
}
