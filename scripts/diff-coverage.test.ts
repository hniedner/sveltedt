// Tests for diff-coverage.ts. The reader is pure, so judge() is called directly on diffs and lcov reports in git's
// and Vitest's own formats; the step itself runs through check-repo.ts on a fixture repository with the real Vitest.
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { judge } from "./diff-coverage.ts";
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

const NA = 4;

/** A `git diff -U0` of one file: `hunks` are [start, count] on the new side. */
const diffOf = (file: string, ...hunks: [number, number][]): string =>
  [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    ...hunks.map(([s, n]) => `@@ -${s},0 +${s},${n} @@`),
  ].join("\n");
/** An lcov record: `lines` maps a line number to its hit count. */
const lcovOf = (sf: string, lines: Record<number, number>): string =>
  [
    "TN:",
    `SF:${sf}`,
    ...Object.entries(lines).map(([n, h]) => `DA:${n},${h}`),
    "end_of_record",
  ].join("\n");
/** Lines 1..total with data, the first `covered` of them hit. */
const hits = (total: number, covered: number): Record<number, number> =>
  Object.fromEntries(
    Array.from({ length: total }, (_, i) => [i + 1, i < covered ? 1 : 0]),
  );
const ROOT = tempDir();

test("diff-coverage: an uncovered changed line is a finding naming file and line", () => {
  const r = judge(
    diffOf("src/a.ts", [1, 2]),
    lcovOf("src/a.ts", { 1: 1, 2: 0 }),
    ROOT,
  );
  assert.equal(r.code, FINDING);
  assert.deepEqual(r.details, ["src/a.ts:2"]);
});
test("diff-coverage: exactly 95 % passes and one line less is a finding", () => {
  const diff = diffOf("src/a.ts", [1, 20]);
  assert.equal(judge(diff, lcovOf("src/a.ts", hits(20, 19)), ROOT).code, PASS);
  assert.equal(
    judge(diff, lcovOf("src/a.ts", hits(20, 18)), ROOT).code,
    FINDING,
  );
});
test("diff-coverage: the pass line gives the figure and the lines without coverage data", () => {
  const r = judge(
    diffOf("src/a.ts", [1, 3]),
    lcovOf("src/a.ts", { 1: 1, 2: 3 }),
    ROOT,
  );
  assert.equal(r.code, PASS);
  assert.equal(
    r.summary,
    "2/2 changed lines covered (100.0 %), 1 changed line(s) without coverage data",
  );
});
test("diff-coverage: a changed file missing from the report cannot be checked", () => {
  const r = judge(
    diffOf("src/b.ts", [1, 1]),
    lcovOf("src/a.ts", { 1: 1 }),
    ROOT,
  );
  assert.equal(r.code, CANNOT);
  assert.deepEqual(r.details, ["src/b.ts"]);
});
test("diff-coverage: a report that lists no file cannot be checked", () => {
  const r = judge(diffOf("src/a.ts", [1, 1]), "TN:\n", ROOT);
  assert.equal(r.code, CANNOT);
  assert.match(r.summary, /lists no file/);
});
test("diff-coverage: an absolute SF path under the root matches, one under another root does not", () => {
  put(ROOT, "src/a.ts", "export const a = 1;\n");
  const diff = diffOf("src/a.ts", [1, 1]);
  assert.equal(
    judge(diff, lcovOf(join(ROOT, "src/a.ts"), { 1: 1 }), ROOT).code,
    PASS,
  );
  const other = join(tempDir(), "src/a.ts");
  assert.equal(judge(diff, lcovOf(other, { 1: 1 }), ROOT).code, CANNOT);
});
test("diff-coverage: deleted lines and a deleted file never count and need no record", () => {
  const diff = [
    "diff --git a/src/gone.ts b/src/gone.ts",
    "deleted file mode 100644",
    "--- a/src/gone.ts",
    "+++ /dev/null",
    "@@ -1,3 +0,0 @@",
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -4,2 +3,0 @@",
  ].join("\n");
  assert.equal(judge(diff, lcovOf("src/a.ts", { 3: 0 }), ROOT).code, NA);
});
test("diff-coverage: a renamed file counts only its changed lines", () => {
  const diff = [
    "diff --git a/src/old.ts b/src/new.ts",
    "similarity index 90%",
    "rename from src/old.ts",
    "rename to src/new.ts",
    "--- a/src/old.ts",
    "+++ b/src/new.ts",
    "@@ -5 +5 @@",
  ].join("\n");
  const r = judge(diff, lcovOf("src/new.ts", { ...hits(9, 0), 5: 1 }), ROOT);
  assert.equal(r.code, PASS);
  assert.match(r.summary, /^1\/1 /);
});
test("diff-coverage: files outside src/ and test files under it are not counted", () => {
  const diff = [
    diffOf("site/x.ts", [1, 1]),
    diffOf("src/a.test.ts", [1, 1]),
  ].join("\n");
  assert.equal(judge(diff, lcovOf("src/a.ts", { 1: 1 }), ROOT).code, NA);
});
test("diff-coverage: changed lines that all lack coverage data are not applicable and counted", () => {
  const r = judge(
    diffOf("src/a.svelte", [7, 2]),
    lcovOf("src/a.svelte", { 1: 1 }),
    ROOT,
  );
  assert.equal(r.code, NA);
  assert.equal(r.summary, "2 changed line(s) without coverage data");
});

