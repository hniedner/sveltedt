import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
 * The variables that change a step's context (`inCI()`, `canaries()`, the range). `childEnv()` strips them, so a child
 * started with `env: childEnv()` never sees them; a spawn that passes no `env` inherits them.
 */
export const GATE_VARS: readonly string[] = [
  "CANARY_DIR",
  "GATE_BASE",
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
// ESLINT_CONFIG) are read in check-repo.ts.
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

/** Flags for a canary run: Vitest's two caches would write under the canaries folder, which a run must leave as it was. */
export const NO_CACHE = ["--cache=false", "--fsModuleCache=false"];

export interface VitestRun {
  report: VitestReport | null;
  status: number | null;
  out: string;
  error?: string;
}

/** One Vitest run in `cwd` (with `args`): its JSON report (null when it wrote none), exit status, output and any spawn error. */
export function vitest(cwd: string, args: string[]): VitestRun {
  const dir = mkdtempSync(join(tmpdir(), "vitest-"));
  try {
    const file = join(dir, "report.json");
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
    rmSync(dir, { recursive: true, force: true });
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

let shared: { root: string; run: Result | VitestRun } | undefined;

/**
 * The one Vitest run of the whole gate process, shared by `test` and `trace`: the first caller starts it, the next
 * gets the same answer. Flags win over the config (measured): unhandled errors fail the run, a test without an
 * assertion fails, the tests run rather than only being type-checked, a snapshot with nothing stored fails instead of
 * being written (outside CI vitest writes it and passes), and every test carries its own line for the trace.
 * `vitest.config.ts` must be tracked (the callers check). No flag overrides onUnhandledError, and two flags do not
 * reach a project (measured): a config that names either cannot be checked. Read as text: a name in a module the
 * config imports or built at run time is not seen (CONTRIBUTING.md).
 */
export function testRun(root: string): Result | VitestRun {
  if (shared?.root === root) return shared.run;
  const config = join(root, "vitest.config.ts");
  const unchecked = [
    ["onUnhandledError", "lets an unhandled error pass"],
    [
      "projects",
      `names "projects" (read as text), which two of the step's flags do not reach`,
    ],
  ].filter(([name]) => readFileSync(config, "utf8").includes(name));
  const run = unchecked.length
    ? result(
        CANNOT,
        `vitest.config.ts ${unchecked.map(([, why]) => why).join("; ")}`,
        unchecked.map(([name]) => name),
      )
    : vitest(root, [
        "--config",
        config,
        "--dangerouslyIgnoreUnhandledErrors=false",
        "--expect.requireAssertions",
        "--typecheck.enabled=false",
        "--update=none",
        "--includeTaskLocation",
      ]);
  shared = { root, run };
  return run;
}
