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

/** This process's environment without git's variables: a child started inside a git hook must not reach the repo. */
export function childEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  delete env.NODE_TEST_CONTEXT; // set when this runs inside a test run; it would change the child's reporter
  return env;
}

export const HERE = dirname(fileURLToPath(import.meta.url));
// Test seams, unset in normal use: CANARY_DIR (planted folders), <NAME>_BIN (fakes, see binaryOf in pinned.ts),
// SVELTE_CHECK_BIN, VITEST_BIN, JSCPD_BIN and ESLINT_CONFIG.
// An empty value counts as unset in each.
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
    assertionResults: { fullName: string; status: string }[];
  }[];
}

/** One Vitest run in `cwd` (with `args`): its JSON report (null when it wrote none), exit status, output and any spawn error. */
export function vitest(
  cwd: string,
  args: string[],
): {
  report: VitestReport | null;
  status: number | null;
  out: string;
  error?: string;
} {
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
