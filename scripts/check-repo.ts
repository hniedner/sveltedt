// check-repo: the repository checks that need no product code, and `all`, the gate command that runs them.
//   node scripts/check-repo.ts <check> [--root <dir>]   one check, or `all` (what `pnpm gate` runs)
//   node scripts/check-repo.ts needs '<json>'           CI only: the `needs` context of the `gate` job
//   node scripts/check-repo.ts pre-commit | commit-msg <file> | pre-push <remote>   the git hooks (.githooks/), run by git
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// The files the steps classify and scan come from `git ls-files`; configuration, pins and canaries are read from disk.
import { createHash } from "node:crypto";
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, normalize, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { DefaultTreeAdapterTypes } from "parse5";
import {
  binaryOf,
  CANNOT,
  FINDING,
  PASS,
  pinnedVersion,
  USAGE,
} from "./pinned.ts";
import {
  canaries,
  childEnv,
  commitRange,
  errorCode,
  BROWSER_DIR,
  HERE,
  inCI,
  isBrowserSpec,
  isResult,
  NA,
  NO_CACHE,
  result,
  tail,
  testRun,
  vitest,
  vitestBin,
} from "./gate-step.ts";
import type { Check, Result } from "./gate-step.ts";
import { check as diffCoverage } from "./diff-coverage.ts";
import { check as mutation } from "./mutation.ts";
import { check as redCheck } from "./red-check.ts";
import { check as trace, judgeResults, readMarkers } from "./trace.ts";
import type { Ran } from "./trace.ts";

const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
  [NA]: "NOT APPLICABLE",
};
const LICENSE_SHA256 =
  "fad8ffc0a6640606321397fb81db18cccd038dad7ecb4bb0ad33b941e544cf86"; // the MIT text, "Copyright (c) 2026 R. Hannes Niedner"
