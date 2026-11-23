// Tests for red-check.ts. The readers are pure, so they are called directly on git's and Vitest's own formats; the
// step runs through check-repo.ts on fixture repositories with real commits, a real offline install and real Vitest.
import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  canaryDir,
  commit,
  expect,
  git,
  here,
  put,
  run,
  tempDir,
} from "./check-repo.fixture.ts";
import { CANNOT, FINDING, PASS } from "./pinned.ts";
import { loadFailure, readChange } from "./red-check.ts";

const REAL = "/tree";
test("loadFailure: a missing import is red only when the commit adds that file", () => {
  const vite = (spec: string, from: string) =>
    `Failed to resolve import "${spec}" from "${from}". Does the file exist?`;
  const load = (spec: string, from: string, added: string) =>
    loadFailure(vite(spec, from), from, new Set([added]), REAL);
  assert.equal(load("./b", "src/a.test.ts", "src/b.ts"), "red");
  assert.equal(load("../x", "site/src/L.svelte", "site/x.ts"), "red");
  assert.match(
    load("./b", "src/a.test.ts", "src/c.ts"),
    /^the file did not load: Failed to resolve import "\.\/b"/,
  );
  // a package name is never a file the commit adds, even beside a file of that name
  assert.match(
    load("b", "src/a.test.ts", "src/b.ts"),
    /^the file did not load/,
  );
});
test("readChange: tests, their support, renames and what counts as source", () => {
  const c = readChange(
    "s",
    "x",
    [
      "M",
      "docs/a.md",
      "M",
      "scripts/x.ts",
      "M",
      "package.json",
      "R100",
      "src/a.test.ts",
      "src/b.test.ts",
      "D",
      "test/old.ts",
      "A",
      "test/new.ts",
      "D",
      "src/gone.test.ts",
      "M",
      "site/browser/s.spec.ts",
      "",
    ].join("\0"),
  );
  assert.equal(c.source, false);
  assert.deepEqual(c.tests, [{ now: "src/b.test.ts", old: "src/a.test.ts" }]);
  assert.deepEqual(c.support, [
    { path: "test/old.ts", deleted: true },
    { path: "test/new.ts", deleted: false },
  ]);
  assert.deepEqual([...c.added], ["src/b.test.ts", "test/new.ts"]);
  for (const path of ["src/C.svelte", "site/server.ts"])
    assert.equal(readChange("s", "x", `M\0${path}\0`).source, true, path);
});

// The step on a fixture repository: the real manifest, lockfile and workspace (an offline install from the store
// works), a Svelte and jsdom config, and origin/main at the first commit. Each row commits on top.
const CONFIG = `import { svelte } from "@sveltejs/vite-plugin-svelte";
export default {
  plugins: [svelte()],
  resolve: { conditions: ["browser"] },
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
};
`;
const A =
  "export function f(x: number | null): number {\n  return x!.valueOf() + 1;\n}\n";
const A_TEST =
  'import { expect, test } from "vitest";\nimport { f } from "./a.ts";\ntest("f adds one", () => {\n  expect(f(1)).toBe(2);\n});\n';
function fixture(config = CONFIG): string {
  const root = tempDir();
  // The site is its own package: an import from it of the package's name is not a self-reference but needs the link
  for (const f of ["package.json", "site/package.json"]) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    copyFileSync(join(here, "..", f), join(root, f));
  }
  put(root, "vitest.config.ts", config);
  put(root, ".gitignore", "/node_modules\n/site/node_modules\n/reports/\n");
  // The checked tree's packages, as a workspace installs them: the root folder and the site's link to the package
  symlinkSync(join(here, "..", "node_modules"), join(root, "node_modules"));
  mkdirSync(join(root, "site", "node_modules", "@hniedner"), {
    recursive: true,
  });
  symlinkSync(
    "../../..",
    join(root, "site", "node_modules", "@hniedner", "sveltedt"),
  );
  put(root, "src/a.ts", A);
  put(root, "src/a.test.ts", A_TEST);
  git(root, "init", "-q");
  commit(root, "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return root;
}
const step = (root: string, code: number) =>
  expect("red-check", root, code, { pnpm: "" });
const vt = (body: string, imports = 'import { f } from "./a.ts";\n') =>
  `import { describe, expect, test } from "vitest";\n${imports}${body}`;
const F_NULL =
  "export function f(x: number | null): number {\n  return (x ?? 0) + 1;\n}\n";

