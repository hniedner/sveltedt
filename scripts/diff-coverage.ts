// The diff-coverage step (G4): at least 95 % of the changed lines under src/ that carry coverage data are covered
// by the shared test run. Changed lines come from `git diff -U0 -M <base>` to the working tree (the new side of each
// hunk), coverage from the lcov report the run writes; a changed file the report does not list, or a report that
// lists no file, is could not check.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import {
  baseCommit,
  canaries,
  childEnv,
  COVERAGE_DIR,
  isCovered,
  isResult,
  NA,
  result,
  tail,
  testRun,
} from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { CANNOT, FINDING, PASS } from "./pinned.ts";

const FLOOR = 95;
const HUNK = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * The changed lines per file on the new side of a `git diff -U0` with the prefixes a/ and b/ (a deleted file has
 * none). A file header whose path the reader cannot take (no b/ prefix: git quoted it) is kept as `"` + the raw path.
 * Inside a hunk a line is content, so an added line that starts with `++ ` is never read as a header.
 */
export function changedLines(diff: string): Map<string, number[]> {
  const files = new Map<string, number[]>();
  let lines: number[] | null = null;
  let content = 0; // lines of the current hunk still to come, old and new side
  for (const line of diff.split("\n")) {
    if (content > 0) {
      content--;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/\t$/, ""); // git ends a path holding a space with a tab
      lines = path === "/dev/null" ? null : [];
      if (lines)
        files.set(path.startsWith("b/") ? path.slice(2) : `"${path}`, lines);
      continue;
    }
    const h = HUNK.exec(line);
    if (h) {
      const count = (n: string | undefined): number =>
        n === undefined ? 1 : Number(n);
      const start = Number(h[2]);
      for (let n = start; n < start + count(h[3]); n++) lines?.push(n);
      content = count(h[1]) + count(h[3]);
    }
  }
  return files;
}

/** Per source file of an lcov report (its path relative to `root`), the hit count of each line with data. */
export function readLcov(
  text: string,
  root: string,
): Map<string, Map<number, number>> {
  const real = realpathSync(root);
  const files = new Map<string, Map<number, number>>();
  let lines: Map<number, number> | undefined;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      const sf = line.slice(3).trim();
      const path = isAbsolute(sf) ? relative(real, realOr(sf)) : sf;
      lines = files.get(path) ?? new Map<number, number>();
      files.set(path, lines);
    } else if (line.startsWith("DA:") && lines) {
      const [n, hits] = line.slice(3).split(",").map(Number);
      lines.set(n, Math.max(lines.get(n) ?? 0, hits));
    }
  }
  return files;
}
const realOr = (path: string): string =>
  existsSync(path) ? realpathSync(path) : path;

/** The changed lines under src/ per file, sorted, and the changed paths the reader cannot read. */
export function sourceChanges(diff: string): {
  changed: [string, number[]][];
  unreadable: string[];
} {
  const all = [...changedLines(diff)].filter(([, lines]) => lines.length);
  return {
    changed: all
      .filter(([file]) => isCovered(file))
      .sort(([a], [b]) => a.localeCompare(b)),
    unreadable: all.filter(([f]) => f.startsWith('"')).map(([f]) => f.slice(1)),
  };
}

/** The figure for one diff and one lcov report, read against `root`. */
export function judge(diff: string, lcov: string, root: string): Result {
  const { changed, unreadable } = sourceChanges(diff);
  if (unreadable.length)
    return result(CANNOT, "a changed path the reader cannot read", unreadable);
  if (!changed.length) return result(NA, "no changed line under src/");
  const report = readLcov(lcov, root);
  if (!report.size) return result(CANNOT, "the coverage report lists no file");
  const absent = changed.filter(([file]) => !report.has(file)).map(([f]) => f);
  if (absent.length)
    return result(
      CANNOT,
      `${absent.length} changed file(s) missing from the coverage report`,
      absent,
    );
  let counted = 0;
  let noData = 0;
  const missed: string[] = [];
  for (const [file, lines] of changed) {
    const data = report.get(file)!; // every changed file is in the report (checked above)
    for (const n of lines) {
      const hits = data.get(n);
      if (hits === undefined) noData++;
      else {
        counted++;
        if (!hits) missed.push(`${file}:${n}`);
      }
    }
  }
  const without = `${noData} changed line(s) without coverage data`;
  if (!counted) return result(NA, without);
  const covered = counted - missed.length;
  const figure = `${covered}/${counted} changed lines covered (${((100 * covered) / counted).toFixed(1)} %), ${without}`;
  return covered * 100 >= counted * FLOOR
    ? result(PASS, figure)
    : result(FINDING, `${figure}; the floor is ${FLOOR} %`, missed);
}

/**
 * `git diff -U0` of src/ from `base` to the working tree, as text. The prefixes and the path quoting are set here, so a
 * contributor's git config (for example `diff.mnemonicPrefix`) cannot hide a file. Shared by the steps that judge
 * the changed lines.
 */
export function sourceDiff(root: string, base: string): Result | string {
  const diff = spawnSync(
    "git",
    [
      "-C",
      root,
      "-c",
      "core.quotePath=false",
      "diff",
      "-U0",
      "-M",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--no-color",
      "--no-ext-diff",
      base,
      "--",
      "src",
    ],
    { encoding: "utf8", env: childEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  if (diff.status !== 0)
    return result(CANNOT, `git diff against ${base} failed`, [
      diff.stderr.trim(),
    ]);
  return diff.stdout;
}

/**
 * The step. The reader must first find the planted uncovered line of its canary; then the diff to the base is read,
 * and only when it changes a line under src/ is the shared test run's lcov report judged. A push is checked on its
 * pull request. A new file counts once it is tracked: the diff to the working tree does not list an untracked file
 * (CI's checkout has none). The prefixes and the path quoting are set here, so a contributor's git config (for
 * example `diff.mnemonicPrefix`) cannot hide a file.
 */
export function check(root: string): Result {
  const planted = canaries("diff-coverage");
  const canary = judge(
    readFileSync(join(planted, "change.diff"), "utf8"),
    readFileSync(join(planted, "lcov.info"), "utf8"),
    planted,
  );
  if (canary.code !== FINDING)
    return result(
      CANNOT,
      "the reader did not find the canary's uncovered line",
      [canary.summary],
    );
  const base = baseCommit(root);
  if (isResult(base)) return base;
  if (base.kind === "push" || !base.base)
    return result(NA, "a push is checked on its pull request");
  const diff = sourceDiff(root, base.base);
  if (typeof diff !== "string") return diff;
  const { changed, unreadable } = sourceChanges(diff);
  if (unreadable.length || !changed.length) return judge(diff, "", root);
  const run = testRun(root);
  if (isResult(run)) return run;
  const lcov = join(root, COVERAGE_DIR, "lcov.info");
  if (!existsSync(lcov))
    return result(
      CANNOT,
      `the test run wrote no ${COVERAGE_DIR}/lcov.info`,
      run.error ? [run.error] : tail(run.out),
    );
  return judge(diff, readFileSync(lcov, "utf8"), root);
}