const NOTICED = "vincjo/datatables"; // the adapted code that ships asks for its notice
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
  "docs/PRD.md",
  "scripts/actionlint.version",
  "scripts/zizmor.version",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  ".github/workflows/ci.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/scorecard.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
  "scripts/check-repo.test.ts",
  "scripts/check-repo-hooks.test.ts",
  "scripts/check-repo-lint.test.ts",
  "scripts/check-repo-site.test.ts",
  "scripts/check-repo-tools.test.ts",
  "scripts/scan-secrets.ts",
  "scripts/scan-secrets.test.ts",
  "scripts/setup.test.ts",
  "scripts/trace.test.ts",
  "scripts/gitleaks.toml",
  "scripts/gitleaks.version",
];
const TEST_FILES = /^scripts\/[^/]+\.test\.(?:mjs|ts)$/;
const CI_FILE = ".github/workflows/ci.yml";
const PINNED = /^["']?[\w.-]+\/[\w./-]+@[0-9a-f]{40}["']? # \S+/;

/** The fields of package.json that the steps read. */
interface PackageJson {
  packageManager?: string;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[] | boolean;
  bundleDependencies?: string[] | boolean;
  private?: boolean;
}

/** The tracked files, less those deleted from the working tree without `git rm` (nothing left to read). */
function tracked(root: string): Set<string> | null {
  const ls = (...flags: string[]) =>
    spawnSync("git", ["-C", root, "ls-files", "-z", ...flags], {
      encoding: "utf8",
      env: childEnv(),
    });
  const all = ls(),
    deleted = ls("--deleted");
  if (all.status !== 0 || deleted.status !== 0) return null;
  const gone = new Set(deleted.stdout.split("\0"));
  const files = all.stdout.split("\0").filter((f) => f && !gone.has(f));
  return files.length ? new Set(files) : null;
}

function files(root: string, list: Set<string>): Result {
  const details: string[] = [];
  for (const f of REQUIRED)
    if (!list.has(f) || !existsSync(join(root, f)))
      details.push(`missing: ${f}`);
  const read = (f: string) => readText(root, f);
  if (
    createHash("sha256").update(read("LICENSE")).digest("hex") !==
    LICENSE_SHA256
  )
    details.push("LICENSE: not the MIT text with the copyright line");
  if (!read("NOTICE").includes(NOTICED))
    details.push(`NOTICE: no notice of ${NOTICED}`);
  // Run output stays out of commits: /reports/ (the steps' reports, coverage included), /coverage/ (a hand run)
  for (const line of ["/tmp/", "/reports/", "/coverage/"])
    if (!read(".gitignore").split("\n").includes(line))
      details.push(`.gitignore: no line ${line}`);
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  return result(
    PASS,
    `${REQUIRED.length} required files present, LICENSE, NOTICE and .gitignore as required`,
  );
}

function pins(root: string, list: Set<string>): Result {
  const yaml = [...list].filter((f) => /^\.github\/.*\.ya?ml$/.test(f));
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

/**
 * GATE_BROWSER and GATE_MUTATION leave their step to the job of that name (`browser`, `mutation`), which gate must need
 * (gateNeeds) and which runs it; the problems, given the workflow's lines above `jobs:` and its jobs.
 */
function leftToJob(
  name: "browser" | "mutation",
  top: string[],
  jobs: Map<string, string[]>,
): string[] {
  const variable = `GATE_${name.toUpperCase()}`;
  const sets = (l: string[]) =>
    l.some((x) => new RegExp(`^\\s+${variable}\\s*:`).test(x));
  const job = jobs.get(name);
  const found = [];
  if (sets(top)) found.push(`${variable} is set for the whole workflow`);
  if (job && sets(job)) found.push(`${variable} is set in the job ${name}`);
  // The step's own command line, as `run:` or in a `run: |` block; nothing may let the job pass without it
  const runs = job?.some((l) =>
    new RegExp(
      `^\\s*(-\\s+)?(run:\\s+)?node scripts/check-repo\\.ts ${name}\\s*$`,
    ).test(l),
  );
  if ([...jobs.values()].some(sets) && !runs)
    found.push(`${variable} is set but no job named ${name} runs the step`);
  // Fails closed: an `if:` or a continue-on-error anywhere in the job. A later step that needs its own `if:` (an upload
  // on failure) narrows this rule in its own branch, with its rows
  if (job?.some((l) => /^\s+(-\s+)?(continue-on-error|if)\s*:/.test(l)))
    found.push(
      `the job ${name} has continue-on-error or if: it may pass without the step`,
    );
  return found;
}

function gateNeeds(root: string, list: Set<string>): Result {
  if (!list.has(CI_FILE)) return result(CANNOT, `${CI_FILE} is not tracked`);
  const lines = readFileSync(join(root, CI_FILE), "utf8").split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return result(CANNOT, `${CI_FILE}: no top-level jobs: line`);
  const jobs = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#|$)/.test(line)) continue; // a comment or blank line ends nothing
    if (/^\S/.test(line)) break;
    const id = /^ {2}([\w-]+):\s*(#.*)?$/.exec(line);
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
  for (const name of ["browser", "mutation"] as const)
    details.push(...leftToJob(name, lines.slice(0, start), jobs));
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
        // Inline links, with or without a title, and reference definitions.
        const links = [
          ...line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),
          ...line.matchAll(/^ {0,3}\[[^\]]+\]:\s+(\S+)/g),
        ];
        for (const m of links) {
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
  const bin = binaryOf(name);
  const file = `scripts/${name}.version`;
  const wanted = pinnedVersion(join(root, file));
  if (!wanted) return result(CANNOT, `${file} holds no line \`version <x>\``);
  const v = versionOf(bin, flag);
  if (isResult(v)) return v;
  const got = v.line.replace(`${name} `, "");
  if (got !== wanted)
    return result(CANNOT, `${name} is ${got}, the pinned version is ${wanted}`);
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

async function runTestFile(
  root: string,
  file: string,
): Promise<{ code: number; line: string }> {
  if (!existsSync(join(root, file)))
    return { code: CANNOT, line: `${file}: missing` };
  // Run the file itself, not `node --test <file>`: the latter counts a file holding no test as one passing test.
  const r = await new Promise<{
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
  }>((resolve) => {
    const child = spawn(
      process.execPath,
      ["--test-reporter=tap", join(root, file)],
      { cwd: root, env: childEnv(), stdio: ["ignore", "pipe", "ignore"] },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.on("error", () => resolve({ status: null, signal: null, stdout }));
    child.on("close", (status, signal) => resolve({ status, signal, stdout }));
  });
  const count = (name: string): number =>
    Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(r.stdout)?.[1] ?? NaN);
  const [tests, pass, fail] = [count("tests"), count("pass"), count("fail")];
  // A file killed by a signal (out of memory on a busy runner) says so instead of "exit null"
  const end = r.signal ? `killed by ${r.signal}` : `exit ${r.status}`;
  if (!(tests > 0))
    return { code: CANNOT, line: `${file}: no test ran (${end})` };
  if (r.status !== 0 || fail > 0 || pass !== tests) {
    const failed = r.stdout
      .split("\n")
      .filter((l) => /^\s*not ok /.test(l))
      .map((l) => `  ${l.trim()}`);
    return {
      code: FINDING,
      line: [`${file}: ${fail} of ${tests} failed (${end})`, ...failed].join(
        "\n",
      ),
    };
  }
  return { code: PASS, line: `${file}: ${tests} passed` };
}

// Every tracked test file runs in its own process, each with its own count, as many at once as the machine has cores;
// a file with no test is could-not-check. The lines keep the order of the names, whichever file ends first.
async function selftest(root: string, list: Set<string>): Promise<Result> {
  const files = [...list].filter((f) => TEST_FILES.test(f)).sort();
  if (!files.length)
    return result(
      CANNOT,
      "no tracked test file scripts/*.test.mjs or scripts/*.test.ts",
    );
  const runs: { code: number; line: string }[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let i = next++; i < files.length; i = next++)
      runs[i] = await runTestFile(root, files[i]);
  };
  await Promise.all(Array.from({ length: availableParallelism() }, lane));
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
  // The secret scanner too: missing, selftest's scan tests would report it as failures, not as could-not-check.
  const scanner = pinnedBinary(root, "gitleaks", "version");
  if (isResult(scanner)) return scanner;
  const v = versionOf(binaryOf("pnpm"), "--version");
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
// One exact version (or several joined by ||) and its advisory: a bare name would exempt every later release.
const EXCEPTION =
  /^\s+- '?(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+(\s*\|\|\s*\d+\.\d+\.\d+)*'?\s+#\s*GHSA(-[23456789cfghjmpqrvwx]{4}){3}\b/;

/** The value of `key: <digits>` in YAML lines, or NaN. */
const yamlNumber = (lines: string[], key: string): number =>
  Number(
    lines
      .map((l) => new RegExp(`^\\s*${key}:\\s*(\\d+)\\s*$`).exec(l)?.[1])
      .find(Boolean) ?? NaN,
  );

const readText = (root: string, f: string): string =>
  existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "";

/** The lockfile is tracked, is one YAML document (G11) and resolves every package from the registry by hash. */
function lockfileProblems(root: string, list: Set<string>): string[] {
  if (!list.has("pnpm-lock.yaml")) return ["pnpm-lock.yaml is not tracked"];
  const text = readText(root, "pnpm-lock.yaml");
  const docs = text.split(/^---\s*$/m).filter((d) => d.trim());
  const sources = text
    .split("\n")
    .filter((l) => /^\s+resolution:/.test(l))
    .filter((l) => !/^\s+resolution: \{integrity: sha512-[\w+/=]+\}$/.test(l))
    .map((l) => `pnpm-lock.yaml: not a registry package by hash: ${l.trim()}`);
  return docs.length === 1
    ? sources
    : [`pnpm-lock.yaml holds ${docs.length} YAML documents, not 1`, ...sources];
}

/** Private, exact development dependencies; nothing ships but a svelte peer (PRD-S5). */
function packageProblems(pkg: PackageJson): string[] {
  // Until the packaging pull request removes it with its statement, a stray publish fails on the manifest.
  const open =
    pkg.private === true ? [] : ['package.json: not "private": true'];
  const ranges = Object.entries(pkg.devDependencies ?? {})
    .filter(([, v]) => !EXACT.test(v))
    .map(([n, v]) => `devDependencies: ${n} is "${v}", not an exact version`);
  const runtime = [
    ...Object.keys(pkg.dependencies ?? {}).map((n) => `dependencies: ${n}`),
    ...Object.keys(pkg.optionalDependencies ?? {}).map(
      (n) => `optionalDependencies: ${n}`,
    ),
    ...(["bundleDependencies", "bundledDependencies"] as const).flatMap((k) =>
      pkg[k] === true ? [`${k}: all`] : (pkg[k] || []).map((n) => `${k}: ${n}`),
    ),
  ].map((d) => `${d} would ship; only the svelte peer may`);
  const peers = Object.keys(pkg.peerDependencies ?? {})
    .filter((n) => n !== "svelte")
    .map((n) => `peerDependencies: ${n} would ship; only svelte may`);
  return [...open, ...ranges, ...runtime, ...peers];
}

/** pnpm's release age equals Dependabot's shortest npm cooldown; every exception names its advisory. */
function ageProblems(root: string): string[] {
  const workspace = readText(root, "pnpm-workspace.yaml").split("\n");
  const age = yamlNumber(workspace, "minimumReleaseAge");
  const bot = readText(root, ".github/dependabot.yml");
  const npm = /- package-ecosystem: npm\n([\s\S]*?)(?=\n {2}- |$)/.exec(bot);
  // So Dependabot never proposes a version pnpm would refuse to install.
  const cooldowns = [
    ...(npm?.[1] ?? "").matchAll(/^\s*[\w-]*days:\s*(\d+)\s*$/gm),
  ].map((m) => Number(m[1]));
  const days = Math.min(...cooldowns);
  const problems: string[] = [];
  if (!(age > 0)) problems.push("pnpm-workspace.yaml: no minimumReleaseAge");
  else if (!cooldowns.length)
    problems.push(".github/dependabot.yml: no npm cooldown");
  else if (age !== days * 1440)
    problems.push(
      `minimumReleaseAge ${age} min differs from Dependabot's shortest npm cooldown, ${days} days`,
    );
  const head = workspace.findIndex((l) => /^minimumReleaseAgeExclude:/.test(l));
  if (head < 0) return problems;
  if (!/^minimumReleaseAgeExclude:\s*$/.test(workspace[head]))
    problems.push("minimumReleaseAgeExclude: write one entry per line");
  // Its entries run to the next setting; comment and blank lines end nothing.
  const rest = workspace.slice(head + 1);
  const end = rest.findIndex((l) => /^\S/.test(l) && !l.startsWith("#"));
  for (const l of (end < 0 ? rest : rest.slice(0, end)).filter((l) =>
    /^\s+-/.test(l),
  ))
    if (!EXCEPTION.test(l))
      problems.push(
        `minimumReleaseAgeExclude: "${l.trim()}" is not "<name>@<version> # GHSA-..."`,
      );
  return problems;
}

/** Each workspace package named in pnpm-workspace.yaml depends only on workspace links, with exact development versions. */
function workspaceProblems(root: string): string[] {
  const text = readText(root, "pnpm-workspace.yaml");
  const lines = text.split("\n");
  const head = lines.findIndex((l) => /^packages:\s*$/.test(l));
  // Its entries run to the next setting; comment and blank lines end nothing.
  const rest = head < 0 ? [] : lines.slice(head + 1);
  const end = rest.findIndex((l) => /^\S/.test(l) && !l.startsWith("#"));
  const dirs = (end < 0 ? rest : rest.slice(0, end))
    .map((l) => /^\s+-\s+['"]?([^'"#\s]+)/.exec(l)?.[1])
    .filter((dir): dir is string => dir !== undefined);
  // Another YAML form of the list (flow style, an unindented sequence, a comment after the key) would check nothing
  if (!dirs.length && /^['"]?packages['"]?\s*:/m.test(text))
    return [
      "pnpm-workspace.yaml: packages are named in a form this step cannot read; write one indented `- <folder>` per line",
    ];
  return dirs.flatMap((dir) => {
    const file = `${dir}/package.json`;
    const pkg = readJson(root, file);
    if (!pkg) return [`${file} is missing or not JSON`];
    const links = (
      ["dependencies", "optionalDependencies", "peerDependencies"] as const
    ).flatMap((kind) =>
      Object.entries(pkg[kind] ?? {})
        .filter(([, v]) => v !== "workspace:*")
        .map(([n, v]) => `${kind}: ${n} is "${v}", not "workspace:*"`),
    );
    const ranges = Object.entries(pkg.devDependencies ?? {})
      .filter(([, v]) => !EXACT.test(v))
      .map(([n, v]) => `devDependencies: ${n} is "${v}", not an exact version`);
    return [...links, ...ranges].map((p) => `${file}: ${p}`);
  });
}

// Nothing ships but a svelte peer (PRD-S5); licences are the licences step's. Development dependencies are
// exact, in every workspace package too; the lockfile is one YAML document (G11); pnpm's release age equals Dependabot's shortest npm cooldown, and every
// exception to it names its advisory.
function lockfile(root: string, list: Set<string>): Result {
  const pkg = readJson(root, "package.json");
  if (!pkg) return result(CANNOT, "package.json is missing or not JSON");
  const details = [
    ...lockfileProblems(root, list),
    ...packageProblems(pkg),
    ...workspaceProblems(root),
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

const REVIEW_FILE = ".github/workflows/dependency-review.yml";

/** The packages of `record` (pnpm's `licenses list --json`) whose licence is not in `allowed`; "Unknown" never is. */
const licenceProblems = (
  record: Record<string, { name: string }[]>,
  allowed: Set<string>,
): string[] =>
  Object.entries(record)
    .filter(([licence]) => !allowed.has(licence))
    .flatMap(([licence, pkgs]) => pkgs.map((p) => `${p.name}: ${licence}`));

// Every installed package's licence is on the one allow list, dependency-review.yml's `allow-licenses`, which the
// pull-request check also reads; a licence pnpm cannot detect is a finding (docs/decisions/001, Licences).
function licences(root: string): Result {
  const line = /^\s*allow-licenses:\s*(.+)$/m.exec(readText(root, REVIEW_FILE));
  if (!line)
    return result(CANNOT, `${REVIEW_FILE} holds no allow-licenses line`);
  const allowed = new Set(line[1].split(",").map((l) => l.trim()));
  const planted = {
    Unknown: [{ name: "canary-a" }],
    "GPL-3.0-only": [{ name: "canary-b" }],
  };
  if (licenceProblems(planted, allowed).length !== 2)
    return result(
      CANNOT,
      "the allow list passed a planted unknown or GPL licence",
    );
  const r = spawnSync(
    binaryOf("pnpm"),
    ["licenses", "list", "--json", "--recursive"],
    {
      cwd: root,
      encoding: "utf8",
      env: childEnv(),
    },
  );
  let record: Record<string, { name: string }[]>;
  try {
    if (r.status !== 0) throw new Error();
    record = JSON.parse(r.stdout) as typeof record;
  } catch {
    return result(
      CANNOT,
      `pnpm licenses list exited ${r.status ?? errorCode(r.error)} without a record`,
    );
  }
  const details = licenceProblems(record, allowed);
  if (details.length)
    return result(
      FINDING,
      `${details.length} package(s) outside the allow list`,
      details,
    );
  // Not compared with the lockfile: packages for other platforms are locked but not installed.
  const count = Object.values(record).flat().length;
  if (!count) return result(CANNOT, "pnpm listed no installed package");
  return result(PASS, `${count} package(s), every licence on the allow list`);
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
    match: /^docs\/(engineering\/(method|gates)|PRD)\.md$/,
    steps: ["text"],
    why: "owner-approved text: changes only through its change log, never by a formatter",
  },
  {
    match: /^spec\/.*\.md$/,
    steps: ["text"],
    why: "sentences hashed from the raw source: a formatter or a Prettier upgrade would turn every test stale",
  },
  {
    match: /^site\/public\/vendor\//,
    steps: ["text"],
    why: "third-party files kept byte for byte, held to their published hash by a test: a formatter would change the bytes",
  },
  {
    match: /\.test\.mjs$/,
    steps: ["format", "lint"],
    why: "dupes: a test may repeat its setup so it reads on its own (method section 5)",
  },
  { match: /\.mjs$/, steps: ["format", "lint", "dupes"] },
  {
    match: /^consumer\/pnpm-lock\.yaml$/,
    steps: [],
    why: "written by pnpm; the consumer step installs from it",
  },
  {
    // The consumer project's own files (spec/package.md, CON). Its sources import the packed package, which the root
    // does not install: their types and their type-aware lint are the consumer step's, CON-09, not the root's.
    match: /^consumer\/.*\.(?:ts|svelte)$/,
    steps: ["format"],
    why: "lint, types: CON-09, in the consumer's own install; dupes: its files are its own, not shared code",
  },
  {
    match: /^consumer\/vite\.config\.js$/,
    steps: ["format", "lint"],
    why: "dupes: configuration, no logic to copy",
  },
  {
    // The test site's plain scripts, served as they are from Vite's public folder (a page's first, classic script
    // cannot be a module the build compiles)
    match: /^site\/public\/[^/]+\.js$/,
    steps: ["format", "lint", "dupes"],
  },
  {
    // The project is TypeScript: the Svelte config and the site's public scripts are its .js files; another .js file
    // has no class and blocks until one is decided.
    match: /^svelte\.config\.js$/,
    steps: ["format", "lint"],
    why: "dupes: configuration that Svelte's tools read, no logic to copy",
  },
  // TypeScript has one checker by path: tsc through scripts/tsconfig.json for scripts/ (types); svelte-check through
  // the root tsconfig.json for the rest (svelte), which may import a component that tsc sees only as an ambient module.
  // A declaration file (a .ts file whose name contains ".d.", as TypeScript reads it) is in neither: under skipLibCheck no checker
  // would check it, so it has no class.
  {
    match: /^scripts\/(?!.*\.d\.[^/]*$).*\.test\.ts$/,
    steps: ["format", "lint", "types"],
    why: "dupes: a test may repeat its setup so it reads on its own (method section 5)",
  },
  {
    match: /^scripts\/(?!.*\.d\.[^/]*$).*\.ts$/,
    steps: ["format", "lint", "types", "dupes"],
  },
  {
    match: /^(?!.*\.d\.[^/]*$).*\.test\.ts$/,
    steps: ["format", "lint", "svelte"],
    why: "dupes: as for scripts; types: svelte-check's, since it may import a component",
  },
  {
    match: /^(?!.*\.d\.[^/]*$).*\.ts$/,
    steps: ["format", "lint", "svelte", "dupes"],
    why: "types: svelte-check's, since it may import a component",
  },
  {
    match: /\.svelte$/,
    steps: ["format", "lint", "svelte"],
    why: "dupes: jscpd 5 counts a component as several sources and lists none, so no file can be proven analysed (#7)",
  },
  { match: /\.(md|ya?ml|json|html|css)$/, steps: ["format"] },
  {
    match:
      /^(LICENSE|NOTICE|\.editorconfig|\.gitignore|\.node-version|\.github\/CODEOWNERS|\.githooks\/[\w-]+|scripts\/(setup|[\w-]+\.version))$/,
    steps: ["text"],
  },
  {
    match: /\.toml$/,
    steps: ["text"],
    why: "format: Prettier has no TOML parser",
  },
];

/**
 * The files `step` checks, or could-not-check when a tracked file has no class or the class holds no file; with
 * `mayBeNone` a class holding no file is an empty list (pre-commit: the staged files may hold none of that kind).
 */
function ofClass(
  list: Set<string>,
  step: string,
  mayBeNone = false,
): Result | string[] {
  const mine: string[] = [],
    unknown: string[] = [];
  for (const f of list) {
    const c = CLASSES.find((k) => k.match.test(f));
    if (!c) unknown.push(f);
    else if (c.steps.includes(step)) mine.push(f);
  }
  if (unknown.length)
    return result(
      CANNOT,
      `${unknown.length} tracked file(s) of no class`,
      unknown,
    );
  if (!mine.length && !mayBeNone) return result(CANNOT, "no file to check");
  return mine;
}

// The opening and closing markers only: a line of seven "=" is also a Markdown heading underline.
const CONFLICT = /^(<{7}|>{7})( |$)/;
// Comments that switch a check off; refused in code (the files ESLint lints). Built from parts, or this file would
// hold them. The parts are regular-expression source.
const SUPPRESSION = new RegExp(
  [
    ["svelte-", "ignore"],
    ["@ts-", "expect-error"],
    ["@ts-", "nocheck"],
    ["jscpd:", "ignore"],
    ["prettier-", "ignore"],
    // the coverage hints Vitest's V8 provider reads (ast-v8-to-istanbul), which take a line out of diff-coverage's
    // count (G4)
    ["(?:istanbul|[cv]8|node:coverage)\\s+", "ignore"],
  ]
    .map((parts) => parts.join(""))
    .join("|"),
);

// For files no formatter rewrites: LF line endings, a final newline, no trailing whitespace. For every file in `list`
// (tracked in the gate, staged in the pre-commit hook, which passes `mayBeNone`): no conflict marker (Prettier keeps
// one in Markdown as text). In code: no suppression comment.
function text(root: string, list: Set<string>, mayBeNone = false): Result {
  const mine = ofClass(list, "text", mayBeNone);
  if (isResult(mine)) return mine;
  const details: string[] = [];
  for (const f of list) {
    const t = readFileSync(join(root, f), "utf8");
    const plain = mine.includes(f);
    const code = CLASSES.find((k) => k.match.test(f))?.steps.includes("lint");
    if (plain && t && !t.endsWith("\n")) details.push(`${f}: no final newline`);
    t.split("\n").forEach((line, i) => {
      if (plain && line.endsWith("\r"))
        details.push(`${f}:${i + 1}: CRLF line ending`);
      else if (plain && /[ \t]$/.test(line))
        details.push(`${f}:${i + 1}: trailing whitespace`);
      if (CONFLICT.test(line))
        details.push(`${f}:${i + 1}: merge-conflict marker`);
      const word = code && SUPPRESSION.exec(line)?.[0];
      if (word) details.push(`${f}:${i + 1}: suppression comment ${word}`);
    });
  }
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  return result(
    PASS,
    `${mine.length} file(s): LF, final newline, no trailing whitespace; no conflict marker in ${list.size} ${mayBeNone ? "staged" : "tracked"} file(s), no suppression comment in code`,
  );
}

// Asks Prettier itself, file by file, whether it ignores the file, which parser it infers and whether the file is
// formatted, with the options its CLI would use. Prints one JSON record. The config is fixed to the root package.json's
// "prettier" key, so a nested Prettier config can neither change the rules nor run code.
const PRETTIER_PROBE = `
import { readFileSync } from "node:fs";
const [url, config, root, ...files] = process.argv.slice(1);
const p = await import(url);
const out = { version: p.version, files: [] };
for (const f of files) {
  const path = root + "/" + f;
  const info = await p.getFileInfo(path, { ignorePath: [] });
  const rec = { f, ignored: info.ignored, parser: info.inferredParser };
  if (rec.parser && !rec.ignored) {
    const options = { ...(await p.resolveConfig(path, { editorconfig: true, config })), filepath: path };
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
const lintable = files.filter((f) => !f.startsWith("?"));
const results = await eslint.lintFiles(lintable);
const configs = {};
for (const f of [...lintable, ...files.filter((f) => f.startsWith("?")).map((f) => f.slice(1))]) {
  const c = await eslint.calculateConfigForFile(f);
  const id = (p) => (p == null ? null : typeof p === "string" ? p : p.meta ? p.meta.name + "@" + p.meta.version : "unnamed");
  configs[f] = c ? { rules: c.rules, settings: c.settings, linterOptions: c.linterOptions, processor: id(c.processor), parser: id(c.languageOptions?.parser) } : null;
}
console.log(JSON.stringify({ version: ESLint.version, configs, files: results.map((r) => ({
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
  configs: Record<
    string,
    {
      rules: Record<string, unknown>;
      settings: object;
      linterOptions: object;
      processor: string | null;
      parser: string | null;
    } | null
  >;
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
  const mine = ofClass(list, step);
  if (isResult(mine)) return mine;
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
    toolRecord<PrettierRecord>("prettier", PRETTIER_PROBE, r, f, [
      join(root, "package.json"),
    ]);
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
// "<rule>|<text>": that rule with a message holding the text, for the no-restricted-syntax bans, which share
// one rule.
const JS_RULES = [
  "complexity",
  "no-eval",
  "no-implied-eval",
  "no-new-func",
  "no-undef",
  "no-restricted-syntax|assigning innerHTML",
];
const LINT_CANARY_RULES: Record<string, string[]> = {
  ".svelte.ts": [
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/ban-ts-comment",
    "no-restricted-syntax|assigning innerHTML",
  ],
  ".mjs": JS_RULES,
  ".js": JS_RULES,
  ".ts": [
    "complexity",
    "no-eval",
    "@typescript-eslint/no-implied-eval",
    "no-new-func",
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-floating-promises",
    "vitest/expect-expect",
    "vitest/no-focused-tests",
    "vitest/no-disabled-tests",
    "vitest/valid-expect",
    "compat/compat",
    "@typescript-eslint/ban-ts-comment",
    "no-restricted-syntax|setAttribute style",
    "no-restricted-syntax|createElement of style",
    "no-restricted-syntax|assigning innerHTML",
    "no-restricted-syntax|in an object literal",
    "no-restricted-syntax|insertAdjacentHTML",
    "no-restricted-syntax|setAttribute srcdoc",
    "no-restricted-syntax|parseHTMLUnsafe or createContextualFragment",
    "no-restricted-syntax|DOMParser",
    "no-restricted-syntax|document.write",
    "no-restricted-syntax|setHTML or createRawSnippet",
    "no-restricted-syntax|constructed or inserted style sheet",
    "no-restricted-syntax|a rule inserted into",
    "no-restricted-syntax|createElementNS of",
    "no-restricted-syntax|execCommand insertHTML",
    "no-restricted-syntax|Document.parseHTML",
    "no-restricted-syntax|a sink name in brackets",
  ],
  ".svelte": [
    "@typescript-eslint/no-explicit-any",
    "svelte/no-at-html-tags",
    "@typescript-eslint/ban-ts-comment",
    "compat/compat",
    "no-restricted-syntax|class: directive",
    "no-restricted-syntax|use: action",
    "no-restricted-syntax|bind: other than bind:this",
    "no-restricted-syntax|style: directive",
    "no-restricted-syntax|spread attribute",
    "no-restricted-syntax|{@attach}",
    "no-restricted-syntax|style attribute",
    "no-restricted-syntax|{style} shorthand",
    "no-restricted-syntax|svelte:head",
    "no-restricted-syntax|setAttribute style",
    "no-restricted-syntax|assigning innerHTML",
    "no-restricted-syntax|<style> block",
    "no-restricted-syntax|style, link or script element",
    "no-restricted-syntax|svelte:element as style",
    "no-restricted-syntax|svelte:element this={...} as style",
    "no-restricted-syntax|srcdoc attribute",
    "no-restricted-syntax|innerHTML or outerHTML attribute",
  ],
};

/** The canary extension of a file: the longest key of LINT_CANARY_RULES it ends with (.svelte.ts before .ts). */
const extOf = (f: string): string | undefined =>
  Object.keys(LINT_CANARY_RULES)
    .filter((e) => f.endsWith(e))
    .sort((a, b) => b.length - a.length)[0];

/** The planted rules a canary record did not raise, per extension, or "no canary for <ext>". */
function lintCanaryMisses(canary: EslintRecord): string[] {
  return Object.entries(LINT_CANARY_RULES).flatMap(([ext, rules]) => {
    const files = canary.files.filter((c) => extOf(c.f) === ext);
    if (!files.length) return [`no canary for ${ext}`];
    const messages = files.flatMap((c) => c.messages);
    return rules
      .filter((entry) => {
        const [rule, text = ""] = entry.split("|");
        return !messages.some((m) => m.rule === rule && m.text.includes(text));
      })
      .map((entry) => `${ext}: ${entry}`);
  });
}

// ESLint on every file of the lint class with this repository's config and no ignore patterns. The planted canary
// must raise each rule of LINT_CANARY_RULES first; any message, warning or error, is a finding (no warning budget).
// The canaries prove their rules where they sit. A later config block scoped to the component's folders replaces a
// rule there (measured: a second no-restricted-syntax block replaces the whole list) while every canary still passes,
// so each proven rule, settings, linterOptions, processor and parser must match the canary of its extension for every
// linted file and a path in src/lib and site/src. A block for a whole extension changes its canary too, so each must
// also hold every script ban the SCRIPT_BANS canary proves one by one (the other canaries plant only some).
const SCRIPT_BANS = ".ts";
const CONFIG_PROBES = Object.keys(LINT_CANARY_RULES).flatMap((ext) =>
  ["src/lib", "site/src"].map((dir) => `${dir}/probe${ext}`),
);
// The one named exception: the site's test files may use DOMParser to read the site's own build (reviewer's ruling,
// 2026-11-18); for them the canaries' proof expects every other ban, and only that one may be missing.
const SITE_TESTS = /^site\/.+\.test\.ts$/;
const LIFTED = "DOMParser (PRD-S2)";
function configDrift(canary: EslintRecord, rec: EslintRecord): string[] {
  const severity = (c: { rules: Record<string, unknown> }) =>
    (c.rules["no-restricted-syntax"] as unknown[] | undefined)?.[0];
  const bans = (c: { rules: Record<string, unknown> }, lifted = false) =>
    ((c.rules["no-restricted-syntax"] as unknown[] | undefined) ?? [])
      .slice(1)
      .filter((e) => !lifted || (e as { message?: string }).message !== LIFTED)
      .map((e) => JSON.stringify(e));
  // The SCRIPT_BANS canary raised each of its bans first (lintCanaryMisses), so it has a config.
  const proven = Object.entries(canary.configs).find(
    ([f]) => extOf(f) === SCRIPT_BANS,
  )?.[1] as { rules: Record<string, unknown> };
  return Object.keys(rec.configs).flatMap((probe) => {
    const ext = extOf(probe) ?? "";
    const planted = Object.keys(canary.configs).find((f) => extOf(f) === ext);
    const want = planted ? canary.configs[planted] : null;
    const got = rec.configs[probe];
    if (!want || !got) return [`${probe}: no config`];
    const lifted = SITE_TESTS.test(probe);
    const rules = [
      ...new Set((LINT_CANARY_RULES[ext] ?? []).map((e) => e.split("|")[0])),
    ].filter((r) => !lifted || r !== "no-restricted-syntax");
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    return [
      ...rules.filter((r) => !same(got.rules[r], want.rules[r])),
      ...(same(got.settings, want.settings) ? [] : ["settings"]),
      ...(same(got.linterOptions, want.linterOptions) ? [] : ["linterOptions"]),
      ...(["processor", "parser"] as const).filter((k) => got[k] !== want[k]),
      ...(lifted && severity(got) !== severity(want)
        ? ["no-restricted-syntax severity"]
        : []),
      ...(bans(proven, lifted).every((b) => bans(got).includes(b))
        ? []
        : [
            `no-restricted-syntax without each ban of the ${SCRIPT_BANS} canary`,
          ]),
    ].map((r) => `${probe}: ${r}`);
  });
}

function lint(root: string, list: Set<string>): Result {
  const inputs = toolInputs(list, "lint");
  if (isResult(inputs)) return inputs;
  const { mine, dir, planted } = inputs;
  const config = [
    process.env.ESLINT_CONFIG || join(HERE, "..", "eslint.config.mjs"),
  ];
  const eslintRecord = (r: string, f: string[]) =>
    toolRecord<EslintRecord>("eslint", ESLINT_PROBE, r, f, config);
  const canary = eslintRecord(dir, planted);
  if ("error" in canary) return result(CANNOT, canary.error);
  const missed = lintCanaryMisses(canary);
  if (missed.length)
    return result(CANNOT, "ESLint missed planted canaries", missed);
  const pin = readJson(root, "package.json")?.devDependencies?.eslint;
  const rec = eslintRecord(root, [
    ...mine,
    ...CONFIG_PROBES.map((p) => `?${p}`),
  ]);
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
  const drift = configDrift(canary, rec);
  if (drift.length)
    return result(
      CANNOT,
      "the config sets a rule the canaries prove otherwise for a linted file or the component's folders",
      drift,
    );
  const details = rec.files.flatMap((r) =>
    r.messages.map((m) => `${r.f}:${m.text}`),
  );
  if (details.length)
    return result(
      FINDING,
      `${details.length} message(s) in ${mine.length} file(s)`,
      details,
    );
  // Per extension, so a kind with no real file shows 0 instead of hiding behind its canary.
  const counts = Object.keys(LINT_CANARY_RULES).map(
    (ext) => `${ext} ${mine.filter((f) => extOf(f) === ext).length}`,
  );
  return result(
    PASS,
    `ESLint ${rec.version} raised every planted rule (${Object.keys(LINT_CANARY_RULES).join(", ")}) and accepted ${mine.length} file(s): ${counts.join(", ")}`,
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
  summary: { files: { path: string; tokens: number; lines: number }[] };
}

/** The smallest clone jscpd reports, in tokens: its --min-tokens, and the size a file needs to hold a clone. */
const MIN_TOKENS = 50;
/** ... and in lines: its --min-lines, and the length a file needs to hold a clone. */
const MIN_LINES = 5;

const jscpdBin = (): string =>
  process.env.JSCPD_BIN || join(HERE, "..", "node_modules", ".bin", "jscpd");

/** jscpd's JSON report for `files` under `root`, from the installed jscpd (or JSCPD_BIN), or an error. Its summary is
 * asked to name every file analysed with its tokens and lines; `measure` lowers both minima to 1, so files too small
 * for a clone are counted too. */
function jscpdReport(
  root: string,
  files: string[],
  measure = false,
): JscpdReport | ToolError {
  const bin = jscpdBin();
  const out = mkdtempSync(join(tmpdir(), "jscpd-"));
  try {
    // jscpd's defaults written out, so an upgrade cannot change them silently (measuring lowers both minima to 1);
    // --summary with a top of every file given lists each file analysed.
    const args = [
      "--no-gitignore",
      "--absolute",
      "--min-tokens",
      measure ? "1" : String(MIN_TOKENS),
      "--min-lines",
      measure ? "1" : String(MIN_LINES),
      "--max-size",
      "1mb",
      "--summary",
      "--summary-top",
      String(files.length),
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
    for (const f of report.summary.files) f.path = given(f.path);
    return report;
  } catch (e) {
    return { error: `no jscpd report: ${(e as Error).message.split("\n")[0]}` };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const jscpdVersion = () =>
  spawnSync(jscpdBin(), ["--version"], {
    encoding: "utf8",
  })
    .stdout?.trim()
    .replace(/^jscpd /, "");

const at = (side: CloneSide): string =>
  `${side.name}:${side.start}-${side.end}`;

/** The extensions of the dupes class; each needs a planted clone pair. */
const DUPES_EXTENSIONS = [".mjs", ".ts"];

// Copy detection over every file of the dupes class (method section 5): any clone is a finding, so a repository that
// starts at zero stays at zero. The canary pair must be reported as one clone first. jscpd leaves out, without a word,
// a file under its minimum clone (MIN_TOKENS tokens or, measured with jscpd 5.4.3, MIN_LINES lines) or over its size
// limit (1mb). Its summary names the files it analysed; each file left out is measured again by jscpd: under
// MIN_TOKENS or MIN_LINES it cannot hold a clone and is set aside by name, anything else cannot be checked. A file
// with no token at all is left out of both runs: it must be blank.
function dupes(root: string, list: Set<string>): Result {
  const inputs = toolInputs(list, "dupes");
  if (isResult(inputs)) return inputs;
  const { mine, dir, planted } = inputs;
  const pin = readJson(root, "package.json")?.devDependencies?.jscpd;
  const version = jscpdVersion();
  if (version !== pin)
    return result(
      CANNOT,
      version
        ? `jscpd ${version} is installed, package.json pins ${pin}`
        : "jscpd is not installed (run pnpm install)",
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
  // A file the summary does not name, left out or cut from a capped list alike, is measured by a second run. Under
  // MIN_TOKENS or MIN_LINES it cannot hold a clone; an analysed file can, so a capped list blocks here.
  const analysed = new Set(report.summary.files.map((f) => f.path));
  const left = mine.filter((f) => !analysed.has(f));
  const small = left.length ? jscpdReport(root, left, true) : null;
  if (small && "error" in small) return result(CANNOT, small.error);
  const sizes = new Map(small?.summary.files.map((f) => [f.path, f]));
  const blank = (f: string) => !readFileSync(join(root, f), "utf8").trim();
  const fits = (f: string): boolean => {
    const s = sizes.get(f);
    return s ? s.tokens >= MIN_TOKENS && s.lines >= MIN_LINES : !blank(f);
  };
  const size = (f: string): string => {
    const s = sizes.get(f);
    if (s) return `${f}: ${s.tokens} tokens in ${s.lines} line(s)`;
    return `${f}: ${blank(f) ? "blank" : "not counted"}`;
  };
  const blocked = left.filter(fits);
  if (blocked.length)
    return result(
      CANNOT,
      `jscpd left out ${blocked.length} file(s) that could hold a clone of ${MIN_TOKENS} tokens and ${MIN_LINES} lines`,
      blocked.map(size),
    );
  const aside = left.map(size);
  const details = report.duplicates.map(
    (d) => `${at(d.firstFile)} repeats ${at(d.secondFile)}`,
  );
  if (details.length)
    return result(FINDING, `${details.length} clone(s)`, details);
  const asideNote = aside.length
    ? `; set aside ${aside.length} file(s) under ${MIN_TOKENS} tokens or ${MIN_LINES} lines`
    : "";
  return result(
    PASS,
    `jscpd ${version} found the canary clone and no clone in ${sources} of ${mine.length} file(s)${asideNote}`,
    aside,
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
    const c = spawnSync(bin, ["--offline", join(dir, "canary.yml")], {
      encoding: "utf8",
    });
    if (!finding(c.status))
      return result(
        CANNOT,
        `zizmor did not report the planted workflow (exit ${c.status})`,
        `${c.stdout}${c.stderr}`.trim().split("\n").filter(Boolean),
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
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
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

const tscBin = (): string => join(HERE, "..", "node_modules", ".bin", "tsc");

/** `tsc -p <dir>/tsconfig.json` with `flags`. */
const tsc = (dir: string, ...flags: string[]) =>
  spawnSync(tscBin(), ["-p", join(dir, "tsconfig.json"), ...flags], {
    encoding: "utf8",
  });

/** The files `tsc -p <dir>/tsconfig.json` puts in its program, or a could-not-check result. */
function tscProgram(dir: string): Result | string[] {
  const r = tsc(dir, "--listFilesOnly");
  if (r.error || r.status !== 0)
    return result(
      CANNOT,
      `tsc could not read ${dir}/tsconfig.json`,
      r.stdout.trim().split("\n").slice(0, 5),
    );
  return r.stdout.split("\n").filter(Boolean);
}

/** `tsc -p <dir>/tsconfig.json`'s exit code and its error lines. */
function tscRun(dir: string): { status: number | null; lines: string[] } {
  const r = tsc(dir, "--pretty", "false");
  return {
    status: r.status,
    lines: r.stdout.trim().split("\n").filter(Boolean),
  };
}

// The pinned TypeScript, strict, over the program scripts/tsconfig.json declares (PRD-G3). Every file of the types
// class must be in tsc's own list of the program, so a script outside `include` cannot go unchecked. A planted type
// error must fail first.
function types(root: string, list: Set<string>): Result {
  const mine = ofClass(list, "types");
  if (isResult(mine)) return mine;
  const pin = readJson(root, "package.json")?.devDependencies?.typescript;
  const v = versionOf(tscBin(), "--version");
  if (isResult(v)) return v;
  const got = v.line.replace("Version ", "");
  if (got !== pin)
    return result(
      CANNOT,
      `TypeScript ${got} is installed, package.json pins ${pin}`,
    );
  // The planted error itself must be reported: any other failure (a broken config) proves nothing.
  const canary = tscRun(canaries("types"));
  // TS2322 (a wrong type) and TS7006 (an implicit any, an error only when strict) must both be reported.
  const reported = (code: string) =>
    canary.lines.some((l) =>
      new RegExp(`canary\\.ts\\(\\d+,\\d+\\): error ${code}:`).test(l),
    );
  if (!reported("TS2322") || !reported("TS7006"))
    return result(
      CANNOT,
      "tsc did not report the planted type errors (TS2322 and the strict-only TS7006 in canary.ts)",
      canary.lines.slice(0, 5),
    );
  const scripts = join(root, "scripts");
  const program = tscProgram(scripts);
  if (isResult(program)) return program;
  const outside = mine.filter((f) => !program.some((p) => p.endsWith(`/${f}`)));
  if (outside.length)
    return result(
      CANNOT,
      "tsc's program leaves out tracked TypeScript",
      outside,
    );
  const run = tscRun(scripts);
  if (run.status === 0)
    return result(
      PASS,
      `TypeScript ${got} failed the canary and accepted ${mine.length} file(s)`,
    );
  if (run.lines.some((l) => /error TS\d+/.test(l)))
    return result(FINDING, `${run.lines.length} type error line(s)`, run.lines);
  return result(CANNOT, `tsc exited ${run.status}`, run.lines);
}

// The test seam SVELTE_CHECK_BIN, like the <NAME>_BIN seams of binaryOf; unset, the installed svelte-check.
const svelteCheckBin = (): string =>
  process.env.SVELTE_CHECK_BIN ||
  join(HERE, "..", "node_modules", ".bin", "svelte-check");

interface SvelteDiagnostic {
  type: string;
  filename: string;
  start: { line: number };
  code: number | string;
  message: string;
}
const isDiagnostic = (d: unknown): d is SvelteDiagnostic =>
  typeof d === "object" &&
  d !== null &&
  typeof (d as SvelteDiagnostic).type === "string" &&
  typeof (d as SvelteDiagnostic).filename === "string" &&
  typeof (d as SvelteDiagnostic).start?.line === "number";
const asDiagnostic = (line: string): SvelteDiagnostic | null => {
  try {
    const d: unknown = JSON.parse(line);
    return isDiagnostic(d) ? d : null;
  } catch {
    return null;
  }
};

/** svelte-check's diagnostics over `tsconfig`, from its machine-verbose lines (one JSON object each), and the lines
 * that should be one and are not. */
// --config names the one Svelte config: svelte-check otherwise imports, and so runs, every svelte.config.* and
// vite.config.* below the tsconfig's folder, gitignored ones included, and, with no root config, those above it.
function svelteCheck(cwd: string, tsconfig: string, config: string) {
  const r = spawnSync(
    svelteCheckBin(),
    [
      "--tsconfig",
      tsconfig,
      "--config",
      config,
      "--fail-on-warnings",
      "--output",
      "machine-verbose",
    ],
    { cwd, encoding: "utf8", env: childEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = (r.stdout ?? "")
    .split("\n")
    .map((l) => l.replace(/^\d+ /, ""))
    .filter((l) => l.startsWith("{"));
  const found = lines.map(asDiagnostic).filter((d) => d !== null);
  const broken = r.error
    ? [`svelte-check could not run: ${errorCode(r.error)}`]
    : lines.filter((l) => !asDiagnostic(l));
  return { status: r.status, found, broken, out: `${r.stdout}${r.stderr}` };
}

// The files tsconfig.json puts in the program, components included, as TypeScript itself reads the config (and as
// svelte-check reads it): extends, comments, "./" and directory excludes follow TypeScript's rules, not ours.
function projectFiles(root: string): Result | Set<string> {
  let ts: typeof import("typescript");
  try {
    ts = createRequire(join(HERE, "..", "package.json"))(
      "typescript",
    ) as typeof import("typescript");
  } catch {
    return result(CANNOT, "typescript is not installed (run pnpm install)");
  }
  const file = join(root, "tsconfig.json");
  const read = ts.readConfigFile(file, (p) => ts.sys.readFile(p));
  const parsed = ts.parseJsonConfigFileContent(
    read.config ?? {},
    ts.sys,
    root,
    undefined,
    file,
    undefined,
    [
      {
        extension: ".svelte",
        isMixedContent: true,
        scriptKind: ts.ScriptKind.Deferred,
      },
    ],
  );
  // TS18003, no input at all, is an empty program: every file of the step is then outside it, and named.
  const errors = [read.error, ...parsed.errors].flatMap((e) =>
    e && e.code !== 18003
      ? [ts.flattenDiagnosticMessageText(e.messageText, " ")]
      : [],
  );
  if (errors.length)
    return result(CANNOT, "TypeScript cannot read tsconfig.json", errors);
  return new Set(parsed.fileNames.map((f) => relative(root, f)));
}

/** Why the component at `path` would not be type-checked, or null: Svelte's compiler must parse it, and it must have
 * at least one script, every script carrying lang="ts". A parse error is reported here with Svelte's message and line:
 * svelte-check drops one that says "expected" when there is no preprocess and the component has any lang attribute
 * (measured with svelte-check 4.7.8). Any other error (a read error, or a parse failure that is not a Svelte
 * CompileError) is thrown: check-repo stops with USAGE. */
function scriptProblem(path: string): string | null {
  const { parse } = createRequire(join(HERE, "..", "package.json"))(
    "svelte/compiler",
  ) as typeof import("svelte/compiler");
  const source = readFileSync(path, "utf8");
  let ast: import("svelte/compiler").AST.Root;
  try {
    ast = parse(source, { modern: true });
  } catch (e) {
    const compile = e as {
      code?: unknown;
      message: string;
      start?: { line: number };
    };
    if (typeof compile.code !== "string") throw e;
    return `Svelte cannot parse it at line ${compile.start?.line ?? "?"}: ${compile.message.split("\n")[0]}`;
  }
  const scripts = [ast.instance, ast.module].filter(
    (s) => s !== null && s !== undefined,
  );
  const typed =
    scripts.length > 0 &&
    scripts.every((s) =>
      s.attributes.some(
        (a) =>
          a.name === "lang" &&
          Array.isArray(a.value) &&
          a.value[0]?.type === "Text" &&
          a.value[0].data === "ts",
      ),
    );
  return typed ? null : 'a script that is not lang="ts", or none';
}

/** The result that stops svelte-check over `mine`, or null. COULD NOT CHECK: the root tsconfig.json cannot be read, a
 * file of `mine` is outside its program, a script of tsc's (`theirs`) is in it, or no component is among `mine`.
 * FINDING: a component Svelte cannot parse, or one with no script or a script not lang="ts". */
function svelteInputs(
  root: string,
  mine: string[],
  theirs: string[],
): Result | null {
  const program = projectFiles(root);
  if (isResult(program)) return program;
  const outside = mine.filter((f) => !program.has(f));
  if (outside.length)
    return result(
      CANNOT,
      "tsconfig.json leaves out tracked components or TypeScript",
      outside,
    );
  const both = theirs.filter((f) => program.has(f));
  if (both.length)
    return result(
      CANNOT,
      "tsconfig.json also holds scripts that types checks with tsc",
      both,
    );
  // svelte-check refuses a program with no component (its error 100001, NO_SVELTE_INPUT, measured with svelte-check
  // 4.7.8), so TypeScript waits for one.
  if (!mine.some((f) => f.endsWith(".svelte")))
    return result(
      CANNOT,
      "svelte-check checks TypeScript only beside a component, and no component is tracked",
      mine,
    );
  // svelte-check type-checks neither the markup of a component without a script nor a script without lang="ts"
  // (measured with svelte-check 4.7.8):
  // each component needs a script, and each of its scripts TypeScript. Svelte's own parser reads them.
  const untyped = mine.flatMap((f) => {
    const problem = f.endsWith(".svelte") ? scriptProblem(join(root, f)) : null;
    return problem ? [`${f}: ${problem}`] : [];
  });
  if (untyped.length)
    return result(
      FINDING,
      `${untyped.length} component(s) that svelte-check would not type-check`,
      untyped,
    );
  return null;
}

// svelte-check, strict, over every tracked component and the TypeScript outside scripts/ (PRD-G3); `types` keeps tsc
// for scripts/. svelte-check lists no checked file and silently skips one tsconfig.json leaves out, so each file must
// be in the program, and no file of `types` may be (two checkers, two answers). With none tracked the step is not
// applicable, after the planted errors were found.
function svelte(root: string, list: Set<string>): Result {
  const pin = readJson(root, "package.json")?.devDependencies?.["svelte-check"];
  const v = versionOf(svelteCheckBin(), "--version");
  if (isResult(v)) return v;
  const got = v.line.replace("svelte-check, ", "");
  if (got !== pin)
    return result(
      CANNOT,
      `svelte-check ${got} is installed, package.json pins ${pin}`,
    );
  const config = join(root, "svelte.config.js");
  if (!list.has("svelte.config.js") || !existsSync(config))
    return result(
      CANNOT,
      "svelte.config.js is not tracked: without it svelte-check imports any Svelte or Vite config it finds",
    );
  const dir = canaries("svelte");
  const canary = svelteCheck(dir, join(dir, "tsconfig.json"), config);
  if (canary.broken.length)
    return result(
      CANNOT,
      "svelte-check printed lines that are not its diagnostics",
      canary.broken.slice(0, 5),
    );
  const planted = (code: number, file = "canary.svelte") =>
    canary.found.some(
      (d) => d.type === "ERROR" && d.code === code && d.filename.endsWith(file),
    );
  if (!planted(2322) || !planted(7006) || !planted(2322, "canary.ts"))
    return result(
      CANNOT,
      "svelte-check did not report the planted type errors (TS2322 and the strict-only TS7006 in canary.svelte, TS2322 in canary.ts)",
      canary.out.trim().split("\n").slice(0, 5),
    );
  const checkedBy = (step: string) =>
    [...list].filter((f) =>
      CLASSES.find((k) => k.match.test(f))?.steps.includes(step),
    );
  const mine = checkedBy("svelte");
  if (!mine.length)
    return result(
      NA,
      `svelte-check ${got} failed the canary; no component and no TypeScript outside scripts/ is tracked`,
    );
  const unfit = svelteInputs(root, mine, checkedBy("types"));
  if (unfit) return unfit;
  const run = svelteCheck(root, join(root, "tsconfig.json"), config);
  if (run.broken.length)
    return result(
      CANNOT,
      "svelte-check printed lines that are not its diagnostics",
      run.broken.slice(0, 5),
    );
  const details = run.found.map(
    (d) => `${d.filename}:${d.start.line + 1} ${d.code} ${d.message}`,
  );
  if (run.status === 0 && !details.length)
    return result(
      PASS,
      `svelte-check ${got} failed the canary and accepted ${mine.length} file(s)`,
    );
  if (run.status === 1 && details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  return result(
    CANNOT,
    `svelte-check exited ${run.status}`,
    run.out.trim().split("\n").slice(0, 5),
  );
}

const viteBin = (): string =>
  process.env.VITE_BIN || join(HERE, "..", "node_modules", ".bin", "vite");
const SITE_CONFIG = "site/vite.config.ts";

// The site's build, before the test step: the HTTP and browser tests read the real build folder site/dist. A build
// that fails is a finding; a build that leaves no HTML page in site/dist cannot be checked (nothing to test).
function site(root: string, list: Set<string>): Result {
  if (!list.has(SITE_CONFIG))
    return result(NA, `no tracked ${SITE_CONFIG}: no site to build`);
  // A folder left from an earlier build must not pass for this one
  const dist = join(root, "site", "dist");
  rmSync(dist, { recursive: true, force: true });
  const r = spawnSync(viteBin(), ["build", "--config", SITE_CONFIG], {
    cwd: root,
    encoding: "utf8",
    env: childEnv(),
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error)
    return result(CANNOT, `cannot run ${viteBin()}: ${errorCode(r.error)}`);
  if (r.status !== 0)
    return result(
      FINDING,
      `vite build exited ${r.status}`,
      tail(`${r.stdout}${r.stderr}`),
    );
  // Pages, not files: Vite copies site/public into the folder even when it builds no page
  const pages = existsSync(dist)
    ? readdirSync(dist, { recursive: true, withFileTypes: true }).filter(
        (e) => e.isFile() && e.name.endsWith(".html"),
      ).length
    : 0;
  return pages
    ? result(PASS, `vite build wrote ${pages} page(s) to site/dist`)
    : result(CANNOT, "the build left no HTML page in site/dist");
}

// POL-03: no inline script and no inline style in the site's build, read by parse5, the WHATWG parser jsdom uses
// (docs/decisions/001-quality-tooling.md), never by a regular expression, as a browser with scripting on reads it.
// Stated limits: a `script` of any type with any text counts, blank or beside a `src` too; every attribute whose
// name starts with `on` counts as an event handler; a `javascript:` or `vbscript:` URL is looked for only in URL_ATTRS
// (WHATWG URL parsing, as a browser reads it); a `data:` URL only where a script or an embedded document is loaded from
// it (DATA_LOADS), never in an `img`, a `link`, a `source` or an `a`: Vite writes small assets as data: URLs, and they
// run no script. Not read: a `template`'s content, `noscript` (text to a browser with scripting on), `iframe`
// `srcdoc` and a `meta` refresh. A `style` attribute is POL-04's, found in the browser.
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "data"]);
const DATA_LOADS: Record<string, string> = {
  script: "src",
  iframe: "src",
  embed: "src",
  object: "data",
};
function inlineIn(node: DefaultTreeAdapterTypes.Node, found: string[]): void {
  if ("tagName" in node) {
    if (node.tagName === "style") found.push("a style element");
    // Any text node counts, as POL-03 words it: the scan fails closed on text a browser might not run
    if (node.tagName === "script" && node.childNodes.length)
      found.push("a script element with text");
    for (const { name, value } of node.attrs) {
      if (name.startsWith("on")) found.push(`the event handler ${name}`);
      const scheme = URL_ATTRS.has(name) ? URL.parse(value)?.protocol : null;
      if (scheme === "javascript:" || scheme === "vbscript:")
        found.push(`a ${scheme} URL in ${name}`);
      if (scheme === "data:" && DATA_LOADS[node.tagName] === name)
        found.push(`a data: URL in ${node.tagName} ${name}`);
    }
  }
  if ("childNodes" in node) for (const c of node.childNodes) inlineIn(c, found);
}

/**
 * Every `.html` file under `folder`, clean ones included, with what inline script or style it holds; [] when the
 * folder is missing. `inline` reads both: an empty list cannot be checked.
 */
function inlineScan(folder: string): { file: string; found: string[] }[] {
  if (!existsSync(folder)) return [];
  // Loaded here, not at the top: the gate's `needs` runs in CI without node_modules
  const { parse } = createRequire(join(HERE, "..", "package.json"))(
    "parse5",
  ) as typeof import("parse5");
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => {
      const path = join(e.parentPath, e.name);
      const found: string[] = [];
      const html = readFileSync(path, "utf8");
      inlineIn(parse(html), found);
      return { file: relative(folder, path), found };
    });
}

// The planted pages (scripts/canaries/inline/), one per kind POL-03 lists, each with the finding it must raise
const INLINE_CANARIES: Record<string, string> = {
  "script.html": "a script element with text",
  "module.html": "a script element with text",
  "importmap.html": "a script element with text",
  "style.html": "a style element",
  "handler.html": "the event handler onload",
  "javascript-url.html": "a javascript: URL in href",
  "vbscript-url.html": "a vbscript: URL in href",
  "data-url.html": "a data: URL in script src",
};

// After the site step, which builds site/dist afresh. Each planted canary must raise its own finding first.
function inline(root: string, list: Set<string>): Result {
  if (!list.has(SITE_CONFIG))
    return result(NA, `no tracked ${SITE_CONFIG}: no site build to scan`);
  const planted = new Map(
    inlineScan(canaries("inline")).map((p) => [p.file, p.found]),
  );
  const missed = Object.entries(INLINE_CANARIES)
    .filter(([file, kind]) => !planted.get(file)?.includes(kind))
    .map(([file, kind]) => `${file}: ${kind}`);
  if (missed.length)
    return result(CANNOT, "the scan missed a planted canary", missed);
  const pages = inlineScan(join(root, "site", "dist"));
  if (!pages.length) return result(CANNOT, "no HTML file in site/dist to scan");
  const bad = pages.flatMap((p) => p.found.map((f) => `${p.file}: ${f}`));
  return bad.length
    ? result(FINDING, `inline script or style in ${bad.length} place(s)`, bad)
    : result(PASS, `read ${pages.length} HTML file(s) in site/dist`);
}

/** A scan script of scripts/ run over the repository: its result is read from its exit code and last line (G1). */
function scan(root: string, script: string): Result {
  const r = spawnSync(process.execPath, [join(HERE, script), "--root", root], {
    encoding: "utf8",
    env: childEnv(),
  });
  const lines = (r.stdout ?? "").trim().split("\n");
  const code = [PASS, FINDING, CANNOT].includes(r.status ?? -1)
    ? (r.status as number)
    : USAGE;
  return result(
    code,
    (lines.at(-1) ?? "").replace(/^.*? check-[a-z-]+: /, ""),
    lines.slice(0, -1).map((l) => l.trim()),
  );
}

// PKG-01 to 05 and 07: check-package.ts builds the package, packs it and reads the tarball. With nothing tracked under
// src/lib there is nothing to build: not applicable.
function pack(root: string, list: Set<string>): Result {
  if (![...list].some((f) => f.startsWith("src/lib/")))
    return result(NA, "nothing is tracked under src/lib");
  return scan(root, "check-package.ts");
}

// CON-01, 02, 03, 04, 09 and 11: check-consumer.ts installs the packed package into a copy of consumer/ and tests it.
// With no tracked consumer project there is nothing to install into: not applicable.
function consumer(root: string, list: Set<string>): Result {
  if (!list.has("consumer/package.json"))
    return result(NA, "no consumer/package.json is tracked");
  return scan(root, "check-consumer.ts");
}

// THEME-01, 02, 04, 12 and 13: check-stylesheet.ts over the stylesheet and the guide. With nothing tracked under
// src/lib there is no stylesheet to read yet: not applicable.
function stylesheet(root: string, list: Set<string>): Result {
  if (![...list].some((f) => f.startsWith("src/lib/")))
    return result(NA, "nothing is tracked under src/lib");
  return scan(root, "check-stylesheet.ts");
}

// Vitest with the one tracked vitest.config.ts. A planted failing test must be reported first; then every tracked
// test file outside scripts/ (node:test files and canaries) and site/browser/ must have run with at least one passing
// test, no test may fail, and vitest itself must exit 0 (an unhandled error is not in the JSON report).
function test(root: string, list: Set<string>): Result {
  const pin = readJson(root, "package.json")?.devDependencies?.vitest;
  const v = versionOf(vitestBin(), "--version");
  if (isResult(v)) return v;
  const got = v.line.split(/[/ ]/)[1]; // "vitest/5.1.0 darwin-arm64 node-v26.13.0"
  if (got !== pin)
    return result(
      CANNOT,
      `vitest ${got} is installed ("${v.line}"), package.json pins ${pin}`,
    );
  const canary = vitest(canaries("test"), NO_CACHE);
  if (!canary.report || canary.report.numFailedTests < 1)
    return result(
      CANNOT,
      "vitest did not report the planted failing test (canary.test.ts)",
      tail(canary.out),
    );
  const mine = [...list]
    // scripts/ holds node:test files; site/browser/ the browser step's Playwright specs (*.spec.ts only)
    .filter(
      (f) =>
        /\.(?:test|spec)\.ts$/.test(f) &&
        !f.startsWith("scripts/") &&
        !f.startsWith(BROWSER_DIR),
    )
    .sort();
  if (!mine.length)
    // code a test should cover: TypeScript and components under src/ and site/
    return [...list].some((f) => /^(?:src|site)\/.+\.(?:ts|svelte)$/.test(f))
      ? result(
          CANNOT,
          "no test file is tracked for the code under src/ or site/",
        )
      : result(
          NA,
          "vitest failed the canary; no test file and no code under src/ or site/",
        );
  if (!list.has("vitest.config.ts"))
    return result(CANNOT, "vitest.config.ts is not tracked");
  // The run is shared with `trace`; see testRun for the flags it forces and the configs it cannot check
  const shared = testRun(root);
  if (isResult(shared)) return shared;
  const { report: run, status, out, error } = shared;
  if (error) return result(CANNOT, error);
  if (!run) return result(CANNOT, "vitest wrote no report", tail(out));
  // Vitest names each file by its real path; the root may reach it through a link (macOS: /var -> /private/var).
  const real = realpathSync(root);
  const byFile = new Map(
    run.testResults.map((r) => [relative(real, r.name), r]),
  );
  const missed = mine.filter((f) => !byFile.has(f));
  if (missed.length)
    return result(CANNOT, "tracked test files did not run", missed);
  const failedFiles = run.testResults.filter((r) => r.status !== "passed");
  if (failedFiles.length || run.numFailedTests > 0)
    return result(
      FINDING,
      `${failedFiles.length} file(s) failed, ${run.numFailedTests} test(s) failed`,
      failedFiles.flatMap((r) => [
        `${relative(real, r.name)}: ${r.message || r.status}`,
        ...r.assertionResults
          .filter((a) => a.status === "failed")
          .map((a) => `  ${a.fullName}`),
      ]),
    );
  if (status !== 0)
    return result(
      FINDING,
      `vitest exited ${status} though no test failed`,
      tail(out),
    );
  const idle = mine.filter(
    (f) => !byFile.get(f)?.assertionResults.some((a) => a.status === "passed"),
  );
  if (idle.length)
    return result(
      CANNOT,
      "no test passed in tracked test files (all skipped?)",
      idle,
    );
  // A test skipped at run time (skipIf, runIf, ctx.skip()) or left as test.todo did not check its statement; each
  // is named with its file, an untracked file too
  const skipped = run.numPendingTests + run.numTodoTests;
  if (skipped)
    return result(
      FINDING,
      `${skipped} test(s) skipped`,
      run.testResults.flatMap((r) =>
        r.assertionResults
          .filter((a) => a.status !== "passed")
          .map((a) => `${relative(real, r.name)}:\n    ${a.fullName}`),
      ),
    );
  return result(
    PASS,
    `vitest failed the canary; ${run.numTotalTests} test(s) in ${byFile.size} file(s) passed`,
  );
}

/**
 * A range without commits: nothing to check locally; in CI, where every event brings a commit, a wrong range. For
 * `commits`, which leaves merges out, a range of merges alone is empty too, and in CI it is reported, never passed.
 */
function emptyRange(range: string): Result {
  if (inCI()) return result(CANNOT, `no commit in ${range} in CI`);
  return result(NA, `no commit in ${range}`);
}

// The secret scan (G2) of the branch's commits, through the repository's own fail-closed wrapper, inside the one
// gate command: locally the same range CI scans. A branch with no commit of its own is NOT APPLICABLE.
function secrets(root: string): Result {
  const range = commitRange(root);
  if (isResult(range)) return range;
  const count = spawnSync(
    "git",
    // --end-of-options: a range from the environment is a revision, never an option.
    ["-C", root, "rev-list", "--count", "--end-of-options", range.range, "--"],
    {
      encoding: "utf8",
      env: childEnv(),
    },
  );
  if (count.status !== 0)
    return result(CANNOT, `git cannot read the range ${range.range}`);
  if (Number(count.stdout.trim()) === 0) return emptyRange(range.range);
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts", "scan-secrets.ts"), "git", root, range.range],
    { encoding: "utf8", env: childEnv() },
  );
  return scanResult(
    r,
    range.range,
    `${count.stdout.trim()} commit(s) in ${range.range} scanned`,
  );
}

/** The secret scan wrapper's answer as a step result. */
function scanResult(
  r: SpawnSyncReturns<string>,
  what: string,
  passed: string,
): Result {
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
  if (r.status === PASS) return result(PASS, passed, out);
  // node also exits 1 on an uncaught error: only the wrapper's own line makes it a finding.
  if (
    r.status === FINDING &&
    !out.some((l) => l.startsWith("FINDING scan-secrets:"))
  )
    return result(CANNOT, "the secret scan exited 1 with no FINDING line", out);
  if (r.status === FINDING) return result(FINDING, `secrets in ${what}`, out);
  return result(
    CANNOT,
    `the secret scan exited ${r.status ?? errorCode(r.error)}`,
    out,
  );
}

// The types of a commit header; the changelog will be generated from headers of these types (method section 7;
// decision 001).
const TYPES = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
];
const HEADER = new RegExp(`^(${TYPES.join("|")})(\\([a-z0-9-]+\\))?!?: \\S`);
const MAX_HEADER = 100;
// git's own headers for `git revert` of a commit and of a revert, judged by the header they wrap, and git's own merge
// header, which a revert of a merged pull request wraps.
const WRAPPED = /^(Revert|Reapply) "(.*)"$/;
const MERGE = /^Merge /;
// git's headers for `commit --fixup[=amend:|reword:]` and `--squash`: fine while working, squashed before a pull
// request.
const AUTOSQUASH = /^(fixup|squash|amend)! /;
// What JSON.stringify leaves as it is but a terminal or log viewer acts on, or a reader cannot see: DEL, the C1
// controls, the bidi marks, U+2028/9, and the invisible format characters (soft hyphen, zero-width characters, word
// joiner, byte-order mark).
const UNPRINTABLE =
  /[\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/g;
/** A text for output: quoted, every character of UNPRINTABLE escaped. */
const shown = (text: string): string =>
  JSON.stringify(text).replace(
    UNPRINTABLE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
/** A header for output: its first 100 characters if longer, shown. */
const shownHeader = (written: string): string =>
  shown(
    written.length > MAX_HEADER
      ? `${written.slice(0, MAX_HEADER)}...`
      : written,
  );
/** What is wrong with a header as written, or null. */
function headerProblem(written: string): string | null {
  const quoted = shownHeader(written);
  if (written.length > MAX_HEADER)
    return `${quoted}: ${written.length} characters, more than ${MAX_HEADER}`;
  let h = written;
  for (let w = WRAPPED.exec(h); w; w = WRAPPED.exec(h)) h = w[2];
  if (h !== written && MERGE.test(h)) return null;
  if (AUTOSQUASH.test(h))
    return `${quoted}: a fixup, squash or amend commit; squash it before the pull request`;
  if (!HEADER.test(h))
    return `${quoted}: not "<type>(<scope>)?!?: <subject>" with a type of ${TYPES.join(", ")}`;
  return null;
}

/**
 * A message's header as git reads it: its first non-blank line, trailing ASCII blanks and a carriage return removed.
 * A message stored verbatim (an API commit, `--cleanup=verbatim`) keeps them; git's default clean-up removes them.
 * Blank means ASCII blanks only, as in git: a line of a no-break space or a byte-order mark is a header.
 */
function headerOf(message: string): string {
  // A scan from the end, not a regular expression: /[ \t\r]+$/ takes quadratic time on a long run of blanks.
  for (const line of message.split("\n")) {
    let end = line.length;
    while (end > 0 && " \t\r".includes(line[end - 1])) end--;
    if (end) return line.slice(0, end);
  }
  return "";
}

// Every commit of the branch, merges left out, has a conventional header of at most 100 characters.
function commits(root: string): Result {
  const range = commitRange(root);
  if (isResult(range)) return range;
  const r = spawnSync(
    "git",
    // The whole message, not %s: git's %s joins a body line written right below the subject into it. -z ends each
    // commit with a NUL, which no commit message can hold.
    // --no-show-signature: a contributor's log.showSignature would print signature text before the hash.
    [
      ...["-C", root, "log", "-z", "--no-merges", "--no-show-signature"],
      ...["--format=%h%n%B", "--end-of-options", range.range, "--"],
    ],
    { encoding: "utf8", env: childEnv(), maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0)
    return result(
      CANNOT,
      `git log ${range.range} failed: ${r.stderr?.trim() || errorCode(r.error) || "no reason given"}`,
    );
  const records = r.stdout.split("\0").filter(Boolean);
  if (!records.length) return emptyRange(range.range);
  const details = records.flatMap((rec) => {
    const [hash, ...message] = rec.split("\n");
    const problem = headerProblem(headerOf(message.join("\n")));
    return problem ? [`${hash} ${problem}`] : [];
  });
  if (details.length)
    return result(
      FINDING,
      `${details.length} of ${records.length} commit(s)`,
      details,
    );
  return result(
    PASS,
    `${records.length} commit(s) in ${range.range}, every header conventional`,
  );
}

// git's scissors line: with `commit -v`, git writes it below the editor template and the diff below it (measured).
const SCISSORS = "# ------------------------ >8 ------------------------";
// The commit-msg hook's check of one message file, which git hands over before its own clean-up (measured): comment
// lines are dropped and nothing below the scissors line is read, as git does when it opens the editor (a message given
// with -m or -F keeps its # lines; the hook skips them all the same). A header starting with `Merge ` or with the
// autosquash prefix of --fixup, --squash or --fixup=amend: passes before any other rule; the gate's `commits` step
// still refuses the autosquash ones and judges a one-parent commit that only looks like a merge.
function commitMsg(file: string | undefined): Result {
  if (!file) return result(USAGE, "no message file given");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return result(
      USAGE,
      `cannot read the message file ${shown(file)}: ${errorCode(e as NodeJS.ErrnoException) ?? "no reason given"}`,
    );
  }
  const lines = text.split("\n");
  const cut = lines.indexOf(SCISSORS);
  const above = cut < 0 ? lines : lines.slice(0, cut);
  const kept = above.filter((l) => !l.startsWith("#"));
  // The scan reads the comment lines too: `commit -m` keeps them in the message.
  const before = above.join("\n");
  const header = headerOf(kept.join("\n"));
  if (!header)
    return result(
      FINDING,
      "the message is empty (lines starting with # are comments)",
    );
  if (MERGE.test(header) || AUTOSQUASH.test(header)) {
    const leaked = messageSecrets(before);
    return leaked.code === PASS
      ? result(PASS, `${shownHeader(header)}: a merge or autosquash header`)
      : leaked;
  }
  const problem = headerProblem(header);
  if (problem) return result(FINDING, problem);
  const leaked = messageSecrets(before);
  return leaked.code === PASS ? result(PASS, shownHeader(header)) : leaked;
}

// The real-browser layer: Playwright with the one tracked playwright.config.ts, after the test step, so the site's
// address 127.0.0.1:4173 is never shared with the site's start tests. A planted failing spec must be reported first.
const PW_CONFIG = "playwright.config.ts";
const playwrightBin = (): string =>
  process.env.PLAYWRIGHT_BIN ||
  join(HERE, "..", "node_modules", ".bin", "playwright");
// Substrings of Playwright's own messages at the pinned version (measured on 1.65.1, 2026-11-19; re-measure when the
// pin moves: the two real-Playwright rows fail if they drift); any other error cannot be checked
const PORT_TAKEN = "is already used, make sure that nothing is running";
const NO_BROWSER = "Executable doesn't exist at";
// Every tracked spec must run in each of the three engines the method names
const ENGINES = ["chromium", "firefox", "webkit"];
interface PwTest {
  projectName: string;
  status: string;
  annotations?: { type: string }[];
  results: { error?: { message?: string } }[];
}
interface PwSuite {
  file: string;
  specs?: { title: string; line: number; tests: PwTest[] }[];
  suites?: PwSuite[];
}
interface PwReport {
  stats: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  errors: { message?: string }[];
  suites: PwSuite[];
}
interface PwRun {
  report: PwReport | null;
  status: number | null;
  out: string;
}

/** One Playwright run in `cwd`: its JSON report (null when it wrote none or none readable), exit status and output. */
function playwright(cwd: string): PwRun {
  const dir = mkdtempSync(join(tmpdir(), "playwright-"));
  try {
    const file = join(dir, "report.json");
    const r = spawnSync(
      playwrightBin(),
      ["test", "--config", PW_CONFIG, "--reporter=json"],
      {
        cwd,
        encoding: "utf8",
        env: { ...childEnv(), PLAYWRIGHT_JSON_OUTPUT_FILE: file },
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    let report: PwReport | null = null;
    try {
      report = JSON.parse(readFileSync(file, "utf8")) as PwReport;
    } catch {
      // No file, or a cut one: the run is judged as having written no report
    }
    return { report, status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** One test of a report: its file, its title, the test, and the line of its `test(` call. */
type PwRow = [string, string, PwTest, number];
/** Every test of a report as a row, describe blocks flattened. */
const pwTests = (suites: PwSuite[]): PwRow[] =>
  suites.flatMap((s) => [
    ...(s.specs ?? []).flatMap((spec) =>
      spec.tests.map((t): PwRow => [s.file, spec.title, t, spec.line]),
    ),
    ...pwTests(s.suites ?? []),
  ]);

/** Why a run could not check anything: a taken port, a missing browser, any error outside the tests, no report. */
function pwCannot(run: PwRun): Result | null {
  if (!run.report)
    return result(CANNOT, "playwright wrote no readable report", tail(run.out));
  const errors = run.report.errors.map((e) => e.message ?? "");
  if (errors.some((m) => m.includes(PORT_TAKEN)))
    return result(
      CANNOT,
      "127.0.0.1:4173 is held by another process (stop pnpm site:serve)",
    );
  if (errors.length)
    return result(CANNOT, "playwright could not run", tail(errors.join("\n")));
  const missing = pwTests(run.report.suites).filter(([, , t]) =>
    t.results.some((r) => r.error?.message?.includes(NO_BROWSER)),
  );
  if (missing.length)
    return result(
      CANNOT,
      "a browser is not installed: run pnpm exec playwright install",
      [...new Set(missing.map(([, , t]) => t.projectName))],
    );
  return null;
}

/**
 * A test that did not pass, or passed only as an expected failure (test.fail): one line, the first three lines of
 * its reason as tail() keeps them (error lines first, no stack frames), joined by " / ".
 */
const pwBad = ([file, title, t]: PwRow): string[] => {
  const head = `${file} > ${title} [${t.projectName}]`;
  if (t.annotations?.some((a) => a.type === "fail"))
    return [`${head}: marked test.fail`];
  if (t.status === "expected") return [];
  if (t.status === "skipped") return [`${head}: skipped`];
  const why = tail(t.results.at(-1)?.error?.message ?? t.status);
  return [`${head}: ${why.slice(0, 3).join(" / ")}`];
};

function browser(root: string, list: Set<string>): Result {
  const specs = [...list].filter(isBrowserSpec);
  if (!specs.length)
    return result(
      NA,
      `no tracked spec under ${BROWSER_DIR}: no browser test to run`,
    );
  if (!list.has(PW_CONFIG))
    return result(CANNOT, `${PW_CONFIG} is not tracked`, specs);
  // Checked by gate-needs: GATE_BROWSER may stand only in a job other than browser, beside a job browser that runs it;
  // the job browser itself never leaves the step out, however the variable reached it
  if (
    inCI() &&
    process.env.GATE_BROWSER === "job" &&
    process.env.GITHUB_JOB !== "browser"
  )
    return result(NA, "left to the CI job browser (GATE_BROWSER)");
  const pin = readJson(root, "package.json")?.devDependencies?.[
    "@playwright/test"
  ];
  const v = versionOf(playwrightBin(), "--version");
  if (isResult(v)) return v;
  const got = v.line.replace("Version ", "");
  if (got !== pin)
    return result(
      CANNOT,
      `playwright ${got} is installed, package.json pins ${pin}`,
    );
  // The canary goes through the same reading as the real run: its one test (canary.spec.ts) must have failed
  const canary = playwright(canaries("browser"));
  const cannot = pwCannot(canary);
  if (cannot) return cannot;
  const planted = pwTests(canary.report?.suites ?? []);
  if (planted[0]?.[2].status !== "unexpected")
    return result(
      CANNOT,
      "playwright did not report the planted failing test (canary.spec.ts)",
    );
  // Its marker must come back through the marker reading as not passed: a reading that found nothing would pass all
  const marker = pwMarkers(
    canaries("browser"),
    ["canary.spec.ts"],
    planted,
    "",
  );
  if (!marker.findings.some((f) => f.includes("not passed")))
    return result(
      CANNOT,
      "the planted failing test's marker was not reported (canary.spec.ts)",
    );
  return pwJudge(playwright(root), specs, root);
}

/**
 * The markers of `files` (read in `dir`, a report file being `prefix` + its name) judged with trace's own reading: a
 * marker counts when tests ran under it and each passed as pwBad judges. The markers' own problems (no such statement,
 * a stale hash, a marker out of place) are trace's to report, so readMarkers' problems are not read here.
 */
function pwMarkers(
  dir: string,
  files: string[],
  rows: PwRow[],
  prefix: string,
) {
  const ran = new Map<string, Ran[]>();
  for (const row of rows) {
    const [file, title, t, line] = row;
    // "not passed" is matched by the canary check in browser()
    const status = pwBad(row).length ? "not passed" : "passed";
    const name = `${title} [${t.projectName}]`;
    const key = `${prefix}${file}`;
    ran.set(key, [...(ran.get(key) ?? []), { line, name, status }]);
  }
  const markers = files.flatMap(
    (f) => readMarkers(f, readFileSync(join(dir, f), "utf8")).markers,
  );
  const judged = judgeResults(markers, ran);
  // A marker counts only when its tests ran in each engine, as every spec must
  const thin = judged.ok.flatMap((m) => {
    const engines = new Set(
      rows
        .filter(
          ([f, , , line]) =>
            `${prefix}${f}` === m.file && line >= m.from && line <= m.to,
        )
        .map(([, , t]) => t.projectName),
    );
    const not = ENGINES.filter((e) => !engines.has(e));
    return not.length
      ? [`${m.file}:${m.line}: ${m.id}: not in ${not.join(", ")}`]
      : [];
  });
  return {
    ...judged,
    cannot: [...judged.cannot, ...thin],
    total: markers.length,
  };
}

/**
 * The real run's result: every tracked spec in each engine, the report's totals, then each test, then the exit, then
 * the specs' markers.
 */
function pwJudge(run: PwRun, specs: string[], root: string): Result {
  const stopped = pwCannot(run);
  if (stopped) return stopped;
  // pwCannot answers for a run without a report
  const report = run.report as PwReport;
  const tests = pwTests(report.suites);
  const missed = specs.flatMap((f) => {
    const ran = new Set(
      tests
        .filter(([file]) => `${BROWSER_DIR}${file}` === f)
        .map(([, , t]) => t.projectName),
    );
    const not = ENGINES.filter((e) => !ran.has(e));
    return not.length ? [`${f}: not in ${not.join(", ")}`] : [];
  });
  if (missed.length)
    return result(
      CANNOT,
      "tracked browser specs did not run in every engine",
      missed,
    );
  // The report's own totals must count the tests read, or the reading missed some
  const { expected = 0, unexpected = 0, flaky = 0, skipped = 0 } = report.stats;
  if (expected + unexpected + flaky + skipped !== tests.length)
    return result(
      CANNOT,
      `the report counts ${expected + unexpected + flaky + skipped} test(s), ${tests.length} were read`,
    );
  const bad = tests.flatMap(pwBad);
  if (bad.length)
    return result(
      FINDING,
      `${bad.length} browser test(s) failed, skipped or marked to fail`,
      bad,
    );
  if (run.status !== 0)
    return result(
      CANNOT,
      `playwright exited ${run.status} with every test passed`,
      tail(run.out),
    );
  const marked = pwMarkers(root, specs, tests, BROWSER_DIR);
  if (marked.findings.length)
    return result(
      FINDING,
      `${marked.findings.length} browser marker(s) without a passing test`,
      marked.findings,
    );
  if (marked.cannot.length)
    return result(
      CANNOT,
      `${marked.cannot.length} browser marker(s) not checked`,
      marked.cannot,
    );
  return result(
    PASS,
    `playwright failed the canary; ${tests.length} test(s) in ${specs.length} file(s) passed; ${marked.total} marker(s) with passing tests in every engine (ids and hashes: trace)`,
  );
}

// The git hooks: `git config core.hooksPath .githooks` makes git run each file there, the same two-line shim into
// this runner. No hook changes a file.
const HOOKS = ["pre-commit", "commit-msg", "pre-push"];
const shim = (hook: string): string =>
  `#!/bin/sh\nexec node scripts/check-repo.ts ${hook} "$@"\n`;

// The problems with core.hooksPath in this clone, or the Result when git cannot say.
function hooksPath(root: string): Result | string[] {
  // git's status: 0 set, 1 unset, anything else is git failing (a broken configuration file), not an unset path.
  const g = spawnSync(
    "git",
    ["-C", root, "config", "--show-origin", "--get", "core.hooksPath"],
    { encoding: "utf8", env: childEnv() },
  );
  if (g.status !== 0 && g.status !== 1)
    return result(
      CANNOT,
      `git cannot read core.hooksPath: ${g.stderr.trim() || "no reason given"}`,
    );
  // Only the line end goes: an empty value leaves "<origin>\t", and trimming that would lose the value.
  const [origin, value] = g.stdout.replace(/\n$/, "").split("\t");
  if (g.status === 1) return ["core.hooksPath is unset: run ./scripts/setup"];
  return value === ".githooks"
    ? []
    : [
        `core.hooksPath is "${value}" (${origin}): ./scripts/setup will not replace it; set it to .githooks in this clone (git config core.hooksPath .githooks), which replaces the other value here, whose hooks then stop running in this clone`,
      ];
}

// What is wrong with one shim, or null; a Result when it cannot be opened for another reason. The file is opened
// once and its mode and content are read from that one descriptor, so the two checks see the same file.
function shimProblem(f: string, hook: string): string | Result | null {
  let fd: number;
  try {
    fd = openSync(f, "r");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return "missing";
    return result(
      CANNOT,
      `.githooks/${hook} cannot be opened: ${code ?? String(e)}`,
    );
  }
  try {
    if (!(fstatSync(fd).mode & 0o100)) return "not executable";
    return readFileSync(fd, "utf8") === shim(hook)
      ? null
      : "not the two-line shim";
  } finally {
    closeSync(fd);
  }
}

// The shims are checked wherever the gate runs; core.hooksPath only in a clone (CI has no clone-local git config, and
// an extra file in .githooks would run in any maintainer's clone that has set it up). The folder is read from the
// tracked list: an untracked file in it (a Finder .DS_Store) is not part of the repository.
function hooks(root: string, list: Set<string>): Result {
  const ci = inCI();
  const path = ci ? [] : hooksPath(root);
  if (isResult(path)) return path;
  const details = [...path];
  for (const f of [...list].sort())
    if (f.startsWith(".githooks/") && !HOOKS.includes(f.slice(10)))
      details.push(`${f}: not a known hook`);
  for (const h of HOOKS) {
    const problem = shimProblem(join(root, ".githooks", h), h);
    if (typeof problem === "string") details.push(`.githooks/${h}: ${problem}`);
    else if (problem) return problem;
  }
  if (details.length)
    return result(FINDING, `${details.length} problem(s)`, details);
  const shims = `${HOOKS.join(", ")} as shims`;
  return result(
    PASS,
    ci
      ? `${shims}; core.hooksPath not checked (CI has no clone-local git configuration)`
      : `core.hooksPath .githooks; ${shims}`,
  );
}

type Stage = [string, () => Result | Promise<Result>];

// The pre-commit hook. git runs it at the top of the work tree with its own environment, which names a temporary
// index for `git commit -a` or `git commit <path>`: the staged list and the export below keep that environment. The
// whole-repository listings (`tracked`) drop git's variables and read the real index.
function preCommit(): Result | Stage[] {
  const git = (...args: string[]) =>
    spawnSync("git", args, { encoding: "utf8" });
  const staged = git(
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--diff-filter=ACMRT",
  );
  const changed = git("diff", "--name-only", "-z");
  if (staged.status !== 0 || changed.status !== 0)
    return result(CANNOT, "git cannot list the staged files");
  const files = new Set(staged.stdout.split("\0").filter(Boolean));
  // The checks read the work tree, so it must hold exactly what is staged.
  const again = changed.stdout.split("\0").filter((f) => files.has(f));
  if (again.length)
    return result(
      CANNOT,
      `${again.length} staged file(s) changed after staging: stage or restore the change`,
      again,
    );
  if (!files.size) return result(NA, "no added or changed file is staged");
  const root = process.cwd();
  // The two checks that read the whole repository: a failed listing is not narrowed to the staged files.
  const whole = (check: Check) => (): Result => {
    const all = tracked(root);
    return all
      ? check(root, all)
      : result(CANNOT, "git cannot list the tracked files");
  };
  const some = (match: (f: string) => boolean) => [...files].some(match);
  // A staged file of no class runs the step, which then names it.
  const ofStep = (step: string) =>
    some(
      (f) => CLASSES.find((k) => k.match.test(f))?.steps.includes(step) ?? true,
    );
  const when = (step: string, staged: boolean, check: () => Result): Stage => [
    step,
    staged ? check : () => result(NA, "no staged file of its kind"),
  ];
  // A whole-repository check reads the work tree: a file it reads with an unstaged change is not what is committed.
  const unstagedRead = (check: Check, reads: (f: string) => boolean) => {
    const edited = changed.stdout.split("\0").filter((f) => f && reads(f));
    return edited.length
      ? () =>
          result(
            CANNOT,
            `${edited.length} file(s) it reads changed and not staged: stage or restore the change`,
            edited,
          )
      : whole(check);
  };
  const inGithub = (f: string) => f.startsWith(".github/");
  // A package.json at any depth: the step also reads each workspace package's manifest.
  const lockReads = (f: string) =>
    /^((.+\/)?package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.github\/dependabot\.yml)$/.test(
      f,
    );
  return [
    // Always: `text` also bans conflict markers in every file and suppression comments in code.
    ["text", () => text(root, files, true)],
    when("format", ofStep("format"), () => format(root, files)),
    when("lint", ofStep("lint"), () => lint(root, files)),
    when("lockfile", some(lockReads), unstagedRead(lockfile, lockReads)),
    when("workflows", some(inGithub), unstagedRead(workflows, inGithub)),
    ["secrets", () => stagedSecrets(root, [...files])],
  ];
}

// The secret scan of the staged blobs, exported from the hook's index.
function stagedSecrets(root: string, files: string[]): Result {
  const dir = mkdtempSync(join(tmpdir(), "staged-"));
  try {
    const e = spawnSync(
      "git",
      ["checkout-index", `--prefix=${dir}/`, "--", ...files],
      { encoding: "utf8" },
    );
    if (e.status !== 0)
      return result(
        CANNOT,
        `git cannot export the staged files: ${e.stderr.trim()}`,
      );
    // The scanner takes a tree of regular files with content: a symlink or an empty file holds nothing to scan.
    const kept = files.filter((f) => {
      const s = lstatSync(join(dir, f));
      if (s.isFile() && s.size) return true;
      rmSync(join(dir, f));
      return false;
    });
    if (!kept.length) return result(NA, "no staged file holds content to scan");
    return scanFolder(
      root,
      dir,
      "the staged files",
      `${kept.length} staged file(s) scanned`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The repository's own scan wrapper on a folder of regular files. */
function scanFolder(
  root: string,
  dir: string,
  what: string,
  passed: string,
): Result {
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts", "scan-secrets.ts"), "dir", dir],
    { encoding: "utf8", env: childEnv() },
  );
  return scanResult(r, what, passed);
}

// The secret scan of the commit message, in a folder of its own: the range scans of a push read the message through
// gitleaks' git mode, which was measured to miss a token in a body.
function messageSecrets(text: string): Result {
  const dir = mkdtempSync(join(tmpdir(), "message-"));
  try {
    writeFileSync(join(dir, "MESSAGE"), text);
    return scanFolder(process.cwd(), dir, "the message", "the message scanned");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ZERO = /^0+$/;
/** This clone's own setting `sveltedt.<key>`, or "" when it is not set. */
const setting = (root: string, key: string): string =>
  spawnSync("git", ["-C", root, "config", "--get", `sveltedt.${key}`], {
    encoding: "utf8",
    env: childEnv(),
  }).stdout.trim();

// The pre-push hook: git names the remote and writes one line per pushed ref on stdin, "<local ref> <local sha>
// <remote ref> <remote sha>". A pushed secret or private word counts as published, so the scans block here; the gate
// runs before a pull request and in CI, not at the push.
function prePush(remote: string | undefined): Result | Stage[] {
  const root = process.cwd();
  const git = (...args: string[]) =>
    spawnSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      env: childEnv(),
      maxBuffer: 1 << 28,
    });
  const out = (r: { stdout: string }) => r.stdout.trim();
  const main = `refs/remotes/${remote}/main`;
  const ranges: string[] = [],
    skipped: string[] = [];
  for (const line of readFileSync(0, "utf8").split("\n").filter(Boolean)) {
    const [, localSha, remoteRef, remoteSha] = line.split(" ");
    if (ZERO.test(localSha)) {
      skipped.push(`${remoteRef}: deletion`);
      continue;
    }
    // The remote ref decides what is pushed; a tag object is read as the commit it names.
    const tip = out(git("rev-parse", `${localSha}^{commit}`));
    const fresh = git(
      "rev-list",
      "--count",
      tip,
      "--not",
      `--remotes=${remote}`,
    );
    if (remoteRef.startsWith("refs/tags/") && out(fresh) === "0") {
      skipped.push(`${remoteRef}: tag, nothing new`);
      continue;
    }
    // An update: its commits after the remote's. A new branch, a tag with new commits, or an update whose old tip
    // is not an ancestor (a force-push after a rebase): those after the remote's main, as the gate's own range.
    const update =
      !ZERO.test(remoteSha) &&
      !remoteRef.startsWith("refs/tags/") &&
      git("merge-base", "--is-ancestor", remoteSha, tip).status === 0;
    const base = update
      ? { status: 0, stdout: remoteSha }
      : git("merge-base", main, tip);
    const count = git("rev-list", "--count", `${out(base)}..${tip}`);
    if (!tip || base.status !== 0 || count.status !== 0)
      return result(
        CANNOT,
        `git cannot list the commits of ${remoteRef}: ${remote}/main must be fetched (git fetch ${remote})`,
      );
    if (out(count) === "0") skipped.push(`${remoteRef}: no new commit`);
    else ranges.push(`${out(base)}..${tip}`);
  }
  if (!ranges.length) return result(NA, skipped.join("; ") || "nothing pushed");
  return [
    ...ranges.map((r): Stage => [
      `secrets ${r}`,
      () => {
        const added = git(
          ...[
            "log",
            "--diff-merges=first-parent",
            "--numstat",
            "--format=%x00%H",
          ],
          ...[r, "--"],
        );
        // The scanner cannot check a range that adds no text (only deletions): nothing there to leak.
        if (added.status === 0 && !/^[1-9]\d*\t/m.test(added.stdout))
          return result(PASS, `${r}: no text added`);
        return scanResult(
          spawnSync(
            process.execPath,
            [join(root, "scripts", "scan-secrets.ts"), "git", root, r],
            { encoding: "utf8", env: childEnv() },
          ),
          r,
          `${r} scanned`,
        );
      },
    ]),
    // Gitleaks' git mode was measured to miss a token in a message body, and a commit made without the hook, a
    // cherry-pick or a rebase has had no commit-msg scan.
    ...ranges.map((r): Stage => [
      `messages ${r}`,
      () => {
        const log = git("log", "--format=%B%x00", r);
        return log.status === 0 && log.stdout
          ? messageSecrets(log.stdout)
          : result(CANNOT, `git cannot read the messages of ${r}`);
      },
    ]),
    ...ranges.map((r): Stage => [`words ${r}`, () => words(root, r)]),
  ];
}

// The private word scan (companion G3) is the owner's: its program and lists stay outside the repository, named
// in this clone's git config (sveltedt.wordScan, .wordList, .wordAllow). A contributor's clone has none.
function words(root: string, range: string): Result {
  const scan = setting(root, "wordScan");
  if (!scan)
    return result(NA, "word scan not set up in this clone (owner only)");
  // A scan run with an empty list would pass whatever it is given.
  const keys = ["wordList", "wordAllow"];
  const lists = keys.map((key) => setting(root, key));
  for (const [i, file] of lists.entries()) {
    try {
      readFileSync(file);
    } catch {
      return result(
        CANNOT,
        `sveltedt.${keys[i]} is not set or names no readable file`,
      );
    }
  }
  const r = spawnSync(
    process.execPath,
    [scan, "git", root, range, "--list", lists[0], "--allow", lists[1]],
    { encoding: "utf8", env: childEnv() },
  );
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
  if (r.status === PASS) return result(PASS, `${range} scanned`, out);
  // node also exits 1 on an uncaught error: only the scanner's own line makes it a finding.
  if (
    r.status === FINDING &&
    out.some((l) => l.startsWith("FINDING scan-words:"))
  )
    return result(FINDING, `private words in ${range}`, out);
  return result(
    CANNOT,
    `the word scan exited ${r.status ?? errorCode(r.error)}`,
    out,
  );
}

/** Runs the stages in order, stopping at the first that does not pass; one not applicable is counted apart. */
async function runStages(name: string, stages: Stage[]): Promise<number> {
  const notApplicable: string[] = [];
  for (const [step, check] of stages) {
    const r = await check();
    const code = report(step, r);
    if (code !== PASS) return report(name, result(code, `stopped at ${step}`));
    if (r.code === NA) notApplicable.push(step);
  }
  const passed = `${stages.length - notApplicable.length} checks passed`;
  return report(
    name,
    result(
      PASS,
      notApplicable.length
        ? `${passed}, ${notApplicable.length} not applicable: ${notApplicable.join(", ")}`
        : passed,
    ),
  );
}

// `all` stops at the first step that does not pass, so the order is toolchain, secrets, hooks: a pull request red on
// any later step, `hooks` included, still gets its secret scan in CI, which has no other.
const CHECKS: Record<
  string,
  (root: string, list: Set<string>) => Result | Promise<Result>
> = {
  toolchain,
  secrets,
  hooks,
  selftest,
  files,
  lockfile,
  licences,
  text,
  format,
  lint,
  types,
  svelte,
  site,
  inline,
  stylesheet,
  package: pack,
  consumer,
  test,
  trace,
  "diff-coverage": diffCoverage,
  "red-check": redCheck,
  mutation,
  browser,
  dupes,
  commits,
  pins,
  "gate-needs": gateNeeds,
  links,
  actionlint,
  workflows,
};

function report(name: string, r: Result): number {
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} ${name}: ${r.summary}`);
  return r.code === NA ? PASS : r.code;
}

async function main(argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  if (name === "needs") return report("needs", needs(rest[0]));
  if (name === "commit-msg") return report(name, commitMsg(rest[0]));
  if (name === "pre-commit" || name === "pre-push") {
    const stages = name === "pre-push" ? prePush(rest[0]) : preCommit();
    return Array.isArray(stages)
      ? runStages(name, stages)
      : report(name, stages);
  }
  if (name !== "all" && !CHECKS[name])
    return report(
      name ?? "",
      result(
        USAGE,
        `unknown check; use one of all, needs, pre-commit, commit-msg, pre-push, ${Object.keys(CHECKS).join(", ")}`,
      ),
    );
  const [flag, given, ...extra] = rest;
  const unknown = flag !== undefined && flag !== "--root" ? flag : extra[0];
  if (unknown !== undefined)
    return report(name, result(USAGE, `unknown argument ${unknown}`));
  if (flag && !given)
    return report(name, result(USAGE, "--root needs a folder"));
  const root = given ?? join(dirname(fileURLToPath(import.meta.url)), "..");
  const list = tracked(normalize(root));
  if (!list)
    return report(
      name,
      result(CANNOT, `${root}: git ls-files failed or lists nothing`),
    );
  if (name !== "all") return report(name, await CHECKS[name](root, list));
  return runStages(
    "all",
    Object.entries(CHECKS).map(([step, check]) => [
      step,
      () => check(root, list),
    ]),
  );
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  console.log(
    `USAGE check-repo: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
  );
  process.exitCode = USAGE;
}
