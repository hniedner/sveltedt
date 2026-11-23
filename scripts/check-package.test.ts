// Tests for check-package.ts. The statements are pure functions of the tarball's contents, so they are called on a
// synthetic good package; the build and pack are run once through the script on the real repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HERE } from "./gate-step.ts";
import { CANNOT } from "./pinned.ts";
import { analyse, CANARIES, check, missedCanaries } from "./check-package.ts";
import type { Contents } from "./check-package.ts";

const MANIFEST = {
  name: "@hniedner/sveltedt",
  exports: {
    ".": { types: "./dist/index.d.ts", svelte: "./dist/index.js" },
    "./styles.css": {
      style: "./dist/styles.css",
      default: "./dist/styles.css",
    },
  },
};
const GOOD: Contents = new Map(
  Object.entries({
    "package.json": JSON.stringify(MANIFEST),
    "README.md": "readme",
    LICENSE: "MIT License\n",
    NOTICE: "Notices\n",
    "dist/index.js": 'export { default as A } from "./A.svelte";\n',
    "dist/index.d.ts": "export {};\n",
    "dist/A.svelte": "<div></div>\n",
    "dist/A.svelte.d.ts": "export {};\n",
    "dist/styles.css": ".sdt {}\n",
  }).map(([k, v]) => [k, Buffer.from(v)]),
);
const found = (c: Contents, id: string): string[] =>
  analyse(c)
    .filter((f) => f.id === id)
    .map((f) => f.message);

test("the synthetic good package gives no finding, and every canary row gives its stated result", () => {
  assert.deepEqual(analyse(GOOD), []);
  assert.deepEqual(missedCanaries(GOOD), []);
});
for (const k of CANARIES)
  test(`${k.id} row: ${k.row} is ${k.found ? "a finding" : "not a finding"}`, () => {
    assert.equal(found(k.plant(GOOD), k.id).length > 0, k.found);
  });

test("PKG-01: the finding names the condition and the path", () => {
  const c = new Map(GOOD).set(
    "package.json",
    Buffer.from(
      JSON.stringify({
        exports: { ".": { types: "./dist/a.d.ts", svelte: "./src/a.ts" } },
      }),
    ),
  );
  assert.deepEqual(found(c, "PKG-01"), [
    "svelte is ./src/a.ts, not under ./dist/",
  ]);
});
test("PKG-03: the finding names the file and what is wrong with it", () => {
  const c = new Map(GOOD).set("dist/a.test.js", Buffer.from("x"));
  assert.deepEqual(found(c, "PKG-03"), ["dist/a.test.js: a test file"]);
});

test("the script builds, packs and reads the real package, and passes", () => {
  const r = spawnSync(
    process.execPath,
    [join(HERE, "check-package.ts"), "--root", join(HERE, "..")],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^PASS check-package: /m);
});
test("a root that cannot build is could not check, exit 3", () => {
  const root = mkdtempSync(join(tmpdir(), "package-test-"));
  const r = check(root);
  assert.equal(r.code, CANNOT);
  assert.match(r.summary, /svelte-package exited/);
});
test("an unknown argument is a usage error, exit 2", () => {
  const r = spawnSync(
    process.execPath,
    [join(HERE, "check-package.ts"), "--nope"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
});
