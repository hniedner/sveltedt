// The mutation step (G8): every mutant of a changed line under src/ must be killed by the tests. StrykerJS runs in a
// temporary copy of the tracked files (its `inPlace` mode rewrites every file it reaches, which a killed run would leave
// in a checkout) on the whole of each changed file, and judges the JSON report on the changed lines only (a mutant is
// made only when its whole node is inside a mutate range, so a range would lose the mutants that span a changed line). A planted survivor in the copy
// must show up in the report first, or the step cannot check.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  baseCommit,
  canaries,
  childEnv,
  freshReports,
  inCI,
  isResult,
  NA,
  reportFile,
  result,
  tail,
} from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { sourceChanges, sourceDiff } from "./diff-coverage.ts";
import { binaryOf, CANNOT, FINDING, PASS } from "./pinned.ts";

export interface Report {
  files: Record<
    string,
    {
      mutants: {
        status: string;
        mutatorName: string;
        location: { start: { line: number }; end: { line: number } };
      }[];
    }
  >;
}
const HANDLED = ["Killed", "Timeout"]; // Ignored has its own branch; any other status (Survived, NoCoverage, Pending) fails
const INVALID = ["CompileError", "RuntimeError"]; // the mutant itself does not run: Stryker's scoring leaves it out too

/**
 * The step's verdict for one report and the changed lines per file: a Survived or NoCoverage mutant on a changed line is
 * a finding; an invalid mutant is listed and not judged; no judged mutant at all is could not check (the tests could not
 * have noticed anything), unless no mutant of any status sits on a changed line while the changed files hold mutants
 * elsewhere: Stryker read those files and the lines carry nothing to mutate (an import or a comment), so not applicable.
 * a changed file with no mutant at all stays could not check. A mutant belongs to every line from its start to its end.
 */
export function judge(report: Report, changed: Map<string, number[]>): Result {
  const bad: string[] = [];
  const invalid: string[] = [];
  let judged = 0;
  let onChanged = 0;
  let elsewhere = 0;
  let unread = 0; // changed files Stryker produced no mutant for
  const ignored: string[] = [];
  for (const [file, lines] of [...changed].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!report.files[file]?.mutants.length) unread++;
    for (const m of report.files[file]?.mutants ?? []) {
      const { start, end } = m.location;
      if (!lines.some((n) => n >= start.line && n <= end.line)) {
        elsewhere++;
        continue;
      }
      onChanged++;
      const at = `${file}:${start.line} ${m.mutatorName}`;
      if (INVALID.includes(m.status))
        invalid.push(`${at}: invalid mutant (not judged)`);
      else if (HANDLED.includes(m.status)) judged++;
      else if (m.status === "Ignored") {
        judged++; // switched off by a disable comment whose reason the step has checked
        ignored.push(`${at}: ignored with a reason`);
      } else bad.push(`${at} (${m.status})`);
    }
  }
  if (bad.length)
    return result(
      FINDING,
      `${bad.length} mutant(s) on changed lines not killed`,
      [...bad, ...invalid],
    );
  if (!onChanged && elsewhere && !unread)
    return result(
      NA,
      `no mutant on a changed line (${elsewhere} mutants elsewhere in the changed files)`,
    );
  if (!judged)
    return result(CANNOT, "no mutant on a changed line was judged", invalid);
  return result(
    PASS,
    `${judged} mutant(s) on changed lines killed or ignored with a reason`,
    [...ignored, ...invalid],
  );
}

/** `file:line` of each Stryker disable comment without a reason after its colon (G8: the reason stands on the same line). */
export function disableWithoutReason(files: Map<string, string>): string[] {
  const found: string[] = [];
  for (const [file, text] of files)
    text.split("\n").forEach((line, i) => {
      if (
        line.includes("Stryker disable") &&
        !/Stryker disable[^:\n]*:\s*(?!-->)\S/.test(line)
      )
        found.push(`${file}:${i + 1}`);
    });
  return found;
}

/** A new empty directory outside the checkout, where Stryker's temporary copy is made. */
export const workDir = (): string => mkdtempSync(join(tmpdir(), "mutation-"));

const CANARY_FILE = "src/mutation-canary/canary.ts";

function run(
  root: string,
  list: Set<string>,
  changed: Map<string, number[]>,
): Result {
  const planted = canaries("mutation");
  const dir = workDir();
  try {
    for (const file of list)
      if (existsSync(join(root, file))) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        cpSync(join(root, file), join(dir, file), { verbatimSymlinks: true });
      }
    for (const f of ["canary.ts", "canary.test.ts"]) {
      mkdirSync(join(dir, "src/mutation-canary"), { recursive: true });
      cpSync(join(planted, f), join(dir, "src/mutation-canary", f));
    }
    const env = childEnv();
    const install = spawnSync(
      binaryOf("pnpm"),
      ["install", "--frozen-lockfile", "--offline"],
      { cwd: dir, encoding: "utf8", env },
    );
    if (install.status !== 0)
      return result(
        CANNOT,
        "pnpm install --frozen-lockfile --offline failed in the copy",
        tail(`${install.stdout}${install.stderr}`),
      );
    const stryker = spawnSync(
      join(dir, "node_modules/.bin/stryker"),
      ["run", "stryker.config.mjs"],
      {
        cwd: dir,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...env,
          STRYKER_MUTATE: JSON.stringify([...changed.keys(), CANARY_FILE]),
        },
      },
    );
    const file = join(dir, "reports/mutation/mutation.json");
    if (!existsSync(file))
      return result(
        CANNOT,
        "Stryker wrote no report",
        stryker.error
          ? [String(stryker.error)]
          : tail(`${stryker.stdout}${stryker.stderr}`),
      );
    const text = readFileSync(file, "utf8");
    writeFileSync(
      reportFile(freshReports(root, "mutation"), "mutation.json"),
      text,
    );
    return verdict(JSON.parse(text) as Report, changed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The canary's planted survivor and killed mutant must both be in the report, then the changed lines are judged. */
function verdict(report: Report, changed: Map<string, number[]>): Result {
  const canary = report.files[CANARY_FILE]?.mutants.map((m) => m.status) ?? [];
  if (!canary.includes("Survived") || !canary.includes("Killed"))
    return result(CANNOT, "the run did not find the canary's survivor", [
      `canary mutants: ${canary.join(", ") || "none"}`,
    ]);
  return judge(report, changed);
}

export function check(root: string, list: Set<string>): Result {
  const base = baseCommit(root);
  if (isResult(base)) return base;
  if (base.kind === "push" || !base.base)
    return result(NA, "a push is checked on its pull request");
  if (
    inCI() &&
    process.env.GATE_MUTATION === "job" &&
    process.env.GITHUB_JOB !== "mutation"
  )
    return result(NA, "left to the CI job mutation (GATE_MUTATION)");
  const diff = sourceDiff(root, base.base);
  if (typeof diff !== "string") return diff;
  const { changed, unreadable } = sourceChanges(diff);
  if (unreadable.length)
    return result(CANNOT, "a changed path the reader cannot read", unreadable);
  if (!changed.length) return result(NA, "no changed line under src/");
  const comments = disableWithoutReason(
    new Map(changed.map(([f]) => [f, readFileSync(join(root, f), "utf8")])),
  );
  if (comments.length)
    return result(
      FINDING,
      "a Stryker disable comment without a reason on its line",
      comments,
    );
  return run(root, list, new Map(changed));
}
