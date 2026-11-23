// The mutation step (G8): every mutant of a changed line under src/ must be killed by the tests. StrykerJS runs in a
// temporary copy of the tracked files (its `inPlace` mode rewrites every file it reaches, which a killed run would leave
// in a checkout) on the changed line ranges; the step judges the JSON report itself. A planted survivor in the copy
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
        location: { start: { line: number } };
      }[];
    }
  >;
}
const BAD = ["Survived", "NoCoverage"];
const INVALID = ["CompileError", "RuntimeError"]; // the mutant itself does not run: Stryker's scoring leaves it out too

/**
 * The step's verdict for one report and the changed lines per file: a Survived or NoCoverage mutant on a changed line is
 * a finding; an invalid mutant is listed and not judged; no judged mutant at all is could not check (the tests could not
 * have noticed anything). A mutant belongs to the line it starts on.
 */
export function judge(report: Report, changed: Map<string, number[]>): Result {
  const bad: string[] = [];
  const invalid: string[] = [];
  let judged = 0;
  for (const [file, lines] of [...changed].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    for (const m of report.files[file]?.mutants ?? []) {
      const line = m.location.start.line;
      if (!lines.includes(line)) continue;
      const at = `${file}:${line} ${m.mutatorName}`;
      if (BAD.includes(m.status)) bad.push(`${at} (${m.status})`);
      else if (INVALID.includes(m.status))
        invalid.push(`${at}: invalid mutant (not judged)`);
      else if (m.status !== "Ignored") judged++;
    }
  if (bad.length)
    return result(
      FINDING,
      `${bad.length} mutant(s) on changed lines not killed`,
      [...bad, ...invalid],
    );
  if (!judged)
    return result(CANNOT, "no mutant on a changed line was judged", invalid);
  return result(PASS, `${judged} mutant(s) on changed lines killed`, invalid);
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

/** `file:a-b` for each run of consecutive changed lines, the form Stryker's `mutate` takes. */
const ranges = (changed: [string, number[]][]): string[] =>
  changed.flatMap(([file, lines]) => {
    const out: string[] = [];
    let start = lines[0];
    lines.forEach((n, i) => {
      if (i + 1 === lines.length || lines[i + 1] !== n + 1) {
        out.push(`${file}:${start}-${n}`);
        start = lines[i + 1];
      }
    });
    return out;
  });

const CANARY_FILE = "src/mutation-canary/canary.ts";

function run(root: string, list: Set<string>, mutate: string[]): Result {
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
          STRYKER_MUTATE: JSON.stringify([...mutate, CANARY_FILE]),
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
    return verdict(JSON.parse(text) as Report, mutate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The canary's planted survivor and killed mutant must both be in the report, then the changed lines are judged. */
function verdict(report: Report, mutate: string[]): Result {
  const canary = report.files[CANARY_FILE]?.mutants.map((m) => m.status) ?? [];
  if (!canary.includes("Survived") || !canary.includes("Killed"))
    return result(CANNOT, "the run did not find the canary's survivor", [
      `canary mutants: ${canary.join(", ") || "none"}`,
    ]);
  const changed = new Map<string, number[]>();
  for (const r of mutate) {
    const [, file, a, b] = /^(.*):(\d+)-(\d+)$/.exec(r) ?? [];
    const lines = changed.get(file) ?? [];
    for (let n = Number(a); n <= Number(b); n++) lines.push(n);
    changed.set(file, lines);
  }
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
  return run(root, list, ranges(changed));
}