// The step on a fixture repository: origin/main is the first commit, the change is staged on top.
const MODULE =
  "export function f(a: number): number {\n  if (a > 1) {\n    return 2;\n  }\n  return 1;\n}\n";
const TEST =
  'import { expect, test } from "vitest";\nimport { f } from "./a.ts";\ntest("f", () => {\n  expect(f(0)).toBe(1);\n});\n';
function fixture(files: Record<string, string>): string {
  const root = tempDir();
  put(
    root,
    "vitest.config.ts",
    'export default { test: { include: ["src/**/*.test.ts"] } };\n',
  );
  put(root, ".gitignore", "/node_modules\n/reports/\n");
  put(root, "src/a.test.ts", TEST);
  put(
    root,
    "src/a.ts",
    "export const f = (a: number): number => (a ? 1 : 1);\n",
  );
  symlinkSync(join(here, "..", "node_modules"), join(root, "node_modules"));
  git(root, "init", "-q");
  commit(root, "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  git(root, "add", "-A");
  return root;
}

test("diff-coverage step: a changed line the tests do not reach is a finding", () => {
  const out = expect("diff-coverage", fixture({ "src/a.ts": MODULE }), FINDING);
  assert.match(out, /src\/a\.ts:3$/m);
});
test("diff-coverage step: a new file no test imports is in the report at 0 % and is a finding", () => {
  const out = expect(
    "diff-coverage",
    fixture({ "src/b.ts": "export const b = 1;\n" }),
    FINDING,
  );
  assert.match(out, /src\/b\.ts:1$/m);
});
test("diff-coverage step: covered changed lines pass with the figure", () => {
  const covered = TEST.replace(
    "expect(f(0)).toBe(1);",
    "expect(f(0)).toBe(1);\n  expect(f(2)).toBe(2);",
  );
  const out = expect(
    "diff-coverage",
    fixture({ "src/a.ts": MODULE, "src/a.test.ts": covered }),
    PASS,
  );
  assert.match(
    out,
    /^PASS diff-coverage: 3\/3 changed lines covered \(100\.0 %\), 3 changed line\(s\) without coverage data$/m,
  );
});
test("diff-coverage step: a reader that misses the canary's uncovered line cannot check", () => {
  const blind = canaryDir("diff-coverage", {
    "change.diff": diffOf("src/canary.ts", [1, 1]),
    "lcov.info": lcovOf("src/canary.ts", { 1: 1 }),
  });
  const out = expect("diff-coverage", fixture({ "src/a.ts": MODULE }), CANNOT, {
    canaries: blind,
  });
  assert.match(out, /canary's uncovered line/);
});
test("diff-coverage step: a test run that writes no lcov report cannot check", () => {
  const out = expect("diff-coverage", fixture({ "src/a.ts": MODULE }), CANNOT, {
    extraEnv: { VITEST_BIN: join(tempDir(), "no-vitest") },
  });
  assert.match(out, /wrote no reports\/test\/coverage\/lcov\.info/);
});
test("diff-coverage step: a push to main is left to its pull request", () => {
  const root = fixture({ "src/a.ts": MODULE });
  const r = run(["diff-coverage", "--root", root], {
    extraEnv: {
      GITHUB_ACTIONS: "true",
      GATE_EVENT: "push",
      GATE_BASE: git(root, "rev-parse", "HEAD").trim(),
    },
  });
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE diff-coverage: a push is checked on its pull request$/m,
  );
});
