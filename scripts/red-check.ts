// The red-check step (G7): each commit's new and changed Vitest test files run on the source of its parent. A commit
// that changes source must show, for each statement that gains tests, at least one new test red for the right
// reason; a commit that changes only tests must pass there (it pins behaviour; a failing one is a failing commit).
// The test file is the same in both runs, so any failed test on the parent comes from the commit's change; the
// wrong reason left is a test file that cannot load for a cause the commit does not supply.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative } from "node:path";
import {
  baseCommit,
  canaries,
  childEnv,
  freshReports,
  isResult,
  NA,
  result,
  tail,
  vitest,
} from "./gate-step.ts";
import type { Result, VitestReport } from "./gate-step.ts";
import { binaryOf, CANNOT, FINDING, PASS } from "./pinned.ts";
import { readMarkers } from "./trace.ts";

/** The Vitest test files the step runs: the config's include of src/ and site/. */
export const isVitestTest = (f: string): boolean =>
  /^(?:src|site)\/.+\.test\.ts$/.test(f);
/** Test support goes onto the parent with the tests: the setup file and the helpers under test/. */
const isSupport = (f: string): boolean => f.startsWith("test/");
const SOURCE = /^(?:src|site)\/.+\.(?!md$)/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]s$/;

/** One commit's changes, as the judge needs them. */
export interface Change {
  sha: string;
  subject: string;
  source: boolean; // a non-test file under src/ or site/ changed
  added: Set<string>; // every path the commit adds
  tests: { now: string; old: string | null }[]; // added, changed or renamed test files; old is the parent's path
  support: { path: string; deleted: boolean }[];
}

/** The changes of `git diff -z --name-status -M` (NUL-separated raw paths, so no quoting and no prefix applies). */
export function readChange(sha: string, subject: string, z: string): Change {
  const c: Change = {
    sha,
    subject,
    source: false,
    added: new Set(),
    tests: [],
    support: [],
  };
  const f = z.split("\0");
  for (let i = 0; i < f.length - 1;) {
    const status = f[i++];
    const renamed = /^[RC]/.test(status);
    const old = f[i++];
    const now = renamed ? f[i++] : old;
    if (status === "A" || renamed) c.added.add(now);
    if (isVitestTest(now) && status !== "D")
      c.tests.push({ now, old: status === "A" ? null : old });
    else if (isSupport(now) || isSupport(old)) {
      c.support.push({ path: now, deleted: status === "D" });
      if (renamed) c.support.push({ path: old, deleted: true });
    } else if (SOURCE.test(now) && !TEST_FILE.test(now)) c.source = true;
  }
  return c;
}

/** A test file that names the site's build folder reads it, so the parent's build is made first (`pnpm site:build`). */
const READS_BUILD = /\bdist\b/;

const MISSING =
  /(?:Failed to resolve import|Cannot find module) ["']([^"']+)["'](?: from ["']([^"']+)["'])?/;
/** A test file that could not load is red only when what it misses is a file the commit adds (a new module). */
export function loadFailure(
  message: string,
  file: string,
  added: Set<string>,
  real: string,
): string {
  const m = MISSING.exec(message);
  if (m?.[1].startsWith(".")) {
    const from = m[2] ? relative(real, join(real, m[2])) : file;
    const path = normalize(join(dirname(from), m[1]));
    const tries = ["", ".ts", ".js", ".svelte", "/index.ts"];
    if (tries.some((ext) => added.has(`${path}${ext}`))) return "red";
  }
  return `the file did not load: ${(message.split("\n")[0] || "no message").slice(0, 160)}`;
}

interface Verdict {
  code: number;
  lines: string[];
}

/** The verdict on one commit from the run of its test files on the parent (`before`: file::name already there). */
export function judgeCommit(
  c: Change,
  before: Set<string>,
  report: VitestReport,
  real: string,
  markers: Map<string, ReturnType<typeof readMarkers>["markers"]>,
): Verdict {
  const wrong: string[] = [];
  const notRun: string[] = [];
  const failing: string[] = [];
  const passing: string[] = [];
  const red = new Set<string>(); // statements (or files) with a new test red for the right reason
  const gained = new Set<string>();
  const byFile = new Map(
    report.testResults.map((r) => [relative(real, r.name), r]),
  );
  for (const t of c.tests) {
    const r = byFile.get(t.now);
    if (!r) {
      notRun.push(`${t.now}: not in the results`);
      continue;
    }
    if (!r.assertionResults.length) {
      const why = loadFailure(r.message ?? "", t.now, c.added, real);
      if (why !== "red") wrong.push(`${t.now}: ${why}`);
      else {
        red.add(t.now);
        gained.add(t.now);
      }
      continue;
    }
    for (const a of r.assertionResults) {
      const isNew = !before.has(`${t.old}::${a.fullName}`);
      const line = a.location?.line ?? 0;
      const statement =
        markers.get(t.now)?.find((m) => line >= m.from && line <= m.to)?.id ??
        t.now;
      const name = `${t.now}: ${a.fullName}`;
      if (isNew && ["passed", "failed"].includes(a.status))
        gained.add(statement);
      if (a.status === "passed") {
        if (isNew) passing.push(name);
      } else if (a.status !== "failed") {
        notRun.push(`${name}: ${a.status}`);
      } else {
        failing.push(name);
        if (isNew) red.add(statement);
      }
    }
  }
  return verdict(c, { wrong, notRun, failing, passing, red, gained });
}

