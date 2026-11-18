// check-repo: the repository checks that need no product code, and `all`, the gate command that runs them.
//   node scripts/check-repo.ts <check> [--root <dir>]   one check, or `all` (what `pnpm gate` runs)
//   node scripts/check-repo.ts needs '<json>'           CI only: the `needs` context of the `gate` job
//   node scripts/check-repo.ts commit-msg <file>        the commit-msg hook (.githooks/), run by git
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// The files the steps classify and scan come from `git ls-files`; configuration, pins and canaries are read from disk.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, normalize, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  binaryOf,
  CANNOT,
  FINDING,
  PASS,
  pinnedVersion,
  USAGE,
} from "./pinned.ts";

const NA = 4; // nothing of the step's kind here: exits 0, never prints PASS
const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
  [NA]: "NOT APPLICABLE",
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
    details.push("LICENSE: not the Apache-2.0 text");
  if (!read("NOTICE").includes(COPYRIGHT))
    details.push(`NOTICE: no line "${COPYRIGHT}"`);
  if (!read(".gitignore").split("\n").includes("/tmp/"))
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

// Nothing ships but a svelte peer (PRD-S5); licences are the licences step's. Development dependencies are
// exact; the lockfile is one YAML document (G11); pnpm's release age equals Dependabot's shortest npm cooldown, and every
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
    match: /\.test\.mjs$/,
    steps: ["format", "lint"],
    why: "dupes: a test may repeat its setup so it reads on its own (method section 5)",
  },
  { match: /\.mjs$/, steps: ["format", "lint", "dupes"] },
  {
    // The project is TypeScript: the Svelte config is its one .js file; another .js file has no class and blocks
    // until one is decided.
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
      /^(LICENSE|NOTICE|\.editorconfig|\.gitignore|\.node-version|\.github\/CODEOWNERS|\.githooks\/[\w-]+|scripts\/[\w-]+\.version)$/,
    steps: ["text"],
  },
  {
    match: /\.toml$/,
    steps: ["text"],
    why: "format: Prettier has no TOML parser",
  },
];

/** The files `step` checks, or could-not-check when a tracked file has no class or the class holds no file. */
function ofClass(list: Set<string>, step: string): Result | string[] {
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
  if (!mine.length) return result(CANNOT, "no file to check");
  return mine;
}

// The opening and closing markers only: a line of seven "=" is also a Markdown heading underline.
const CONFLICT = /^(<{7}|>{7})( |$)/;
// Comments that switch a check off; refused in code (the files ESLint lints). Built from parts, or this file would
// hold them.
const SUPPRESSION = new RegExp(
  [
    ["svelte-", "ignore"],
    ["@ts-", "expect-error"],
    ["@ts-", "nocheck"],
    ["jscpd:", "ignore"],
    ["prettier-", "ignore"],
  ]
    .map((parts) => parts.join(""))
    .join("|"),
);

// For files no formatter rewrites: LF line endings, a final newline, no trailing whitespace. For every tracked file:
// no conflict marker (Prettier keeps one in Markdown as text). In code: no suppression comment.
function text(root: string, list: Set<string>): Result {
  const mine = ofClass(list, "text");
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
    `${mine.length} file(s): LF, final newline, no trailing whitespace; no conflict marker in ${list.size} tracked file(s), no suppression comment in code`,
  );
}

