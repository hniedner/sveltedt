import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANNOT } from "./pinned.ts";

export const NA = 4; // nothing of the step's kind here: exits 0, never prints PASS

export interface Result {
  code: number;
  summary: string;
  details: string[];
}
export type Check = (root: string, list: Set<string>) => Result;
export const result = (
  code: number,
  summary: string,
  details: string[] = [],
): Result => ({
  code,
  summary,
  details,
});
export const isResult = (x: object): x is Result => "code" in x;

export const errorCode = (
  e: NodeJS.ErrnoException | undefined,
): string | undefined => e?.code;

/**
 * The variables that change a step's context (`inCI()`, `canaries()`, the range, the browser step's CI hand-off). `childEnv()` strips them, so a child
 * started with `env: childEnv()` never sees them; a spawn that passes no `env` inherits them.
 */
export const GATE_VARS: readonly string[] = [
  "CANARY_DIR",
  "GATE_BASE",
  "GATE_BROWSER",
  "GATE_EVENT",
  "GATE_HEAD",
  "GITHUB_ACTIONS",
];

/**
 * This process's environment without git's variables (a child started inside a git hook must not reach the repo)
 * and without GATE_VARS (a child's verdict must not depend on the gate's own context).
 */
export function childEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  for (const k of GATE_VARS) delete env[k];
  delete env.NODE_TEST_CONTEXT; // set when this runs inside a test run; it would change the child's reporter
  return env;
}

export const HERE = dirname(fileURLToPath(import.meta.url));
// Test seams held here, unset in normal use: CANARY_DIR (planted folders) and VITEST_BIN (a fake vitest). An empty
// value counts as unset in each. The other seams (<NAME>_BIN via binaryOf in pinned.ts, SVELTE_CHECK_BIN, JSCPD_BIN,
// VITE_BIN, PLAYWRIGHT_BIN, ESLINT_CONFIG) are read in check-repo.ts.
export const canaries = (step: string): string =>
  join(process.env.CANARY_DIR || join(HERE, "canaries"), step);

export const vitestBin = (): string =>
  process.env.VITEST_BIN || join(HERE, "..", "node_modules", ".bin", "vitest");
export const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g");
/** Up to 8 lines a child printed, error lines first, without stack frames or code frames: the reason to show. */
export function tail(text: string): string[] {
  const lines = text
    // Colour codes are cut, not turned off: the config loader prints them even when NO_COLOR is set (measured)
    .replace(COLOUR, "")
    .split("\n")
    .filter(
      (l) =>
        l.trim() &&
        !/^\s+(?:at |❯ |\d+\||\|)/.test(l) &&
        !l.includes("JSON report written"),
    );
  const first = lines.filter((l) =>
    /\w*(?:Error|Exception)\b.*:|originated in/.test(l),
  );
  return [...first, ...lines.filter((l) => !first.includes(l))].slice(0, 8);
}

export interface VitestReport {
  numTotalTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: {
      fullName: string;
      status: string;
      location?: { line: number; column: number }; // the test's own line, present with --includeTaskLocation
    }[];
  }[];
}

/** Flags for a canary run: Vitest's two caches would write under the canaries folder, which a run must leave as is. */
export const NO_CACHE = ["--cache=false", "--fsModuleCache=false"];

export const BROWSER_DIR = "site/browser/";
/** A spec the browser step runs and judges, markers included: one rule for that step and for trace's hand-off. */
export const isBrowserSpec = (f: string): boolean =>
  f.startsWith(BROWSER_DIR) && f.endsWith(".spec.ts");

export interface VitestRun {
  report: VitestReport | null;
  status: number | null;
  out: string;
  error?: string;
}

