// Tests for check-package.ts. The statements are pure functions of the tarball's contents, so they are called on a
// synthetic good package; the build and pack are run once through the script on the real repository.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HERE } from "./gate-step.ts";
import { CANNOT, FINDING, PASS } from "./pinned.ts";
import {
  analyse,
  attwProblems,
  CANARIES,
  check,
  missedCanaries,
  planted,
  publintProblems,
  runnable,
  verdict,
} from "./check-package.ts";
import type { Contents, Repo } from "./check-package.ts";

const REPO: Repo = {
  license: Buffer.from("MIT License\n"),
  notice: Buffer.from("Notices\n"),
};
const MANIFEST = {
  name: "@hniedner/sveltedt",
  type: "module",
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
    LICENSE: REPO.license.toString(),
    NOTICE: REPO.notice.toString(),
    "dist/index.js": 'export { default as A } from "./A.svelte";\n',
    "dist/index.d.ts": "export {};\n",
    "dist/A.svelte": "<div></div>\n",
    "dist/A.svelte.d.ts": "export {};\n",
    "dist/styles.css": ".sdt {}\n",
  }).map(([k, v]) => [k, Buffer.from(v)]),
);
const found = (c: Contents, id: string): string[] =>
  analyse(c, REPO)
    .filter((f) => f.id === id)
    .map((f) => f.message);

test("the synthetic good package gives no finding, and every canary row gives its stated result", () => {
  assert.deepEqual(analyse(GOOD, REPO), []);
  assert.deepEqual(missedCanaries(GOOD, REPO), []);
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
test("PKG-07: the finding names the file and the specifier, in any import or re-export form", () => {
  const c = new Map(GOOD).set(
    "dist/A.svelte",
    Buffer.from(
      'import {\n  a,\n} from "../x/y.ts";\nexport * from "./z.ts";\nconst m = import("./w.ts");\nimport "./v.ts";\nimport { ok } from "./fine.js";\nimport u from "pkg/x.ts";\n',
    ),
  );
  assert.deepEqual(found(c, "PKG-07"), [
    "dist/A.svelte imports ../x/y.ts",
    "dist/A.svelte imports ./z.ts",
    "dist/A.svelte imports ./w.ts",
    "dist/A.svelte imports ./v.ts",
  ]);
});
test("PKG-07: only .svelte and .js files are run, declarations are not", () => {
  assert.deepEqual(runnable(GOOD).sort(), ["dist/A.svelte", "dist/index.js"]);
  assert.deepEqual(runnable(new Map([["dist/a.d.ts", Buffer.from("x")]])), []);
});
test("PKG-05: a condition besides style and default, and two different files, are findings", () => {
  const manifest = (styles: unknown): Contents =>
    new Map(GOOD).set(
      "package.json",
      Buffer.from(JSON.stringify({ exports: { "./styles.css": styles } })),
    );
  assert.deepEqual(
    found(
      manifest({
        style: "./dist/styles.css",
        default: "./dist/styles.css",
        import: "./dist/styles.css",
      }),
      "PKG-05",
    ),
    ["the condition import is neither style nor default"],
  );
  assert.deepEqual(
    found(
      manifest({ style: "./dist/styles.css", default: "./dist/A.svelte" }),
      "PKG-05",
    ),
    ["style and default name different files"],
  );
});
test("PKG-04: the finding names the file and how it differs", () => {
  const c = new Map(GOOD).set("NOTICE", Buffer.from("x"));
  c.delete("LICENSE");
  assert.deepEqual(found(c, "PKG-04"), [
    "LICENSE is not in the tarball",
    "NOTICE differs from the repository's",
  ]);
});
test("PKG-03: the finding names the file and what is wrong with it", () => {
  const c = new Map(GOOD).set("dist/a.test.js", Buffer.from("x"));
  assert.deepEqual(found(c, "PKG-03"), ["dist/a.test.js: a test file"]);
});

// publint and attw run on tarballs made from the synthetic package, each under a name in a new folder
const ROOT = join(HERE, "..");
const tmp = mkdtempSync(join(tmpdir(), "package-tools-"));
const withManifest = (change: (m: Record<string, unknown>) => void): string => {
  const m = JSON.parse(GOOD.get("package.json")?.toString() ?? "") as Record<
    string,
    unknown
  >;
  change(m);
  return planted(
    new Map(GOOD).set("package.json", Buffer.from(JSON.stringify(m))),
    tmp,
    `t${String(Math.random()).slice(2)}`,
  );
};
test("PKG-02: publint reports nothing on the good package, an error for a missing file and a warning for a bad repository", () => {
  assert.deepEqual(
    publintProblems(
      ROOT,
      withManifest(() => {}),
    ),
    [],
  );
  const missing = publintProblems(
    ROOT,
    withManifest((m) => {
      (m.exports as Record<string, Record<string, string>>)["."].svelte =
        "./dist/missing.js";
    }),
  );
  assert.match(missing?.join("\n") ?? "", /^Errors: 1\. .*missing\.js/m);
  const repository = publintProblems(
    ROOT,
    withManifest((m) => {
      m.repository = "not a url";
    }),
  );
  assert.match(repository?.join("\n") ?? "", /^Warnings: 1\. pkg\.repository/m);
});
test("PKG-02: a tarball with no package is could not check, not a pass", () => {
  assert.equal(
    publintProblems(
      ROOT,
      planted(new Map([["x.txt", Buffer.from("x")]]), tmp, "none"),
    ),
    undefined,
  );
});
test("attw: nothing on the good package, a problem for a types file the tarball lacks", () => {
  assert.deepEqual(
    attwProblems(
      ROOT,
      withManifest(() => {}),
    ),
    [],
  );
  const bad = attwProblems(
    ROOT,
    withManifest((m) => {
      (m.exports as Record<string, Record<string, string>>)["."].types =
        "./dist/missing.d.ts";
    }),
  );
  assert.ok(bad && bad.length > 0);
  assert.equal(
    attwProblems(
      ROOT,
      planted(new Map([["x.txt", Buffer.from("x")]]), tmp, "none2"),
    ),
    undefined,
  );
});
test("the verdict: pass, finding, and could not check for an unreadable manifest or no file to read", () => {
  assert.equal(verdict(GOOD, REPO).code, PASS);
  const bad = new Map(GOOD).set("dist/a.test.js", Buffer.from("x"));
  assert.equal(verdict(bad, REPO).code, FINDING);
  const noManifest = new Map(GOOD).set("package.json", Buffer.from("{"));
  assert.match(
    verdict(noManifest, REPO).summary,
    /package\.json cannot be read/,
  );
  const onlyTypes = new Map(
    [...GOOD].filter(([p]) => !/\.(?:svelte|js)$/.test(p)),
  );
  const r = verdict(onlyTypes, REPO);
  assert.equal(r.code, CANNOT);
  assert.match(r.summary, /no \.svelte or \.js file/);
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
  for (const f of ["LICENSE", "NOTICE"]) writeFileSync(join(root, f), "x");
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
