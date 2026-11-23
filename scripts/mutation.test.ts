// Tests for mutation.ts. The judge and the comment reader are pure and take hand-written reports; the step itself runs
// the real StrykerJS on a fixture repository, with the real pnpm installing the fixture's packages offline.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import {
  canaryDir,
  commit,
  expect,
  GIT_ENV,
  git,
  here,
  put,
  run,
  tempDir,
} from "./check-repo.fixture.ts";
import { GATE_VARS } from "./gate-step.ts";
import { disableWithoutReason, judge, workDir } from "./mutation.ts";
import type { Report } from "./mutation.ts";
import { CANNOT, FINDING, PASS } from "./pinned.ts";
import { NA } from "./gate-step.ts";

/** A Stryker report: for each file, [line, status] pairs (the mutator is "M"). */
const reportOf = (
  files: Record<string, [number, string, number?][]>,
): Report => ({
  files: Object.fromEntries(
    Object.entries(files).map(([f, ms]) => [
      f,
      {
        mutants: ms.map(([line, status, end]) => ({
          status,
          mutatorName: "M",
          location: { start: { line }, end: { line: end ?? line } },
        })),
      },
    ]),
  ),
});
const CHANGED = new Map([["src/a.ts", [2, 3]]]);

test("mutation judge: a changed line whose mutant survived or was never run is a finding naming file, line and mutator", () => {
  for (const status of ["Survived", "NoCoverage"]) {
    const r = judge(
      reportOf({
        "src/a.ts": [
          [2, "Killed"],
          [3, status],
        ],
      }),
      CHANGED,
    );
    assert.equal(r.code, FINDING);
    assert.deepEqual(r.details, [`src/a.ts:3 M (${status})`]);
  }
});
test("mutation judge: a mutant that was never decided is a finding, not a pass", () => {
  const r = judge(
    reportOf({
      "src/a.ts": [
        [2, "Killed"],
        [3, "Pending"],
      ],
    }),
    CHANGED,
  );
  assert.equal(r.code, FINDING);
  assert.deepEqual(r.details, ["src/a.ts:3 M (Pending)"]);
});
test("mutation judge: a mutant that spans a changed line is judged though it starts on an unchanged one", () => {
  const r = judge(
    reportOf({ "src/a.ts": [[1, "Survived", 4]] }),
    new Map([["src/a.ts", [3]]]),
  );
  assert.equal(r.code, FINDING);
  assert.deepEqual(r.details, ["src/a.ts:1 M (Survived)"]);
});
test("mutation judge: a change whose only mutants are ignored with a reason passes and lists them", () => {
  const r = judge(reportOf({ "src/a.ts": [[3, "Ignored"]] }), CHANGED);
  assert.equal(r.code, PASS);
  assert.deepEqual(r.details, ["src/a.ts:3 M: ignored with a reason"]);
});
test("mutation judge: only the changed lines count, and killed, timed-out and ignored mutants pass", () => {
  const killed = reportOf({
    "src/a.ts": [
      [1, "Survived"],
      [2, "Killed"],
      [3, "Timeout"],
      [3, "Ignored"],
      [9, "NoCoverage"],
    ],
  });
  assert.equal(judge(killed, CHANGED).code, PASS);
});
test("mutation judge: an invalid mutant is listed and not judged, and a diff with only those cannot be checked", () => {
  const mixed = judge(
    reportOf({
      "src/a.ts": [
        [2, "Killed"],
        [3, "RuntimeError"],
      ],
    }),
    CHANGED,
  );
  assert.equal(mixed.code, PASS);
  assert.deepEqual(mixed.details, [
    "src/a.ts:3 M: invalid mutant (not judged)",
  ]);
  const only = judge(reportOf({ "src/a.ts": [[3, "CompileError"]] }), CHANGED);
  assert.equal(only.code, CANNOT);
});
test("mutation judge: changed lines with no mutant are not applicable when the changed file has mutants elsewhere", () => {
  const r = judge(
    reportOf({
      "src/a.ts": [
        [9, "Killed"],
        [12, "Survived"],
      ],
    }),
    CHANGED,
  );
  assert.equal(r.code, NA);
  assert.match(
    r.summary,
    /no mutant on a changed line \(2 mutants elsewhere in the changed files\)/,
  );
});
test("mutation judge: a changed file with 0 mutants, or no entry, cannot be checked", () => {
  assert.equal(judge(reportOf({ "src/a.ts": [] }), CHANGED).code, CANNOT);
  assert.equal(judge(reportOf({}), CHANGED).code, CANNOT);
});
test("mutation judge: an invalid mutant on a changed line is not an excuse for not applicable", () => {
  const r = judge(
    reportOf({
      "src/a.ts": [
        [3, "CompileError"],
        [9, "Killed"],
      ],
    }),
    CHANGED,
  );
  assert.equal(r.code, CANNOT);
});

