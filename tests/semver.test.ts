import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkSemverCompatibility,
  compareNumericTriple,
  parseSemVer,
  semverPolicyFor,
} from "../src/semver.ts";

test("parse 1.0.0", () => {
  assert.deepEqual(parseSemVer("1.0.0"), {
    raw: "1.0.0",
    major: 1,
    minor: 0,
    patch: 0,
  });
});

test("parse 0.1.0", () => {
  const parsed = parseSemVer("0.1.0");
  assert.equal(parsed?.major, 0);
  assert.equal(parsed?.minor, 1);
  assert.equal(parsed?.patch, 0);
});

test("parse multi-digit 10.20.30", () => {
  const parsed = parseSemVer("10.20.30");
  assert.equal(parsed?.major, 10);
  assert.equal(parsed?.minor, 20);
  assert.equal(parsed?.patch, 30);
});

test("reject malformed versions", () => {
  for (const bad of ["", "1", "1.0", "01.0.0", "1.0.0 ", "v1.0.0", "1.0.0.0", "abc"]) {
    assert.equal(parseSemVer(bad), undefined, bad);
  }
});

test("numeric comparison", () => {
  const a = parseSemVer("1.0.0")!;
  assert.equal(compareNumericTriple(a, parseSemVer("1.0.0")!), 0);
  assert.equal(compareNumericTriple(a, parseSemVer("1.0.1")!), 1);
  assert.equal(compareNumericTriple(a, parseSemVer("1.1.0")!), 1);
  assert.equal(compareNumericTriple(a, parseSemVer("2.0.0")!), 1);
  assert.equal(compareNumericTriple(parseSemVer("1.1.0")!, a), -1);
});

test("unknown is treated as breaking", () => {
  assert.equal(semverPolicyFor("unknown"), "breaking");
  assert.equal(semverPolicyFor("breaking"), "breaking");
});

test("nonbreaking same version passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.0", "nonbreaking").ok, true);
});

test("nonbreaking patch increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.1", "nonbreaking").ok, true);
});

test("nonbreaking minor increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.1.0", "nonbreaking").ok, true);
});

test("nonbreaking major increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "2.0.0", "nonbreaking").ok, true);
});

test("nonbreaking decrease fails", () => {
  assert.equal(checkSemverCompatibility("1.1.0", "1.0.0", "nonbreaking").ok, false);
});

test("additive minor increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.1.0", "additive").ok, true);
});

test("additive major increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "2.0.0", "additive").ok, true);
});

test("additive patch-only fails", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.1", "additive").ok, false);
});

test("additive same version fails", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.0", "additive").ok, false);
});

test("additive decrease fails", () => {
  assert.equal(checkSemverCompatibility("1.1.0", "1.0.0", "additive").ok, false);
});

test("breaking major increase passes", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "2.0.0", "breaking").ok, true);
  assert.equal(checkSemverCompatibility("1.2.3", "2.0.0", "breaking").ok, true);
});

test("breaking minor-only fails", () => {
  assert.equal(checkSemverCompatibility("1.2.3", "1.3.0", "breaking").ok, false);
});

test("breaking patch-only fails", () => {
  assert.equal(checkSemverCompatibility("1.2.3", "1.2.4", "breaking").ok, false);
});

test("breaking same version fails", () => {
  assert.equal(checkSemverCompatibility("1.2.3", "1.2.3", "breaking").ok, false);
});

test("breaking decrease fails", () => {
  assert.equal(checkSemverCompatibility("2.0.0", "1.9.9", "breaking").ok, false);
});

test("0.x breaking requires major increase", () => {
  assert.equal(checkSemverCompatibility("0.1.0", "1.0.0", "breaking").ok, true);
  assert.equal(checkSemverCompatibility("0.1.0", "0.2.0", "breaking").ok, false);
  assert.equal(checkSemverCompatibility("0.1.0", "0.1.1", "breaking").ok, false);
});

test("unknown follows breaking rules", () => {
  assert.equal(checkSemverCompatibility("1.0.0", "2.0.0", "unknown").ok, true);
  assert.equal(checkSemverCompatibility("1.0.0", "1.1.0", "unknown").ok, false);
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.1", "unknown").ok, false);
  assert.equal(checkSemverCompatibility("1.0.0", "1.0.0", "unknown").ok, false);
});

test("numeric boundaries", () => {
  assert.equal(checkSemverCompatibility("1.9.9", "1.10.0", "additive").ok, true);
  assert.equal(checkSemverCompatibility("1.99.99", "2.0.0", "breaking").ok, true);
  assert.equal(checkSemverCompatibility("0.9.9", "1.0.0", "breaking").ok, true);
});

test("malformed versions fail the check", () => {
  const result = checkSemverCompatibility("nope", "1.0.0", "nonbreaking");
  assert.equal(result.ok, false);
  assert.equal(result.old, undefined);
  assert.match(result.reason, /Old constitution version/);
});