/** `reports/<step>/`, removed and created again: a file an earlier run left there is never read as this run's. */
export function freshReports(root: string, step: string): string {
  const dir = join(root, "reports", step);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
/** A report's file in `dir`: the name with each `/` replaced by `__`, so a path is one file name. */
export const reportFile = (dir: string, name: string): string =>
  join(dir, name.replaceAll("/", "__"));

/**
 * One Vitest run in `cwd` (with `args`): its JSON report (null when it wrote none), exit status, output and any spawn
 * error. The report goes to `keep` (a reports folder) when given, else to a folder removed after the run.
 */
export function vitest(cwd: string, args: string[], keep?: string): VitestRun {
  const dir = keep ?? mkdtempSync(join(tmpdir(), "vitest-"));
  try {
    const file = reportFile(dir, "vitest.json");
    const r = spawnSync(
      vitestBin(),
      // dot prints what the JSON report leaves out: errors thrown outside a test
      [
        "run",
        ...args,
        "--reporter=dot",
        "--reporter=json",
        `--outputFile.json=${file}`,
      ],
      {
        cwd,
        encoding: "utf8",
        env: childEnv(),
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const report = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as VitestReport)
      : null;
    return {
      report,
      status: r.status,
      out: `${r.stdout}${r.stderr}`,
      error: r.error && `cannot run ${vitestBin()}: ${errorCode(r.error)}`,
    };
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}

export function inCI(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/** The commits the branch adds: GATE_BASE..GATE_HEAD in CI, after the merge base with origin/main locally. */
export function commitRange(root: string): Result | { range: string } {
  const base = process.env.GATE_BASE;
  // In CI the range must come from the event; the local fallback would scan other commits than the event brought.
  if (inCI() && !base) return result(CANNOT, "GATE_BASE is not set in CI");
  if (base) {
    if (/^0+$/.test(base))
      return result(CANNOT, "GATE_BASE is all zeros: no base commit");
    return { range: `${base}..${process.env.GATE_HEAD || "HEAD"}` };
  }
  const r = spawnSync(
    "git",
    ["-C", root, "merge-base", "refs/remotes/origin/main", "HEAD"],
    {
      encoding: "utf8",
      env: childEnv(),
    },
  );
  if (r.status !== 0)
    return result(CANNOT, "no merge base with origin/main (fetch it first)");
  return { range: `${r.stdout.trim()}..HEAD` };
}

/**
 * Where the shared test run writes its lcov report, and which files it measures: TypeScript and components under src/
 * (G4). The report leaves out the files the config's `test.include` runs as tests (measured with the
 * `.test.ts` files under src/); `isCovered` is the same rule for a path, so the report and the diff agree while tests
 * end in `.test.ts`.
 */
export const COVERAGE_DIR = "reports/test/coverage";
const COVERAGE_INCLUDE = "src/**/*.{ts,svelte}";
export const isCovered = (f: string): boolean =>
  /^src\/.+\.(?:ts|svelte)$/.test(f) && !f.endsWith(".test.ts");

let shared: { root: string; run: Result | VitestRun } | undefined;

/**
 * The Vitest run of the gate process (one per root; the last root is kept), shared by `test`, `trace` and
 * `diff-coverage`: the first caller starts it, the next gets the same answer. Flags win over the config (measured):
 * unhandled errors fail the run, a test without an assertion fails, the tests run rather than only being
 * type-checked, a snapshot with nothing stored fails instead of being written (outside CI vitest writes it and
 * passes), and every test carries its own line for the trace; with V8 coverage, its lcov report under COVERAGE_DIR.
 * `vitest.config.ts` must be tracked (the callers check). No flag overrides onUnhandledError, and two flags do not
 * reach a project (measured): a config that names either cannot be checked. Read as text: a name in a module the
 * config imports or built at run time is not seen (CONTRIBUTING.md).
 */
export function testRun(root: string): Result | VitestRun {
  if (shared?.root === root) return shared.run;
  // This run's reports only, whichever branch follows: an earlier run's report is never left to be read
  const reports = freshReports(root, "test");
  const config = join(root, "vitest.config.ts");
  const unchecked = [
    ["onUnhandledError", "lets an unhandled error pass"],
    [
      "projects",
      `names "projects" (read as text), which two of the step's flags do not reach`,
    ],
    [
      "coverage",
      "sets coverage options (read as text), which could take lines out of diff-coverage's count",
    ],
  ].filter(([name]) => readFileSync(config, "utf8").includes(name));
  const run = unchecked.length
    ? result(
        CANNOT,
        `vitest.config.ts ${unchecked.map(([, why]) => why).join("; ")}`,
        unchecked.map(([name]) => name),
      )
    : vitest(
        root,
        [
          "--config",
          config,
          "--dangerouslyIgnoreUnhandledErrors=false",
          "--expect.requireAssertions",
          "--typecheck.enabled=false",
          "--update=none",
          "--includeTaskLocation",
          // The lcov report diff-coverage reads; a file of the include glob that no test imports is listed at 0 %
          "--coverage.enabled",
          "--coverage.provider=v8",
          "--coverage.reporter=lcov",
          `--coverage.include=${COVERAGE_INCLUDE}`,
          `--coverage.reportsDirectory=${join(root, COVERAGE_DIR)}`,
        ],
        reports,
      );
  shared = { root, run };
  return run;
}

export interface Base {
  kind: "pull_request" | "push" | "local";
  base: string | null; // null: a push with no usable GATE_BASE
}
const COMMIT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * The commit a step compares its answer with, one truth table for the steps that compare with a base (`trace` and
 * `diff-coverage`). A pull request is checked out as the merge of its head, so the base is that merge's first
 * parent; else the merge base of GATE_BASE and GATE_HEAD. A push has GATE_BASE (the commits before it) or none. Locally
 * it is the merge base with origin/main. Anything else, in CI, has no base: the step says so, never guesses.
 */
export function baseCommit(root: string): Result | Base {
  const git = (...args: string[]): string | null => {
    const r = spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: childEnv(),
    });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  if (!inCI()) {
    const base = git("merge-base", "refs/remotes/origin/main", "HEAD");
    return base
      ? { kind: "local", base }
      : result(CANNOT, "no merge base with origin/main (fetch it first)");
  }
  const { GATE_EVENT: event, GATE_BASE: base, GATE_HEAD: head } = process.env;
  if (event === "push")
    return { kind: "push", base: base && !/^0+$/.test(base) ? base : null };
  if (event !== "pull_request")
    return result(
      CANNOT,
      `GATE_EVENT is ${event ? `"${event}"` : "not set"} in CI`,
    );
  // Commit ids only: the values reach git as revisions
  if (!base || !head || !COMMIT_ID.test(base) || !COMMIT_ID.test(head))
    return result(
      CANNOT,
      "GATE_BASE or GATE_HEAD is not a commit id on a pull request",
    );
  const merged =
    git("rev-parse", "HEAD^2") === head
      ? git("rev-parse", "HEAD^1")
      : git("merge-base", base, head);
  return merged
    ? { kind: "pull_request", base: merged }
    : result(CANNOT, `no merge base of ${base} and ${head}`);
}
