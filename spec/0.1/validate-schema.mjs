import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

const root = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(root, "schema.json"), "utf8"));
const validDir = join(root, "fixtures", "valid");
const invalidDir = join(root, "fixtures", "invalid");

const ajv = new Ajv({
  strict: false,
  allErrors: true,
});
const validate = ajv.compile(schema);

function loadJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      name,
      data: JSON.parse(readFileSync(join(dir, name), "utf8")),
    }));
}

let failed = 0;

for (const fixture of loadJsonFiles(validDir)) {
  const ok = validate(fixture.data);
  if (!ok) {
    failed += 1;
    console.error(`FAIL valid/${fixture.name} should pass`);
    console.error(validate.errors);
  } else {
    console.log(`PASS valid/${fixture.name}`);
  }
}

for (const fixture of loadJsonFiles(invalidDir)) {
  const ok = validate(fixture.data);
  if (ok) {
    failed += 1;
    console.error(`FAIL invalid/${fixture.name} should be rejected`);
  } else {
    console.log(`PASS invalid/${fixture.name}`);
  }
}

const validCount = loadJsonFiles(validDir).length;
const invalidCount = loadJsonFiles(invalidDir).length;
console.log(`\n${validCount} valid, ${invalidCount} invalid fixtures`);

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed`);
  process.exit(1);
}

console.log("\nAll schema fixtures passed");