test("mutation comments: a disable comment needs a reason after the colon, in code and in markup", () => {
  const files = new Map([
    [
      "src/a.ts",
      [
        "// Stryker disable next-line all",
        "// Stryker disable next-line StringLiteral:",
        "// Stryker disable next-line StringLiteral: the label is not behaviour",
        "// Stryker disable all",
        "",
      ].join("\n"),
    ],
    [
      "src/b.svelte",
      "<!-- Stryker disable next-line all: -->\n<!-- Stryker disable next-line all: spacing -->\n",
    ],
  ]);
  assert.deepEqual(disableWithoutReason(files), [
    "src/a.ts:1",
    "src/a.ts:2",
    "src/a.ts:4",
    "src/b.svelte:1",
  ]);
});

test("mutation work directory: never the checkout, and not inside it", () => {
  const root = tempDir();
  const dir = workDir();
  assert.ok(existsSync(dir));
  assert.notEqual(dir, root);
  assert.ok(relative(root, dir).startsWith(".."), dir);
});

// The step on a fixture repository: origin/main is the first commit, the change is staged on top. The fixture carries
// the real manifest, lockfile and Stryker settings, so the offline install in the copy finds what the repository has.
const real = (path: string): string =>
  readFileSync(join(here, "..", path), "utf8");
const SURVIVOR =
  "export function f(a: number): number {\n  return a < 1 ? 1 : 1;\n}\n";
const KILLED = "export function f(a: number): number {\n  return a + 1;\n}\n";
const FIXTURE_TEST =
  'import { expect, test } from "vitest";\nimport { f } from "./a.ts";\ntest("f", () => {\n  expect(f(0)).toBe(1);\n});\n';
function fixture(
  files: Record<string, string>,
  base: Record<string, string> = {},
): string {
  const root = tempDir();
  for (const p of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "site/package.json",
    "stryker.config.mjs",
  ])
    put(root, p, real(p));
  put(
    root,
    "vitest.config.ts",
    'export default { test: { include: ["src/**/*.test.ts"] } };\n',
  );
  put(root, ".gitignore", "/node_modules\n/reports/\n");
  put(root, "src/a.test.ts", FIXTURE_TEST);
  put(root, "src/a.ts", "export const f = (a: number): number => a;\n");
  for (const [path, text] of Object.entries(base)) put(root, path, text);
  git(root, "init", "-q");
  commit(root, "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  git(root, "add", "-A");
  return root;
}
const REAL_PNPM = { pnpm: "pnpm" };

test("mutation step: a changed line whose mutant survives is a finding, and the report is kept", () => {
  const root = fixture({ "src/a.ts": SURVIVOR });
  const out = expect("mutation", root, FINDING, REAL_PNPM);
  assert.match(out, /^ {2}src\/a\.ts:2 \S+ \(Survived\)$/m);
  assert.ok(existsSync(join(root, "reports/mutation/mutation.json")));
});
test("mutation step: changed lines whose mutants are all killed pass, and the temporary copy is removed", () => {
  const scratch = tempDir();
  const out = expect("mutation", fixture({ "src/a.ts": KILLED }), PASS, {
    ...REAL_PNPM,
    extraEnv: { TMPDIR: scratch },
  });
  assert.match(out, /^PASS mutation: /m);
  assert.deepEqual(readdirSync(scratch), []);
});
// A mutant is made only when its whole node lies inside a mutate range, so a changed line that starts a multi-line
// expression needs the whole file mutated: the array below starts on line 2 and ends on line 3
const WRAPPED = `export function f(a: number): number[] {
  return [a,
    2];
}
`;
const WRAPPED_TEST =
  'import { expect, test } from "vitest";\nimport { f } from "./a.ts";\ntest("f", () => {\n  expect(f(1)).toEqual([1, 2]);\n});\n';
