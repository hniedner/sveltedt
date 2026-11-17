// check-repo: the repository checks that need no product code, and `all`, the gate command that runs them.
//   node scripts/check-repo.ts <check> [--root <dir>]   one check, or `all` (what `pnpm gate` runs)
//   node scripts/check-repo.ts needs '<json>'           CI only: the `needs` context of the `gate` job
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// Files are listed with `git ls-files`, so only tracked files are read.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { fileURLToPath } from "node:url";

const PASS = 0,
  FINDING = 1,
  USAGE = 2,
  CANNOT = 3;
const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
};
const LICENSE_SHA256 =
  "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"; // apache.org LICENSE-2.0.txt
const COPYRIGHT = "Copyright 2026 R. Hannes Niedner";
const REQUIRED = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".gitignore",
  ".node-version",
  "AGENTS.md",
  "docs/engineering/method.md",
  "docs/engineering/gates.md",
  "scripts/actionlint.version",
  ".github/workflows/ci.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/scorecard.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
  "scripts/check-repo.test.ts",
  "scripts/scan-secrets.ts",
  "scripts/scan-secrets.test.ts",
  "scripts/gitleaks.toml",
  "scripts/gitleaks.version",
];
const TEST_FILES = /^scripts\/[^/]+\.test\.(?:mjs|ts)$/;
const CI_FILE = ".github/workflows/ci.yml";
const PINNED = /^["']?[\w.-]+\/[\w./-]+@[0-9a-f]{40}["']? # \S+/;

interface Result {
  code: number;
  summary: string;
  details: string[];
}
type Check = (root: string, list: Set<string>) => Result;
const result = (
  code: number,
  summary: string,
  details: string[] = [],
): Result => ({
  code,
  summary,
  details,
});
const isResult = (x: object): x is Result => "code" in x;

/** The fields of package.json that the steps read. */
interface PackageJson {
  packageManager?: string;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function tracked(root: string): Set<string> | null {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const files = r.stdout.split("\0").filter(Boolean);
  return files.length ? new Set(files) : null;
}

function files(root: string, list: Set<string>): Result {
  const details: string[] = [];
  for (const f of REQUIRED)
    if (!list.has(f) || !existsSync(join(root, f)))
      details.push(`missing: ${f}`);
  const read = (f: string) =>
    existsSync(join(root, f)) ? readFileSync(join(root, f)) : Buffer.alloc(0);
  if (
    createHash("sha256").update(read("LICENSE")).digest("hex") !==
    LICENSE_SHA256
  )
    details.push("LICENSE: not the Apache-2.0 text");
  if (!read("NOTICE").toString().includes(COPYRIGHT))
    details.push(`NOTICE: no line "${COPYRIGHT}"`);
  if (!read(".gitignore").toString().split("\n").includes("/tmp/"))
    details.push(".gitignore: no line /tmp/");
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  return result(
    PASS,
    `${REQUIRED.length} required files present, LICENSE, NOTICE and .gitignore as required`,
  );
}

function pins(root: string, list: Set<string>): Result {
  const yaml = [...list].filter((f) => /^\.github\/.*\.ya?ml$/.test(f));
  if (!yaml.length) return result(CANNOT, "no YAML file under .github/");
  let uses = 0;
  const details: string[] = [];
  for (const f of yaml) {
    readFileSync(join(root, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const m = /^\s*(?:-\s*)?uses\s*:\s*(.*)$/.exec(line);
        if (!m) return;
        uses += 1;
        if (!PINNED.test(m[1]))
          details.push(
            `${f}:${i + 1}: not "owner/repo@<40-hex sha> # <tag>": ${m[1].trim()}`,
          );
      });
  }
  if (!uses)
    return result(CANNOT, `no uses line in ${yaml.length} YAML file(s)`);
  if (details.length)
    return result(
      FINDING,
      `${details.length} of ${uses} uses line(s) not pinned`,
      details,
    );
  return result(
    PASS,
    `${uses} uses line(s) in ${yaml.length} YAML file(s), all pinned by SHA with a tag`,
  );
}

function gateNeeds(root: string, list: Set<string>): Result {
  if (!list.has(CI_FILE)) return result(CANNOT, `${CI_FILE} is not tracked`);
  const lines = readFileSync(join(root, CI_FILE), "utf8").split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return result(CANNOT, `${CI_FILE}: no top-level jobs: line`);
  const jobs = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const id = /^ {2}([\w-]+):\s*$/.exec(line);
    if (id) jobs.set((current = id[1]), []);
    else if (current) jobs.get(current)?.push(line);
  }
  if (!jobs.size) return result(CANNOT, `${CI_FILE}: no job found under jobs:`);
  if (!jobs.has("gate"))
    return result(FINDING, `${CI_FILE}: no job named gate`);
  const body = jobs.get("gate") ?? [];
  const needsLine = body.find((l) => /^ {4}needs\s*:/.test(l));
  const flow = needsLine
    ? /^ {4}needs: \[([\w\s,-]*)\]\s*$/.exec(needsLine)
    : null;
  if (needsLine && !flow)
    return result(
      CANNOT,
      `${CI_FILE}: gate's needs is not written as needs: [a, b]`,
    );
  const needs = new Set(
    flow
      ? flow[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  );
  const details = [...jobs.keys()]
    .filter((j) => j !== "gate" && !needs.has(j))
    .map((j) => `gate does not need job ${j}`);
  if (!body.some((l) => /^ {4}if: always\(\)\s*$/.test(l)))
    details.push("gate has no line `if: always()`");
  if (details.length)
    return result(
      FINDING,
      `${details.length} problem(s) in the gate job`,
      details,
    );
  return result(
    PASS,
    `gate always runs and needs all ${jobs.size - 1} other job(s)`,
  );
}

function links(root: string, list: Set<string>): Result {
  const markdown = [...list].filter((f) => f.endsWith(".md"));
  if (!markdown.length) return result(CANNOT, "no tracked Markdown file");
  const dirs = new Set(
    [...list].flatMap((f) =>
      f
        .split("/")
        .slice(0, -1)
        .map((_, i, a) => a.slice(0, i + 1).join("/")),
    ),
  );
  let count = 0;
  const details: string[] = [];
  for (const f of markdown) {
    readFileSync(join(root, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
          const target = m[1].replace(/[#?].*$/, "");
          if (!target || /^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
          count += 1;
          const path = posix
            .normalize(
              target.startsWith("/")
                ? target.slice(1)
                : posix.join(posix.dirname(f), target),
            )
            .replace(/\/$/, "");
          if (!list.has(path) && !dirs.has(path))
            details.push(
              `${f}:${i + 1}: ${m[1]} does not resolve to a tracked file`,
            );
        }
      });
  }
  if (!count)
    return result(
      CANNOT,
      `no relative link in ${markdown.length} Markdown file(s)`,
    );
  if (details.length)
    return result(
      FINDING,
      `${details.length} of ${count} relative link(s) broken`,
      details,
    );
  return result(
    PASS,
    `${count} relative link(s) in ${markdown.length} Markdown file(s) resolve`,
  );
}

const CANARY =
  "on: push\njobs:\n  nope:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ nope.value }}\n";

// actionlint drops its shellcheck pass silently when shellcheck is missing; this script must draw SC2086 from it.
const SHELL_CANARY =
  "on: push\njobs:\n  canary:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo $FOO\n";

const errorCode = (e: NodeJS.ErrnoException | undefined): string | undefined =>
  e?.code;

/** The first line `bin flag` prints, or a could-not-check result when it cannot run. */
function versionOf(bin: string, flag: string): Result | { line: string } {
  const v = spawnSync(bin, [flag], { encoding: "utf8" });
  if (v.error || v.status !== 0)
    return result(
      CANNOT,
      `cannot run ${bin}: ${errorCode(v.error) ?? `exit ${v.status}`}`,
    );
  return { line: v.stdout.split("\n")[0].trim() };
}

/** A binary pinned in `scripts/<name>.version` (<NAME>_BIN overrides the path): its path and checked version. */
function pinnedBinary(
  root: string,
  name: string,
  flag: string,
): Result | { bin: string; got: string } {
  const bin = process.env[`${name.toUpperCase()}_BIN`] || name;
  const file = `scripts/${name}.version`;
  const wanted = /^version (\S+)$/m.exec(readText(root, file));
  if (!wanted) return result(CANNOT, `${file} holds no line \`version <x>\``);
  const v = versionOf(bin, flag);
  if (isResult(v)) return v;
  const got = v.line.replace(`${name} `, "");
  if (got !== wanted[1])
    return result(
      CANNOT,
      `${name} is ${got}, the pinned version is ${wanted[1]}`,
    );
  return { bin, got };
}

function actionlint(root: string, list: Set<string>): Result {
  const tool = pinnedBinary(root, "actionlint", "-version");
  if (isResult(tool)) return tool;
  const { bin, got } = tool;
  const dir = mkdtempSync(join(tmpdir(), "actionlint-canary-"));
  try {
    writeFileSync(join(dir, "canary.yml"), CANARY);
    if (spawnSync(bin, [join(dir, "canary.yml")]).status === 0)
      return result(CANNOT, "actionlint passed the planted bad workflow");
    writeFileSync(join(dir, "shell.yml"), SHELL_CANARY);
    const s = spawnSync(bin, [join(dir, "shell.yml")], { encoding: "utf8" });
    if (s.status !== 1 || !`${s.stdout}${s.stderr}`.includes("SC2086"))
      return result(
        CANNOT,
        "actionlint did not report SC2086 on the planted shell script: is shellcheck installed?",
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const workflows = [...list].filter((f) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f),
  );
  if (!workflows.length) return result(CANNOT, "no workflow file");
  const r = spawnSync(
    bin,
    workflows.map((f) => join(root, f)),
    { cwd: root, encoding: "utf8" },
  );
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
  if (r.status === 0)
    return result(
      PASS,
      `actionlint ${got} found both canaries and passed ${workflows.length} workflow(s)`,
    );
  if (r.status === 1)
    return result(
      FINDING,
      `actionlint reported problems in ${workflows.length} workflow(s)`,
      out,
    );
  return result(
    CANNOT,
    `actionlint exited ${r.status ?? errorCode(r.error)}`,
    out,
  );
}

/** This process's environment without git's variables: a child started inside a git hook must not reach the repo. */
function childEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  delete env.NODE_TEST_CONTEXT; // set when this runs inside a test run; it would change the child's reporter
  return env;
}

function runTestFile(
  root: string,
  file: string,
): { code: number; line: string } {
  if (!existsSync(join(root, file)))
    return { code: CANNOT, line: `${file}: missing` };
  // Run the file itself, not `node --test <file>`: the latter counts a file holding no test as one passing test.
  const r = spawnSync(
    process.execPath,
    ["--test-reporter=tap", join(root, file)],
    { cwd: root, encoding: "utf8", env: childEnv() },
  );
  const count = (name: string): number =>
    Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(r.stdout)?.[1] ?? NaN);
  const [tests, pass, fail] = [count("tests"), count("pass"), count("fail")];
  if (!(tests > 0))
    return { code: CANNOT, line: `${file}: no test ran (exit ${r.status})` };
  if (r.status !== 0 || fail > 0 || pass !== tests) {
    const failed = r.stdout
      .split("\n")
      .filter((l) => /^\s*not ok /.test(l))
      .map((l) => `  ${l.trim()}`);
    return {
      code: FINDING,
      line: [
        `${file}: ${fail} of ${tests} failed (exit ${r.status})`,
        ...failed,
      ].join("\n"),
    };
  }
  return { code: PASS, line: `${file}: ${tests} passed` };
}

// Every tracked test file runs, each with its own count; a file with no test is could-not-check.
function selftest(root: string, list: Set<string>): Result {
  const files = [...list].filter((f) => TEST_FILES.test(f)).sort();
  if (!files.length)
    return result(
      CANNOT,
      "no tracked test file scripts/*.test.mjs or scripts/*.test.ts",
    );
  const runs = files.map((f) => runTestFile(root, f));
  const details = runs.map((r) => r.line);
  if (runs.some((r) => r.code === FINDING))
    return result(FINDING, "a test file failed", details);
  if (runs.some((r) => r.code !== PASS))
    return result(CANNOT, "a test file could not be checked", details);
  return result(PASS, `${files.length} test file(s) ran and passed`, details);
}

function needs(json: string | undefined): Result {
  let jobs: [string, { result?: string } | null][];
  try {
    jobs = Object.entries(
      JSON.parse(json ?? "") as Record<string, { result?: string } | null>,
    );
  } catch {
    return result(CANNOT, "the needs context is not JSON");
  }
  if (!jobs.length) return result(CANNOT, "the needs context lists no job");
  const lines = jobs.map(([id, j]) => `${id}: ${j?.result}`);
  if (jobs.some(([, j]) => j?.result === "failure"))
    return result(FINDING, "a needed job failed", lines);
  if (jobs.some(([, j]) => j?.result !== "success"))
    return result(CANNOT, "a needed job did not run to success", lines);
  return result(PASS, `${jobs.length} needed job(s) succeeded`, lines);
}

function readJson(root: string, f: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(join(root, f), "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

// Node's major must equal .node-version's (CI runs the exact pin); pnpm must be the packageManager version, because
// `pmOnFail: ignore` keeps pnpm itself from enforcing it (docs/decisions/001-quality-tooling.md).
function toolchain(root: string): Result {
  const pkg = readJson(root, "package.json");
  if (!pkg) return result(CANNOT, "package.json is missing or not JSON");
  const pin = /^pnpm@(\d+\.\d+\.\d+)$/.exec(pkg.packageManager ?? "");
  if (!pin)
    return result(
      FINDING,
      `package.json: packageManager is not "pnpm@<x.y.z>": ${pkg.packageManager}`,
    );
  const wanted = existsSync(join(root, ".node-version"))
    ? readFileSync(join(root, ".node-version"), "utf8").trim()
    : "";
  const node = process.versions.node;
  if (wanted.split(".")[0] !== node.split(".")[0])
    return result(CANNOT, `node is ${node}, .node-version pins ${wanted}`);
  const v = versionOf(process.env.PNPM_BIN || "pnpm", "--version");
  if (isResult(v)) return v;
  if (v.line !== pin[1])
    return result(CANNOT, `pnpm is ${v.line}, packageManager pins ${pin[1]}`);
  const note =
    node === wanted
      ? []
      : [`node ${node} differs from the pin ${wanted} in the patch only`];
  return result(
    PASS,
    `node ${node.split(".")[0]}.x and pnpm ${pin[1]} as pinned`,
    note,
  );
}

const EXACT = /^\d+\.\d+\.\d+$/;
const ADVISORY = /#\s*GHSA(-[23456789cfghjmpqrvwx]{4}){3}\b/;

/** The value of `key: <digits>` in YAML lines, or null. */
const yamlNumber = (lines: string[], key: string): number =>
  Number(
    lines
      .map((l) => new RegExp(`^\\s*${key}:\\s*(\\d+)\\s*$`).exec(l)?.[1])
      .find(Boolean) ?? NaN,
  );

const readText = (root: string, f: string): string =>
  existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "";

/** The lockfile is tracked and is one YAML document (G11). */
function lockfileProblems(root: string, list: Set<string>): string[] {
  if (!list.has("pnpm-lock.yaml")) return ["pnpm-lock.yaml is not tracked"];
  const docs = readText(root, "pnpm-lock.yaml")
    .split(/^---\s*$/m)
    .filter((d) => d.trim());
  return docs.length === 1
    ? []
    : [`pnpm-lock.yaml holds ${docs.length} YAML documents, not 1`];
}

/** Exact development dependencies; nothing ships but a svelte peer (PRD-S5). */
function packageProblems(pkg: PackageJson): string[] {
  const ranges = Object.entries(pkg.devDependencies ?? {})
    .filter(([, v]) => !EXACT.test(v))
    .map(([n, v]) => `devDependencies: ${n} is "${v}", not an exact version`);
  const runtime = Object.keys(pkg.dependencies ?? {}).map(
    (n) => `dependencies: ${n} would ship; only the svelte peer may`,
  );
  const peers = Object.keys(pkg.peerDependencies ?? {})
    .filter((n) => n !== "svelte")
    .map((n) => `peerDependencies: ${n} would ship; only svelte may`);
  return [...ranges, ...runtime, ...peers];
}

/** pnpm's release age equals Dependabot's shortest npm cooldown; every exception names its advisory. */
function ageProblems(root: string): string[] {
  const workspace = readText(root, "pnpm-workspace.yaml").split("\n");
  const age = yamlNumber(workspace, "minimumReleaseAge");
  const bot = readText(root, ".github/dependabot.yml");
  const npm = /- package-ecosystem: npm\n([\s\S]*?)(?=\n {2}- |$)/.exec(bot);
  // So Dependabot never proposes a version pnpm would refuse to install.
  const days = Math.min(
    ...[...(npm?.[1] ?? "").matchAll(/^\s*[\w-]*days:\s*(\d+)\s*$/gm)].map(
      (m) => Number(m[1]),
    ),
  );
  const problems: string[] = [];
  if (!(age > 0)) problems.push("pnpm-workspace.yaml: no minimumReleaseAge");
  else if (age !== days * 1440)
    problems.push(
      `minimumReleaseAge ${age} min differs from Dependabot's shortest npm cooldown, ${days} days`,
    );
  const at = workspace.findIndex((l) => /^minimumReleaseAgeExclude:/.test(l));
  const entries = at < 0 ? [] : workspace.slice(at + 1);
  const end = entries.findIndex((l) => !/^\s+-/.test(l));
  for (const l of end < 0 ? entries : entries.slice(0, end))
    if (!ADVISORY.test(l))
      problems.push(
        `minimumReleaseAgeExclude: "${l.trim()}" names no GHSA advisory`,
      );
  return problems;
}

// What ships is Category A only (PRD-S5): no runtime dependency, no peer but svelte. Development dependencies are
// exact; the lockfile is one YAML document (G11); pnpm's release age equals Dependabot's npm cooldown, and every
// exception to it names its advisory.
function lockfile(root: string, list: Set<string>): Result {
  const pkg = readJson(root, "package.json");
  if (!pkg) return result(CANNOT, "package.json is missing or not JSON");
  const details = [
    ...lockfileProblems(root, list),
    ...packageProblems(pkg),
    ...ageProblems(root),
  ];
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  const devs = Object.keys(pkg.devDependencies ?? {}).length;
  return result(
    PASS,
    `one lockfile document, ${devs} exact dev dependencies, nothing ships, release age equals the shortest cooldown`,
  );
}

// Every tracked file belongs to the first class whose pattern matches it: the steps that check it, or none with the
// reason. A tracked file of no class makes the steps that read this table answer could-not-check, so a new kind of
// file is a decision, never a silent skip.
interface FileClass {
  match: RegExp;
  steps: string[];
  why?: string;
}
const CLASSES: FileClass[] = [
  {
    match: /^pnpm-lock\.yaml$/,
    steps: [],
    why: "written by pnpm; read by the lockfile step",
  },
  {
    match: /^scripts\/canaries\//,
    steps: [],
    why: "planted violations, run by their own step's canary run",
  },
  {
    match: /^docs\/engineering\/(method|gates)\.md$/,
    steps: ["text"],
    why: "owner-approved text: changes only through its change log, never by a formatter",
  },
  {
    match: /\.test\.mjs$/,
    steps: ["format", "lint"],
    why: "dupes: a test may repeat its setup so it reads on its own (method section 5)",
  },
  { match: /\.mjs$/, steps: ["format", "lint", "dupes"] },
  {
    match: /\.test\.ts$/,
    steps: ["format", "lint"],
    why: "dupes: a test may repeat its setup so it reads on its own (method section 5); types enters next",
  },
  {
    match: /\.ts$/,
    steps: ["format", "lint", "dupes"],
    why: "types for TypeScript enters in the next commit",
  },
  { match: /\.(md|ya?ml|json)$/, steps: ["format"] },
  {
    match:
      /^(LICENSE|NOTICE|\.editorconfig|\.gitignore|\.node-version|\.github\/CODEOWNERS|scripts\/[\w-]+\.version)$/,
    steps: ["text"],
  },
  {
    match: /\.toml$/,
    steps: ["text"],
    why: "format: Prettier has no TOML parser",
  },
];

/** The tracked files a step checks, and the tracked files of no class. */
function classified(
  list: Set<string>,
  step: string,
): { mine: string[]; unknown: string[] } {
  const mine: string[] = [],
    unknown: string[] = [];
  for (const f of list) {
    const c = CLASSES.find((k) => k.match.test(f));
    if (!c) unknown.push(f);
    else if (c.steps.includes(step)) mine.push(f);
  }
  return { mine, unknown };
}

const CONFLICT = /^(<{7} |={7}$|>{7} )/;

// For files no formatter rewrites: LF line endings, a final newline, no trailing whitespace, no conflict marker.
function text(root: string, list: Set<string>): Result {
  const { mine, unknown } = classified(list, "text");
  if (unknown.length)
    return result(
      CANNOT,
      `${unknown.length} tracked file(s) of no class`,
      unknown,
    );
  if (!mine.length) return result(CANNOT, "no file to check");
  const details: string[] = [];
  for (const f of mine) {
    const t = readFileSync(join(root, f), "utf8");
    if (t && !t.endsWith("\n")) details.push(`${f}: no final newline`);
    t.split("\n").forEach((line, i) => {
      if (line.endsWith("\r")) details.push(`${f}:${i + 1}: CRLF line ending`);
      else if (/[ \t]$/.test(line))
        details.push(`${f}:${i + 1}: trailing whitespace`);
      if (CONFLICT.test(line))
        details.push(`${f}:${i + 1}: merge-conflict marker`);
    });
  }
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  return result(
    PASS,
    `${mine.length} file(s): LF, final newline, no trailing whitespace, no conflict marker`,
  );
}

const HERE = dirname(fileURLToPath(import.meta.url));
const canaries = (step: string): string =>
  join(process.env.CANARY_DIR || join(HERE, "canaries"), step);

// Asks Prettier itself, file by file, whether it ignores the file, which parser it infers and whether the file is
// formatted, with the options its CLI would use. Prints one JSON record.
const PRETTIER_PROBE = `
import { readFileSync } from "node:fs";
const [url, root, ...files] = process.argv.slice(1);
const p = await import(url);
const out = { version: p.version, files: [] };
for (const f of files) {
  const path = root + "/" + f;
  const info = await p.getFileInfo(path, { ignorePath: [] });
  const rec = { f, ignored: info.ignored, parser: info.inferredParser };
  if (rec.parser && !rec.ignored) {
    const options = { ...(await p.resolveConfig(path, { editorconfig: true })), filepath: path };
    try { rec.formatted = await p.check(readFileSync(path, "utf8"), options); }
    catch (e) { rec.error = String(e.message).split("\\n")[0]; }
  }
  out.files.push(rec);
}
console.log(JSON.stringify(out));
`;

// Asks ESLint itself for its result on each file, with this repository's config and no ignore patterns. Prints one
// JSON record; a file ESLint did not lint shows as a message without a rule.
const ESLINT_PROBE = `
const [url, config, root, ...files] = process.argv.slice(1);
const { ESLint } = await import(url);
const eslint = new ESLint({ cwd: root, overrideConfigFile: config, ignore: false, warnIgnored: true });
const results = await eslint.lintFiles(files);
console.log(JSON.stringify({ version: ESLint.version, files: results.map((r) => ({
  f: r.filePath.slice(root.length + 1),
  messages: r.messages.map((m) => ({ rule: m.ruleId, text: m.line + ":" + m.column + " " + (m.ruleId ?? "") + " " + m.message })),
})) }));
`;

interface ToolError {
  error: string;
}
interface PrettierRecord {
  version: string;
  files: {
    f: string;
    ignored: boolean;
    parser?: string | null;
    formatted?: boolean;
    error?: string;
  }[];
}
interface EslintRecord {
  version: string;
  files: { f: string; messages: { rule: string | null; text: string }[] }[];
}

/** A tool's own record for `files` under `root`, from the copy of `pkg` installed next to this script, or an error. */
function toolRecord<T>(
  pkg: string,
  probe: string,
  root: string,
  files: string[],
  extra: string[] = [],
): T | ToolError {
  let url: string;
  try {
    url = import.meta.resolve(pkg); // the ESM entry, next to this script
  } catch {
    return { error: `${pkg} is not installed (run pnpm install)` };
  }
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", probe, url, ...extra, root, ...files],
    // In the checked root: the TypeScript project service looks for tsconfig.json from there.
    { encoding: "utf8", cwd: root, env: childEnv() },
  );
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    return {
      error: `the ${pkg} probe failed (exit ${r.status}): ${r.stderr.split("\n")[0]}`,
    };
  }
}

/** The files of `step`'s class and its canary folder, or a could-not-check result. */
function toolInputs(
  list: Set<string>,
  step: string,
): Result | { mine: string[]; dir: string; planted: string[] } {
  const { mine, unknown } = classified(list, step);
  if (unknown.length)
    return result(
      CANNOT,
      `${unknown.length} tracked file(s) of no class`,
      unknown,
    );
  if (!mine.length) return result(CANNOT, "no file to check");
  const dir = canaries(step);
  const planted = existsSync(dir) ? readdirSync(dir) : [];
  if (!planted.length) return result(CANNOT, `no canary in ${dir}`);
  return { mine, dir, planted };
}

// Prettier on every file of the format class, with no ignore file, so only the class table selects files. The
// planted canaries must fail first, and Prettier's own record must name every file it was given.
function format(root: string, list: Set<string>): Result {
  const inputs = toolInputs(list, "format");
  if (isResult(inputs)) return inputs;
  const { mine, dir, planted } = inputs;
  const prettierRecord = (r: string, f: string[]) =>
    toolRecord<PrettierRecord>("prettier", PRETTIER_PROBE, r, f);
  const canary = prettierRecord(dir, planted);
  if ("error" in canary) return result(CANNOT, canary.error);
  const missed = canary.files.filter(
    (c) => c.ignored || !c.parser || c.formatted !== false,
  );
  if (missed.length)
    return result(
      CANNOT,
      "Prettier passed a planted canary",
      missed.map((c) => c.f),
    );
  const pin = readJson(root, "package.json")?.devDependencies?.prettier;
  const rec = prettierRecord(root, mine);
  if ("error" in rec) return result(CANNOT, rec.error);
  if (rec.version !== pin)
    return result(
      CANNOT,
      `Prettier ${rec.version} is installed, package.json pins ${pin}`,
    );
  const skipped = rec.files.filter((r) => r.ignored || !r.parser);
  if (rec.files.length !== mine.length || skipped.length)
    return result(
      CANNOT,
      `Prettier did not check ${mine.length - rec.files.length + skipped.length} file(s)`,
      skipped.map((r) => r.f),
    );
  const details = rec.files.flatMap((r) =>
    r.error
      ? [`${r.f}: ${r.error}`]
      : r.formatted
        ? []
        : [`${r.f}: not formatted (pnpm exec prettier --write ${r.f})`],
  );
  if (details.length)
    return result(
      FINDING,
      `${details.length} of ${mine.length} file(s)`,
      details,
    );
  return result(
    PASS,
    `Prettier ${rec.version} failed ${planted.length} canaries and accepted ${mine.length} file(s)`,
  );
}

// The rules each extension's planted canary must raise. TypeScript files get typescript-eslint's type-aware
// twin of no-implied-eval, and no no-undef (TypeScript checks names itself).
const LINT_CANARY_RULES: Record<string, string[]> = {
  ".mjs": [
    "complexity",
    "no-eval",
    "no-implied-eval",
    "no-new-func",
    "no-undef",
  ],
  ".ts": [
    "complexity",
    "no-eval",
    "@typescript-eslint/no-implied-eval",
    "no-new-func",
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-floating-promises",
  ],
};

/** The planted rules a canary record did not raise, per extension, or "no canary for <ext>". */
function lintCanaryMisses(canary: EslintRecord): string[] {
  return Object.entries(LINT_CANARY_RULES).flatMap(([ext, rules]) => {
    const files = canary.files.filter((c) => c.f.endsWith(ext));
    if (!files.length) return [`no canary for ${ext}`];
    const raised = new Set(files.flatMap((c) => c.messages.map((m) => m.rule)));
    return rules
      .filter((rule) => !raised.has(rule))
      .map((rule) => `${ext}: ${rule}`);
  });
}

// ESLint on every file of the lint class with this repository's config and no ignore patterns. The planted canary
// must raise each rule of LINT_CANARY_RULES first; any message, warning or error, is a finding (no warning budget).
function lint(root: string, list: Set<string>): Result {
  const inputs = toolInputs(list, "lint");
  if (isResult(inputs)) return inputs;
  const { mine, dir, planted } = inputs;
  const config = [join(HERE, "..", "eslint.config.mjs")];
  const eslintRecord = (r: string, f: string[]) =>
    toolRecord<EslintRecord>("eslint", ESLINT_PROBE, r, f, config);
  const canary = eslintRecord(dir, planted);
  if ("error" in canary) return result(CANNOT, canary.error);
  const missed = lintCanaryMisses(canary);
  if (missed.length)
    return result(CANNOT, "ESLint missed planted canaries", missed);
  const pin = readJson(root, "package.json")?.devDependencies?.eslint;
  const rec = eslintRecord(root, mine);
  if ("error" in rec) return result(CANNOT, rec.error);
  if (rec.version !== pin)
    return result(
      CANNOT,
      `ESLint ${rec.version} is installed, package.json pins ${pin}`,
    );
  const linted = new Set(rec.files.map((r) => r.f));
  const notLinted = mine.filter((f) => !linted.has(f));
  const ignored = rec.files.filter((r) =>
    r.messages.some((m) => !m.rule && /ignored/i.test(m.text)),
  );
  if (notLinted.length || ignored.length)
    return result(CANNOT, "ESLint did not lint every file", [
      ...notLinted,
      ...ignored.map((r) => r.f),
    ]);
  const details = rec.files.flatMap((r) =>
    r.messages.map((m) => `${r.f}:${m.text}`),
  );
  if (details.length)
    return result(
      FINDING,
      `${details.length} message(s) in ${mine.length} file(s)`,
      details,
    );
  return result(
    PASS,
    `ESLint ${rec.version} raised every planted rule (${Object.keys(LINT_CANARY_RULES).join(", ")}) and accepted ${mine.length} file(s)`,
  );
}

interface CloneSide {
  name: string;
  start: number;
  end: number;
}
interface JscpdReport {
  duplicates: { firstFile: CloneSide; secondFile: CloneSide }[];
  statistics: { total: { sources: number } };
}

/** jscpd's JSON report for `files` under `root`, from the jscpd installed next to this script, or an error. */
function jscpdReport(root: string, files: string[]): JscpdReport | ToolError {
  const bin = join(HERE, "..", "node_modules", ".bin", "jscpd");
  const out = mkdtempSync(join(tmpdir(), "jscpd-"));
  try {
    // Defaults written out, so an upgrade cannot change them silently.
    const args = [
      "--no-gitignore",
      "--absolute",
      "--min-tokens",
      "50",
      "--min-lines",
      "5",
    ];
    const r = spawnSync(
      bin,
      [
        ...args,
        "--reporters",
        "json",
        "--output",
        out,
        "--exit-code",
        "0",
      ].concat(files),
      { cwd: root, encoding: "utf8" },
    );
    if (r.error || r.status !== 0)
      return { error: `jscpd exited ${r.status ?? errorCode(r.error)}` };
    const report = JSON.parse(
      readFileSync(join(out, "jscpd-report.json"), "utf8"),
    ) as JscpdReport;
    // Absolute paths back to the relative paths given (the temp folder may sit behind a symlink).
    const given = (n: string): string =>
      files.find((f) => n.endsWith(`/${f}`)) ?? n;
    for (const d of report.duplicates)
      for (const side of [d.firstFile, d.secondFile])
        side.name = given(side.name);
    return report;
  } catch (e) {
    return { error: `no jscpd report: ${(e as Error).message.split("\n")[0]}` };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const jscpdVersion = () =>
  spawnSync(join(HERE, "..", "node_modules", ".bin", "jscpd"), ["--version"], {
    encoding: "utf8",
  })
    .stdout?.trim()
    .replace(/^jscpd /, "");

const at = (side: CloneSide): string =>
  `${side.name}:${side.start}-${side.end}`;

/** The extensions of the dupes class; each needs a planted clone pair. */
const DUPES_EXTENSIONS = [".mjs", ".ts"];

// Copy detection over every file of the dupes class (method section 5): any clone is a finding, so a repository that
// starts at zero stays at zero. The canary pair must be reported as one clone first. jscpd skips a file shorter than
// its minimum clone, which cannot hold a clone, so only "more than 0 files analysed" is demanded of the report.
function dupes(root: string, list: Set<string>): Result {
  const inputs = toolInputs(list, "dupes");
  if (isResult(inputs)) return inputs;
  const { mine, dir, planted } = inputs;
  const pin = readJson(root, "package.json")?.devDependencies?.jscpd;
  const version = jscpdVersion();
  if (version !== pin)
    return result(
      CANNOT,
      `jscpd ${version} is installed, package.json pins ${pin}`,
    );
  const canary = jscpdReport(dir, planted);
  if ("error" in canary) return result(CANNOT, canary.error);
  const inClone = new Set(
    canary.duplicates.flatMap((d) => [d.firstFile.name, d.secondFile.name]),
  );
  // One planted pair per extension the class claims, each reported as a clone.
  const missed = DUPES_EXTENSIONS.flatMap((ext) => {
    const pair = planted.filter((f) => f.endsWith(ext));
    if (pair.length < 2) return [`no canary pair for ${ext}`];
    return pair.filter((f) => !inClone.has(f));
  });
  if (missed.length)
    return result(CANNOT, "jscpd missed the planted clone", missed);
  const report = jscpdReport(root, mine);
  if ("error" in report) return result(CANNOT, report.error);
  const sources = report.statistics.total.sources;
  if (!(sources > 0))
    return result(CANNOT, `jscpd analysed 0 of ${mine.length} file(s)`);
  const details = report.duplicates.map(
    (d) => `${at(d.firstFile)} repeats ${at(d.secondFile)}`,
  );
  if (details.length)
    return result(FINDING, `${details.length} clone(s)`, details);
  return result(
    PASS,
    `jscpd ${version} found the canary clone and no clone in ${sources} of ${mine.length} file(s)` +
      (sources < mine.length ? " (the others are under 50 tokens)" : ""),
  );
}

// A workflow that triggers on pull_request_target, uses an unpinned action and puts a branch name into a shell.
const ZIZMOR_CANARY = `on: pull_request_target
jobs:
  canary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "\${{ github.head_ref }}"
`;

// zizmor (offline, its default persona) on the workflows and the Dependabot config: template injection, dangerous
// triggers, credentials, permissions (PRD-S5, method section 9). Exit 11-14 means findings by severity; any other
// non-zero exit is zizmor's own error (docs.zizmor.sh, usage).
function workflows(root: string, list: Set<string>): Result {
  const tool = pinnedBinary(root, "zizmor", "--version");
  if (isResult(tool)) return tool;
  const { bin, got } = tool;
  const finding = (s: number | null): boolean =>
    s !== null && s >= 11 && s <= 14;
  const dir = mkdtempSync(join(tmpdir(), "zizmor-canary-"));
  try {
    writeFileSync(join(dir, "canary.yml"), ZIZMOR_CANARY);
    const c = spawnSync(bin, ["--offline", join(dir, "canary.yml")]);
    if (!finding(c.status))
      return result(
        CANNOT,
        `zizmor did not report the planted workflow (exit ${c.status})`,
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const files = [...list].filter(
    (f) =>
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) ||
      f === ".github/dependabot.yml",
  );
  if (!files.some((f) => f.startsWith(".github/workflows/")))
    return result(CANNOT, "no workflow file");
  const r = spawnSync(bin, ["--offline", "--format", "plain", ...files], {
    cwd: root,
    encoding: "utf8",
  });
  const out = `${r.stdout}`.trim().split("\n").filter(Boolean);
  if (r.status === 0)
    return result(
      PASS,
      `zizmor ${got} reported the canary and passed ${files.length} file(s)`,
    );
  if (finding(r.status))
    return result(
      FINDING,
      `zizmor reported findings in ${files.length} file(s)`,
      out,
    );
  return result(CANNOT, `zizmor exited ${r.status ?? errorCode(r.error)}`, out);
}

const CHECKS: Record<string, Check> = {
  toolchain,
  selftest,
  files,
  lockfile,
  text,
  format,
  lint,
  dupes,
  pins,
  "gate-needs": gateNeeds,
  links,
  actionlint,
  workflows,
};

function report(name: string, r: Result): number {
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} ${name}: ${r.summary}`);
  return r.code;
}

function main(argv: string[]): number {
  const [name, ...rest] = argv;
  if (name === "needs") return report("needs", needs(rest[0]));
  if (name !== "all" && !CHECKS[name])
    return report(
      name ?? "",
      result(
        USAGE,
        `unknown check; use one of all, needs, ${Object.keys(CHECKS).join(", ")}`,
      ),
    );
  const at = rest.indexOf("--root");
  const root =
    at >= 0
      ? rest[at + 1]
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  if (!root) return report(name, result(USAGE, "--root needs a folder"));
  const list = tracked(normalize(root));
  if (!list)
    return report(
      name,
      result(CANNOT, `${root}: git ls-files failed or lists nothing`),
    );
  if (name !== "all") return report(name, CHECKS[name](root, list));
  for (const [step, check] of Object.entries(CHECKS)) {
    const code = report(step, check(root, list));
    if (code !== PASS) return report("all", result(code, `stopped at ${step}`));
  }
  return report(
    "all",
    result(PASS, `${Object.keys(CHECKS).length} checks passed`),
  );
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.log(
    `USAGE check-repo: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
  );
  process.exitCode = USAGE;
}