test("red-check step: a new test that already passes on the parent is refused", () => {
  const root = fixture();
  put(root, "src/a.ts", F_NULL);
  put(
    root,
    "src/n.test.ts",
    vt('test("f(2) is 3", () => {\n  expect(f(2)).toBe(3);\n});\n'),
  );
  commit(root, "feat: a change and a test that does not need it");
  const out = step(root, FINDING);
  assert.match(out, /no new test red on the parent: src\/n\.test\.ts$/m);
  assert.match(
    out,
    /passes on the parent \(proof: mutation, #136\): src\/n\.test\.ts: f\(2\) is 3$/m,
  );
});
test("red-check step: a red caused by an import error is refused", () => {
  const root = fixture();
  put(root, "src/a.ts", F_NULL);
  put(
    root,
    "src/n.test.ts",
    vt(
      'test("g", () => {\n  expect(g()).toBe(1);\n});\n',
      'import { g } from "./gone.ts";\n',
    ),
  );
  commit(root, "feat: a test of a module nobody adds");
  assert.match(
    step(root, FINDING),
    /src\/n\.test\.ts: the file did not load: .*\.\/gone\.ts/,
  );
});
test("red-check step: a new test with no run on the parent cannot be checked", () => {
  const root = fixture();
  put(root, "src/a.ts", F_NULL);
  put(
    root,
    "src/n.test.ts",
    vt('test.skip("f(null) is 1", () => {\n  expect(f(null)).toBe(1);\n});\n'),
  );
  commit(root, "feat: a skipped test");
  assert.match(
    step(root, CANNOT),
    /did not run: src\/n\.test\.ts: f\(null\) is 1: skipped$/m,
  );
});
test("red-check step: any failed test is red, an error it throws as well as an assertion", () => {
  const root = fixture();
  put(root, "src/a.ts", F_NULL);
  put(
    root,
    "src/n.test.ts",
    vt(
      'test("throws", () => {\n  const o = {} as { x: () => number };\n  expect(o.x() + f(null)).toBe(1);\n});\n',
    ),
  );
  commit(root, "feat: a test that throws");
  assert.match(step(root, PASS), /a test that throws: red$/m);
});
test("red-check step: a commit with no source change is test-only, wherever else it changes", () => {
  const root = fixture();
  put(
    root,
    "package.json",
    JSON.stringify({
      ...(JSON.parse(
        readFileSync(join(root, "package.json"), "utf8"),
      ) as object),
      "x-note": 1,
    }),
  );
  put(root, "scripts/x.ts", "export const x = 1;\n");
  put(
    root,
    "src/m.test.ts",
    vt('test("f(3) is 4", () => {\n  expect(f(3)).toBe(4);\n});\n'),
  );
  commit(root, "test: marks and a script change");
  assert.match(step(root, PASS), /m\.test\.ts: f\(3\) is 4$/m);
});
test("red-check step: a test that reads the site build finds the parent's build", () => {
  const root = fixture();
  put(
    root,
    "site/vite.config.ts",
    "export default { root: import.meta.dirname };\n",
  );
  put(root, "site/index.html", "<!doctype html><title>t</title><p>x</p>\n");
  commit(root, "chore: a site");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  put(
    root,
    "src/d.test.ts",
    vt(
      'import { existsSync } from "node:fs";\nconst DIST = "site/dist/index.html";\ntest("the build exists", () => {\n  expect(existsSync(DIST)).toBe(true);\n});\n',
    ),
  );
  commit(root, "test: the build is there");
  assert.match(step(root, PASS), /pinned, not red.*the build exists$/m);
});
test("red-check step: a component red from Testing Library counts", () => {
  const root = fixture();
  put(root, "src/C.svelte", "<p>one</p>\n");
  commit(root, "feat: a component");
  put(root, "src/C.svelte", '<button type="button">one</button>\n');
  put(
    root,
    "src/c.test.ts",
    vt(
      'import { render, screen } from "@testing-library/svelte";\nimport C from "./C.svelte";\ntest("a button", () => {\n  render(C);\n  expect(screen.getByRole("button")).toBeTruthy();\n});\n',
      "",
    ),
  );
  commit(root, "feat: the component is a button");
  assert.match(step(root, PASS), /the component is a button: red$/m);
});
test("red-check step: each statement that gains tests needs one red; passing rows are listed", () => {
  const root = fixture();
  put(root, "src/a.ts", F_NULL);
  put(
    root,
    "src/n.test.ts",
    vt(`// @spec("AB-01", "0123abcd")
describe("AB-01", () => {
  test.each([[null, 1], [1, 2]])("f(%s) is %s", (x, y) => {
    expect(f(x)).toBe(y);
  });
});
// @spec("AB-02", "0123abcd")
describe("AB-02", () => {
  test("f(5) is 6", () => {
    expect(f(5)).toBe(6);
  });
});
`),
  );
  commit(root, "feat: two statements");
  const out = step(root, FINDING);
  assert.match(out, /no new test red on the parent: AB-02$/m);
  assert.doesNotMatch(out, /no new test red on the parent: AB-01/);
  assert.match(
    out,
    /passes on the parent \(proof: mutation, #136\): src\/n\.test\.ts: AB-01 f\(1\) is 2$/m,
  );
});
test("red-check step: a test-only commit passes on its parent, pinned; failing there it is a failing commit", () => {
  const root = fixture();
  put(
    root,
    "src/p.test.ts",
    vt('test("f(3) is 4", () => {\n  expect(f(3)).toBe(4);\n});\n'),
  );
  commit(root, "test: pin f(3)");
  assert.match(
    step(root, PASS),
    /pinned, not red \(proof: mutation, #136\): src\/p\.test\.ts: f\(3\) is 4$/m,
  );
  put(
    root,
    "src/q.test.ts",
    vt('test("f(null) is 1", () => {\n  expect(f(null)).toBe(1);\n});\n'),
  );
  commit(root, "test: a test before its code");
  assert.match(
    step(root, FINDING),
    /fails on its own source \(a failing commit\): src\/q\.test\.ts: f\(null\) is 1$/m,
  );
});
test("red-check step: a renamed test file with unchanged names gains no test; a merge is skipped", () => {
  const root = fixture();
  git(root, "checkout", "-q", "-b", "side");
  put(root, "README.md", "# Fixture\n");
  commit(root, "docs: a readme");
  git(root, "checkout", "-q", "-");
  renameSync(join(root, "src/a.test.ts"), join(root, "src/a2.test.ts"));
  put(root, "src/a.ts", A.replace("x!", "(x as number)"));
  commit(root, "refactor: a rename");
  git(
    root,
    "-c",
    "user.name=F",
    "-c",
    "user.email=f@example.org",
    "merge",
    "-q",
    "--no-edit",
    "side",
  );
  const out = step(root, PASS);
  assert.match(out, /a rename: red$/m);
  assert.match(out, /Merge branch 'side'.*: a merge, not checked$/m);
});
test("red-check step: commits without a Vitest test file are not applicable", () => {
  const root = fixture();
  put(root, "docs/spec.md", "# Spec\n");
  commit(root, "docs: a spec");
  const r = run(["red-check", "--root", root], { pnpm: "" });
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE red-check: no commit changes a Vitest test file$/m,
  );
});
test("red-check step: a push to main is left to its pull request", () => {
  const root = fixture();
  const r = run(["red-check", "--root", root], {
    pnpm: "",
    extraEnv: {
      GITHUB_ACTIONS: "true",
      GATE_EVENT: "push",
      GATE_BASE: git(root, "rev-parse", "HEAD").trim(),
    },
  });
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE red-check: a push is checked on its pull request$/m,
  );
});
test("red-check step: a judge that passes the canary cannot check", () => {
  const blind = canaryDir("red-check", {
    "report.json": JSON.stringify({ testResults: [] }),
  });
  const out = expect("red-check", fixture(), CANNOT, {
    canaries: blind,
    pnpm: "",
  });
  assert.match(out, /the judge passed the canary/);
});
test("red-check step: a judge that refuses only one of the two planted results cannot check", () => {
  const half = JSON.stringify({
    testResults: [
      {
        name: "/canary/src/a.test.ts",
        status: "failed",
        assertionResults: [{ fullName: "a fails", status: "failed" }],
      },
      {
        name: "/canary/src/b.test.ts",
        status: "passed",
        assertionResults: [{ fullName: "b passes", status: "passed" }],
      },
    ],
  });
  const out = expect("red-check", fixture(), CANNOT, {
    canaries: canaryDir("red-check", { "report.json": half }),
    pnpm: "",
  });
  assert.match(
    out,
    /the judge passed the canary \(src\/a\.test\.ts: the file did not load\)/,
  );
});
test("red-check step: a test-only commit whose test file cannot load is refused", () => {
  const root = fixture();
  put(root, "scripts/x.ts", "export const x = 1;\n");
  put(
    root,
    "src/n.test.ts",
    vt(
      'test("g", () => {\n  expect(g()).toBe(1);\n});\n',
      'import { g } from "./gone.ts";\n',
    ),
  );
  commit(root, "test: a test of a module nobody adds");
  assert.match(
    step(root, FINDING),
    /src\/n\.test\.ts: the file did not load: .*\.\/gone\.ts/,
  );
});
test("red-check step: a site test is red by the parent's own component, never installed, the site's link kept inside the parent", () => {
  const root = fixture(
    CONFIG.replace(
      '["src/**/*.test.ts"]',
      '["src/**/*.test.ts", "site/**/*.test.ts"]',
    ),
  );
  put(root, "src/lib/index.ts", 'export const word = "old";\n');
  // A lockfile no store can serve: the parent is checked with the checked tree's packages, nothing is installed
  put(
    root,
    "pnpm-lock.yaml",
    "lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      no-such-package:\n        specifier: 1.0.0\n        version: 1.0.0\n",
  );
  commit(
    root,
    "chore: the package says old, with a lockfile no store can serve",
  );
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  put(root, "src/lib/index.ts", 'export const word = "new";\n');
  put(
    root,
    "site/w.test.ts",
    'import { expect, test } from "vitest";\nimport { word } from "@hniedner/sveltedt";\ntest("the site shows new", () => {\n  expect(word).toBe("new");\n});\n',
  );
  commit(root, "feat: the package says new");
  assert.match(step(root, PASS), /the package says new: red$/m);
});