test("mutation step: a changed line that starts a multi-line expression is judged with the mutants that span it", () => {
  const root = fixture(
    { "src/a.ts": WRAPPED.replace("[a,", "[a + 0,") },
    { "src/a.ts": WRAPPED, "src/a.test.ts": WRAPPED_TEST },
  );
  run(["mutation", "--root", root], REAL_PNPM);
  const report = JSON.parse(
    readFileSync(join(root, "reports/mutation/mutation.json"), "utf8"),
  ) as Report;
  const names = report.files["src/a.ts"].mutants
    .filter((m) => m.location.start.line === 2)
    .map((m) => m.mutatorName);
  assert.ok(names.includes("ArrayDeclaration"), names.join());
});
test("mutation step: a run that does not find the canary's survivor cannot check", () => {
  const blind = canaryDir("mutation", {
    "canary.ts": "export const sign = (n: number): number => n;\n",
    "canary.test.ts":
      'import { expect, test } from "vitest";\nimport { sign } from "./canary.ts";\ntest("c", () => {\n  expect(sign(1)).toBe(1);\n});\n',
  });
  const out = expect("mutation", fixture({ "src/a.ts": KILLED }), CANNOT, {
    ...REAL_PNPM,
    canaries: blind,
  });
  assert.match(out, /did not find the canary's survivor/);
});
test("mutation step: a changed source file that yields no mutant cannot be checked", () => {
  const out = expect(
    "mutation",
    fixture({ "src/types.ts": "export type T = number;\n" }),
    CANNOT,
    REAL_PNPM,
  );
  assert.match(out, /no mutant on a changed line/);
});
test("mutation step: a disable comment without a reason is a finding before any run", () => {
  const out = expect(
    "mutation",
    fixture({ "src/a.ts": `// Stryker disable next-line all\n${KILLED}` }),
    FINDING,
    REAL_PNPM,
  );
  assert.match(out, /src\/a\.ts:1/);
});
test("mutation step: the job mutation itself never leaves the step to itself", () => {
  const root = fixture({ "README.md": "# Fixture\n" });
  const head = git(root, "rev-parse", "HEAD").trim();
  const base = {
    GITHUB_ACTIONS: "true",
    GATE_EVENT: "pull_request",
    GATE_BASE: head,
    GATE_HEAD: head,
    GATE_MUTATION: "job",
  };
  // In another job the step is left to the job mutation; in that job it runs (here to "no changed line")
  const other = run(["mutation", "--root", root], { extraEnv: base });
  assert.match(other.out, /left to the CI job mutation/);
  const own = run(["mutation", "--root", root], {
    extraEnv: { ...base, GITHUB_JOB: "mutation" },
  });
  assert.match(own.out, /no changed line under src\//);
  assert.doesNotMatch(own.out, /left to the CI job/);
});
test("mutation step: a Stryker run that writes no report cannot check", () => {
  // The fixture's own test fails, so Stryker stops in its dry run before it writes a report
  const failing = FIXTURE_TEST.replace("toBe(1)", "toBe(99)");
  const out = expect(
    "mutation",
    fixture({ "src/a.ts": KILLED }, { "src/a.test.ts": failing }),
    CANNOT,
    REAL_PNPM,
  );
  assert.match(out, /Stryker wrote no report/);
});
test("mutation step: a push to main is left to its pull request", () => {
  const root = fixture({ "src/a.ts": KILLED });
  const r = run(["mutation", "--root", root], {
    ...REAL_PNPM,
    extraEnv: {
      GITHUB_ACTIONS: "true",
      GATE_EVENT: "push",
      GATE_BASE: git(root, "rev-parse", "HEAD").trim(),
    },
  });
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE mutation: a push is checked on its pull request$/m,
  );
});

/** Every file under `dir` (but .git) with its content, as one string per file. */
function snapshot(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !e.parentPath.includes(`${join(dir, ".git")}`))
    .map(
      (e) =>
        `${join(e.parentPath, e.name)}:${readFileSync(join(e.parentPath, e.name)).toString("base64")}`,
    )
    .sort();
}
test("mutation step: a run killed while Stryker is mutating leaves the checkout as it was", async () => {
  const root = fixture({ "src/a.ts": SURVIVOR });
  const scratch = tempDir();
  const before = snapshot(root);
  const env: NodeJS.ProcessEnv = { ...GIT_ENV, TMPDIR: scratch };
  for (const k of GATE_VARS) delete env[k];
  const child = spawn(
    process.execPath,
    [join(here, "check-repo.ts"), "mutation", "--root", root],
    { env, detached: true, stdio: "ignore" },
  );
  let gone = false;
  const exited = new Promise((done) =>
    child.on("exit", () => done((gone = true))),
  );
  // Stryker has started mutating once it has written its first setup file into the copy (no fixed wait)
  const started = (): boolean =>
    readdirSync(scratch).some((d) =>
      existsSync(join(scratch, d, "stryker-setup-0.js")),
    );
  const deadline = Date.now() + 120_000;
  while (!started() && !gone && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 50));
  assert.ok(started(), "Stryker never started in the copy");
  process.kill(-child.pid!, "SIGKILL");
  await exited;
  assert.deepEqual(snapshot(root), before);
  assert.equal(
    git(root, "status", "--porcelain").includes("stryker-setup"),
    false,
  );
});