function verdict(
  c: Change,
  o: {
    wrong: string[];
    notRun: string[];
    failing: string[];
    passing: string[];
    red: Set<string>;
    gained: Set<string>;
  },
): Verdict {
  const list = (word: string, xs: string[]) => xs.map((x) => `${word}: ${x}`);
  if (!c.source) {
    const lines = [
      ...list("fails on its own source (a failing commit)", [
        ...o.wrong,
        ...o.failing,
      ]),
      ...list("pinned, not red (proof: mutation, #136)", o.passing),
      ...list("did not run", o.notRun),
    ];
    const code =
      o.wrong.length || o.failing.length
        ? FINDING
        : o.notRun.length
          ? CANNOT
          : PASS;
    return { code, lines };
  }
  const blue = [...o.gained].filter((s) => !o.red.has(s)).sort();
  const lines = [
    ...list("red for the wrong reason", o.wrong),
    ...list("no new test red on the parent", blue),
    ...list("did not run", o.notRun),
    ...list("passes on the parent (proof: mutation, #136)", o.passing),
  ];
  const code =
    o.wrong.length || blue.length ? FINDING : o.notRun.length ? CANNOT : PASS;
  return { code, lines };
}

const git = (root: string, ...args: string[]) =>
  spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: childEnv(),
    maxBuffer: 1 << 28,
  });

/** The parent's tree in a fresh folder, installed from its own lockfile, offline. */
function parentTree(root: string, sha: string): { dir: string } | Result {
  const dir = mkdtempSync(join(tmpdir(), "red-check-"));
  const tar = join(dir, "..", `${dir.split("/").pop()}.tar`);
  const a = git(root, "archive", "--format=tar", `--output=${tar}`, `${sha}^`);
  const x =
    a.status === 0
      ? spawnSync("tar", ["-xf", tar, "-C", dir], { encoding: "utf8" })
      : a;
  rmSync(tar, { force: true });
  if (x.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    return result(CANNOT, `cannot unpack ${sha}^`, [x.stderr.trim()]);
  }
  const i = spawnSync(
    binaryOf("pnpm"),
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    { cwd: dir, encoding: "utf8", env: childEnv(), maxBuffer: 1 << 26 },
  );
  if (i.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    return result(
      CANNOT,
      `pnpm install --offline in ${sha}^ failed`,
      i.error
        ? [`cannot run ${binaryOf("pnpm")}`]
        : tail(`${i.stdout}${i.stderr}`),
    );
  }
  return { dir: realpathSync(dir) };
}

const show = (root: string, sha: string, path: string): string =>
  git(root, "show", `${sha}:${path}`).stdout;

/** The flags of the shared run (testRun in gate-step.ts) that decide what a failure is. */
const FLAGS = [
  "--dangerouslyIgnoreUnhandledErrors=false",
  "--expect.requireAssertions",
  "--typecheck.enabled=false",
  "--update=none",
  "--includeTaskLocation",
  "--cache=false",
];

