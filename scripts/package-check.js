import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const manifest = JSON.parse(await readFile("package.json", "utf8"));
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
assert.equal(lock.lockfileVersion, 3, "Use the committed npm lockfile");
assert.deepEqual(lock.packages[""].devDependencies, manifest.devDependencies);
for (const [name, version] of Object.entries(manifest.devDependencies)) {
  assert.match(version, /^\d+\.\d+\.\d+$/, `Pin ${name} exactly`);
}
for (const [name, entry] of Object.entries(lock.packages)) {
  if (!name) continue;
  assert.match(
    entry.integrity,
    /^sha512-/,
    `Missing package integrity: ${name}`,
  );
  assert.match(
    entry.resolved,
    /^https:\/\/registry\.npmjs\.org\//,
    `Unexpected package registry: ${name}`,
  );
}
console.log(
  "Package manifest, exact pins, registry and lockfile integrity verified",
);