const HERE = dirname(fileURLToPath(import.meta.url));
// Test seams, unset in normal use: CANARY_DIR (planted folders), <NAME>_BIN (fakes, see binaryOf in pinned.ts),
// SVELTE_CHECK_BIN, VITEST_BIN, JSCPD_BIN and ESLINT_CONFIG.
// An empty value counts as unset in each.
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
function configDrift(canary: EslintRecord, rec: EslintRecord): string[] {
  const bans = (c: { rules: Record<string, unknown> }) =>
    ((c.rules["no-restricted-syntax"] as unknown[] | undefined) ?? [])
      .slice(1)
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
    const rules = [
      ...new Set((LINT_CANARY_RULES[ext] ?? []).map((e) => e.split("|")[0])),
    ];
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    return [
      ...rules.filter((r) => !same(got.rules[r], want.rules[r])),
      ...(same(got.settings, want.settings) ? [] : ["settings"]),
      ...(same(got.linterOptions, want.linterOptions) ? [] : ["linterOptions"]),
      ...(["processor", "parser"] as const).filter((k) => got[k] !== want[k]),
      ...(bans(proven).every((b) => bans(got).includes(b))
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

const vitestBin = (): string =>
  process.env.VITEST_BIN || join(HERE, "..", "node_modules", ".bin", "vitest");
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[\\d;]*m`, "g");
/** Up to 8 lines a child printed, error lines first, without stack frames or code frames: the reason to show. */
function tail(text: string): string[] {
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

interface VitestReport {
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
function vitest(
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

// Vitest with the one tracked vitest.config.ts. A planted failing test must be reported first; then every tracked
// test file outside scripts/ (which holds the node:test files and canaries) must have run with at least one passing
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
  const canary = vitest(canaries("test"), []);
  if (!canary.report || canary.report.numFailedTests < 1)
    return result(
      CANNOT,
      "vitest did not report the planted failing test (canary.test.ts)",
      tail(canary.out),
    );
  const mine = [...list]
    .filter((f) => /\.(?:test|spec)\.ts$/.test(f) && !f.startsWith("scripts/"))
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
  // No flag overrides onUnhandledError, and two flags do not reach a project (measured). Read as text: a name in a
  // module the config imports or built at run time is not seen (CONTRIBUTING.md)
  const config = readFileSync(join(root, "vitest.config.ts"), "utf8");
  const unchecked = [
    ["onUnhandledError", "lets an unhandled error pass"],
    [
      "projects",
      `names "projects" (read as text), which two of the step's flags do not reach`,
    ],
  ].filter(([name]) => config.includes(name));
  if (unchecked.length)
    return result(
      CANNOT,
      `vitest.config.ts ${unchecked.map(([, why]) => why).join("; ")}`,
      unchecked.map(([name]) => name),
    );
  // Each flag wins over the opposite setting in the config (measured): unhandled errors fail the run, a test
  // without an assertion fails, the tests run rather than only being type-checked, and a snapshot with nothing
  // stored fails instead of being written (outside CI vitest writes it and passes)
  const {
    report: run,
    status,
    out,
    error,
  } = vitest(root, [
    "--config",
    join(root, "vitest.config.ts"),
    "--dangerouslyIgnoreUnhandledErrors=false",
    "--expect.requireAssertions",
    "--typecheck.enabled=false",
    "--update=none",
  ]);
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

function inCI(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/** A range without commits: nothing to check locally; in CI, where every event brings a commit, a wrong range. */
function emptyRange(range: string): Result {
  if (inCI()) return result(CANNOT, `no commit in ${range} in CI`);
  return result(NA, `no commit in ${range}`);
}

/** The commits the branch adds: GATE_BASE..GATE_HEAD in CI, after the merge base with origin/main locally. */
function commitRange(root: string): Result | { range: string } {
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

// The secret scan (G2) of the branch's commits, through the repository's own fail-closed wrapper, inside the one
// gate command: locally the same range CI scans. A branch with no commit of its own is NOT APPLICABLE.
function secrets(root: string): Result {
  const range = commitRange(root);
  if (isResult(range)) return range;
  const count = spawnSync(
    "git",
    ["-C", root, "rev-list", "--count", range.range],
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
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
  if (r.status === PASS)
    return result(
      PASS,
      `${count.stdout.trim()} commit(s) in ${range.range} scanned`,
      out,
    );
  // node also exits 1 on an uncaught error: only the wrapper's own line makes it a finding.
  if (
    r.status === FINDING &&
    !out.some((l) => l.startsWith("FINDING scan-secrets:"))
  )
    return result(CANNOT, "the secret scan exited 1 with no FINDING line", out);
  if (r.status === FINDING)
    return result(FINDING, `secrets in ${range.range}`, out);
  return result(
    CANNOT,
    `the secret scan exited ${r.status ?? errorCode(r.error)}`,
    out,
  );
}

// The commit header the changelog is generated from (method section 7; docs/decisions/001-quality-tooling.md).
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
function headerProblem(h: string): string | null {
  if (!HEADER.test(h))
    return `"${h}": not "<type>(<scope>)?!?: <subject>" with a type of ${TYPES.join(", ")}`;
  if (h.length > MAX_HEADER)
    return `"${h}": ${h.length} characters, more than ${MAX_HEADER}`;
  return null;
}

// Every commit of the branch, merges left out, has a conventional header of at most 100 characters.
function commits(root: string): Result {
  const range = commitRange(root);
  if (isResult(range)) return range;
  const r = spawnSync(
    "git",
    ["-C", root, "log", "--no-merges", "--format=%h %s", range.range],
    { encoding: "utf8", env: childEnv() },
  );
  if (r.status !== 0)
    return result(CANNOT, `git log ${range.range} failed: ${r.stderr.trim()}`);
  const lines = r.stdout.split("\n").filter(Boolean);
  if (!lines.length) return emptyRange(range.range);
  const details = lines.flatMap((l) => {
    const problem = headerProblem(l.slice(l.indexOf(" ") + 1));
    return problem ? [`${l.split(" ")[0]} ${problem}`] : [];
  });
  if (details.length)
    return result(
      FINDING,
      `${details.length} of ${lines.length} commit(s)`,
      details,
    );
  return result(
    PASS,
    `${lines.length} commit(s) in ${range.range}, every header conventional`,
  );
}

// The commit-msg hook's check of one message file. git's own merge header passes; the gate's range check, which
// leaves real merges out, still catches a non-merge commit that only looks like one.
function commitMsg(file: string | undefined): Result {
  let text: string;
  try {
    text = readFileSync(file ?? "", "utf8");
  } catch {
    return result(USAGE, `cannot read the message file ${file ?? ""}`);
  }
  const header =
    text
      .split("\n")
      .find((l) => l.trim() && !l.startsWith("#"))
      ?.trim() ?? "";
  if (!header) return result(FINDING, "the message is empty");
  if (/^Merge /.test(header)) return result(PASS, "a merge header");
  const problem = headerProblem(header);
  return problem ? result(FINDING, problem) : result(PASS, `"${header}"`);
}

const CHECKS: Record<string, Check> = {
  toolchain,
  selftest,
  files,
  lockfile,
  licences,
  text,
  format,
  lint,
  types,
  svelte,
  test,
  dupes,
  commits,
  pins,
  "gate-needs": gateNeeds,
  links,
  actionlint,
  workflows,
  secrets,
};

function report(name: string, r: Result): number {
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} ${name}: ${r.summary}`);
  return r.code === NA ? PASS : r.code;
}

function main(argv: string[]): number {
  const [name, ...rest] = argv;
  if (name === "needs") return report("needs", needs(rest[0]));
  if (name === "commit-msg") return report(name, commitMsg(rest[0]));
  if (name !== "all" && !CHECKS[name])
    return report(
      name ?? "",
      result(
        USAGE,
        `unknown check; use one of all, needs, commit-msg, ${Object.keys(CHECKS).join(", ")}`,
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
  if (name !== "all") return report(name, CHECKS[name](root, list));
  const notApplicable: string[] = [];
  for (const [step, check] of Object.entries(CHECKS)) {
    const r = check(root, list);
    const code = report(step, r);
    if (code !== PASS) return report("all", result(code, `stopped at ${step}`));
    if (r.code === NA) notApplicable.push(step);
  }
  // A step that had nothing to check is counted apart, never as passed.
  const passed = `${Object.keys(CHECKS).length - notApplicable.length} checks passed`;
  return report(
    "all",
    result(
      PASS,
      notApplicable.length
        ? `${passed}, ${notApplicable.length} not applicable: ${notApplicable.join(", ")}`
        : passed,
    ),
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