/** One commit: its test files run twice on the parent, first the parent's own versions (the names already there). */
export function checkCommit(root: string, c: Change, keep: string): Verdict {
  const tree = parentTree(root, c.sha);
  if (isResult(tree))
    return { code: tree.code, lines: [tree.summary, ...tree.details] };
  const { dir } = tree;
  try {
    const bin = join(dir, "node_modules", ".bin", "vitest");
    const args = ["--config", join(dir, "vitest.config.ts"), ...FLAGS];
    const olds = c.tests.flatMap((t) =>
      t.old && existsSync(join(dir, t.old)) ? [t.old] : [],
    );
    const before = new Set<string>();
    if (olds.length) {
      const r = vitest(dir, [...olds, ...args], undefined, bin);
      if (!r.report)
        return {
          code: CANNOT,
          lines: [
            "the parent's own tests wrote no report",
            ...(r.error ? [r.error] : tail(r.out)),
          ],
        };
      for (const f of r.report.testResults)
        for (const a of f.assertionResults)
          before.add(`${relative(dir, f.name)}::${a.fullName}`);
    }
    for (const s of c.support)
      if (s.deleted) rmSync(join(dir, s.path), { force: true });
      else put(dir, s.path, show(root, c.sha, s.path));
    const markers = new Map<
      string,
      ReturnType<typeof readMarkers>["markers"]
    >();
    for (const t of c.tests) {
      if (t.old && t.old !== t.now) rmSync(join(dir, t.old), { force: true });
      const text = show(root, c.sha, t.now);
      put(dir, t.now, text);
      markers.set(t.now, readMarkers(t.now, text).markers);
    }
    if (
      c.tests.some((t) =>
        READS_BUILD.test(readFileSync(join(dir, t.now), "utf8")),
      )
    ) {
      const b = spawnSync(
        join(dir, "node_modules", ".bin", "vite"),
        ["build", "--config", "site/vite.config.ts"],
        { cwd: dir, encoding: "utf8", env: childEnv(), maxBuffer: 1 << 26 },
      );
      if (b.status !== 0)
        return {
          code: CANNOT,
          lines: [
            "the parent's site build failed",
            ...tail(`${b.stdout}${b.stderr}`),
          ],
        };
    }
    const run = vitest(
      dir,
      [...c.tests.map((t) => t.now), ...args],
      join(keep, "vitest"),
      bin,
    );
    if (!run.report)
      return {
        code: CANNOT,
        lines: [
          "the run wrote no report",
          ...(run.error ? [run.error] : tail(run.out)),
        ],
      };
    return judgeCommit(c, before, run.report, dir, markers);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function put(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** The canary: planted results the judge must refuse (an import-error red, a new test that passes on the parent). */
function canary(): string | null {
  const dir = canaries("red-check");
  const real = "/canary";
  const c = readChange(
    "canary",
    "canary",
    "M\0src/a.ts\0M\0src/a.test.ts\0M\0src/b.test.ts\0",
  );
  const report = JSON.parse(
    readFileSync(join(dir, "report.json"), "utf8"),
  ) as VitestReport;
  const v = judgeCommit(c, new Set(), report, real, new Map());
  const caught = ["src/a.test.ts: the file did not load", "src/b.test.ts"];
  const missed = caught.filter((x) => !v.lines.some((l) => l.includes(x)));
  return v.code === FINDING && !missed.length
    ? null
    : `the judge passed the canary (${missed.join(", ") || `code ${v.code}`})`;
}

/**
 * The step. A push is checked on its pull request. The range is the base of `baseCommit` to HEAD; a merge commit is
 * skipped and listed. A commit that changes no Vitest test file has nothing to show red.
 */
export function check(root: string): Result {
  const planted = canary();
  if (planted) return result(CANNOT, planted);
  const base = baseCommit(root);
  if (isResult(base)) return base;
  if (base.kind === "push" || !base.base)
    return result(NA, "a push is checked on its pull request");
  const list = git(
    root,
    "rev-list",
    "--reverse",
    "--parents",
    `${base.base}..HEAD`,
  );
  if (list.status !== 0)
    return result(CANNOT, `git rev-list ${base.base}..HEAD failed`, [
      list.stderr.trim(),
    ]);
  const keep = freshReports(root, "red-check");
  const details: string[] = [];
  let code = NA;
  let checked = 0;
  for (const [sha, ...parents] of list.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(" "))) {
    const subject = git(root, "log", "-1", "--format=%s", sha).stdout.trim();
    const head = `${sha.slice(0, 7)} ${subject}`;
    if (parents.length !== 1) {
      details.push(`${head}: a merge, not checked`);
      continue;
    }
    const d = git(
      root,
      "-c",
      "core.quotePath=false",
      "diff",
      "-z",
      "--name-status",
      "-M",
      "--no-ext-diff",
      `${sha}^`,
      sha,
    );
    if (d.status !== 0)
      return result(CANNOT, `git diff of ${sha} failed`, [d.stderr.trim()]);
    const c = readChange(sha, subject, d.stdout);
    if (!c.tests.length) continue;
    checked++;
    const v = checkCommit(root, c, join(keep, sha));
    code = worse(code, v.code);
    details.push(
      `${head}: ${[c.source ? "red" : "pinned", "refused", "", "could not check"][v.code]}`,
      ...v.lines.map((l) => `  ${l}`),
    );
  }
  if (!checked)
    return result(NA, "no commit changes a Vitest test file", details);
  const word = {
    [PASS]: "shown red or pinned",
    [FINDING]: "refused",
    [CANNOT]: "could not be checked",
  }[code];
  return result(
    code,
    `${checked} commit(s) with Vitest tests ${word}`,
    details,
  );
}

/** CANNOT outranks FINDING (a check that could not run hides what it would have found), which outranks PASS and NA. */
const worse = (a: number, b: number): number =>
  [CANNOT, FINDING, PASS, NA].find((c) => c === a || c === b)!;
