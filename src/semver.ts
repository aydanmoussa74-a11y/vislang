import type { DiffClass } from "./diff-types.ts";

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export interface SemVer {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

export type SemverPolicy = "nonbreaking" | "additive" | "breaking";

export interface SemverCheckResult {
  ok: boolean;
  old?: SemVer;
  new?: SemVer;
  aggregate: DiffClass;
  treatedAs?: SemverPolicy;
  reason: string;
}

export function parseSemVer(input: string): SemVer | undefined {
  const match = SEMVER.exec(input);
  if (!match) return undefined;
  const parsed: SemVer = {
    raw: input,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (match[4] !== undefined) parsed.prerelease = match[4];
  if (match[5] !== undefined) parsed.build = match[5];
  return parsed;
}

export function compareNumericTriple(oldVer: SemVer, newVer: SemVer): number {
  if (newVer.major !== oldVer.major) return newVer.major > oldVer.major ? 1 : -1;
  if (newVer.minor !== oldVer.minor) return newVer.minor > oldVer.minor ? 1 : -1;
  if (newVer.patch !== oldVer.patch) return newVer.patch > oldVer.patch ? 1 : -1;
  return 0;
}

export function semverPolicyFor(aggregate: DiffClass): SemverPolicy {
  return aggregate === "unknown" ? "breaking" : aggregate;
}

export function checkSemverCompatibility(
  oldVersion: string,
  newVersion: string,
  aggregate: DiffClass,
): SemverCheckResult {
  const oldVer = parseSemVer(oldVersion);
  const newVer = parseSemVer(newVersion);
  if (!oldVer || !newVer) {
    return {
      ok: false,
      old: oldVer,
      new: newVer,
      aggregate,
      reason: !oldVer && !newVer
        ? "Both constitution versions are not valid SemVer 2.0.0."
        : !oldVer
          ? "Old constitution version is not valid SemVer 2.0.0."
          : "New constitution version is not valid SemVer 2.0.0.",
    };
  }

  const treatedAs = semverPolicyFor(aggregate);
  const cmp = compareNumericTriple(oldVer, newVer);

  if (treatedAs === "nonbreaking") {
    return {
      ok: cmp >= 0,
      old: oldVer,
      new: newVer,
      aggregate,
      treatedAs,
      reason:
        cmp >= 0
          ? "Nonbreaking changes allow any version greater than or equal to the old numeric triple."
          : "Nonbreaking changes require the new numeric triple to be greater than or equal to the old version.",
    };
  }

  if (treatedAs === "additive") {
    const increasedMinorOrMajor =
      newVer.major > oldVer.major || newVer.minor > oldVer.minor;
    const ok = cmp > 0 && increasedMinorOrMajor;
    return {
      ok,
      old: oldVer,
      new: newVer,
      aggregate,
      treatedAs,
      reason: ok
        ? "Additive changes increase minor or major."
        : "Additive changes require a version greater than old that increases minor or major; patch-only is not enough.",
    };
  }

  const ok = newVer.major > oldVer.major;
  return {
    ok,
    old: oldVer,
    new: newVer,
    aggregate,
    treatedAs,
    reason: ok
      ? "Breaking or unknown changes increase major."
      : "Breaking or unknown changes require the new major version to be greater than the old major version.",
  };
}
