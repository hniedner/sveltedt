// Tests for check-repo.ts. Each case builds a small git repository in a temporary folder, plants one break
// and asserts the exit code and the word its last line starts with; a usage case asserts exit 2.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "check-repo.ts");
const LICENSE = readFileSync(join(here, "..", "LICENSE"));
const SHA = "0123456789abcdef0123456789abcdef01234567";
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "check-repo-"));
  made.push(d);
  return d;
}

function put(root: string, path: string, text: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const CI = `on: [pull_request]
jobs:
  static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${SHA} # v1.0.0
  gate:
    needs: [static]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - run: echo done
`;
const REVIEW = `on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/dependency-review-action@${SHA} # v1.0.0
        with:
          allow-licenses: ISC, MIT
`;
const PASSING_TEST = `import { test } from "node:test";\ntest("one", () => {});\n`;
/** The fixture's own tsconfig, read by ESLint's type-aware rules for its TypeScript scripts (Prettier's layout). */
const FIXTURE_TSCONFIG = `{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"]
  },
  "include": ["scripts/**/*.ts"]
}
`;
const NODE_MAJOR = process.versions.node.split(".")[0];
/** A script long enough for jscpd to count it (a file under its 50 tokens is not a source). */
const TOOL = `export function describe(entries) {
  const lines = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    lines.push(key + " = " + String(value).trim());
  }
  return lines.sort().join("\\n");
}
`;
/** TypeScript long enough for jscpd to analyse, and unlike TOOL, so the two are no clone. */
const TOOL_TS = `export function gross(prices: number[], rate: number): number {
  let sum = 0;
  for (const price of prices) {
    if (!Number.isFinite(price) || price < 0) continue;
    sum += price * (1 + rate);
  }
  return Math.round(sum * 100) / 100;
}
`;
interface Pkg {
  name: string;
  private?: boolean;
  license: string;
  packageManager?: string;
  devDependencies: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
/** The real pins: the steps compare them with the installed tools, so a Dependabot bump moves both. */
const PINS = (
  JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as Pkg
).devDependencies;
const PACKAGE: Pkg = {
  name: "@hniedner/sveltedt",
  private: true,
  license: "Apache-2.0",
  packageManager: "pnpm@12.19.0",
  devDependencies: {
    eslint: PINS.eslint,
    jscpd: PINS.jscpd,
    prettier: PINS.prettier,
    typescript: PINS.typescript,
  },
};
const WORKSPACE = "pmOnFail: ignore\nminimumReleaseAge: 4320\n";
const LOCK = "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n";
const DEPENDABOT = `version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    cooldown:
      default-days: 7
  - package-ecosystem: npm
    directory: /
    cooldown:
      default-days: 7
      semver-major-days: 30
      semver-minor-days: 7
      semver-patch-days: 3
`;

/** A repository that passes every check; `change` plants the break before the files are staged. */
function repo(change: (root: string) => void = () => {}): string {
  const root = tempDir();
  const files = {
    "README.md": "# Fixture\n\nSee [the method](docs/engineering/method.md).\n",
    LICENSE,
    NOTICE: "Fixture\nCopyright 2026 R. Hannes Niedner\n",
    "CONTRIBUTING.md": "# Contributing\n",
    "SECURITY.md": "# Security\n",
    ".gitignore": "/tmp/\n/node_modules\n",
    "tsconfig.json": FIXTURE_TSCONFIG,
    ".node-version": `${NODE_MAJOR}.0.0\n`,
    "package.json": `${JSON.stringify(PACKAGE, null, 2)}\n`,
    "pnpm-workspace.yaml": WORKSPACE,
    "pnpm-lock.yaml": LOCK,
    "docs/engineering/method.md":
      "# Method\n\n[Companion](gates.md), [site](https://example.org/a), [top](#method).\n",
    "docs/engineering/gates.md": "# Gates\n",
    "docs/PRD.md": "# Requirements\n",
    "AGENTS.md": "# Agents\n",
    "scripts/actionlint.version": "version 9.9.9\nlinux_amd64_sha256 00\n",
    "scripts/zizmor.version": "version 9.9.9\nlinux_x86_64_sha256 00\n",
    "scripts/check-repo.test.ts": PASSING_TEST,
    "scripts/scan-secrets.ts": TOOL_TS,
    "scripts/scan-secrets.test.ts": PASSING_TEST,
    "scripts/gitleaks.toml": "",
    "scripts/gitleaks.version": "version 9.9.9\n",
    "scripts/tool.mjs": TOOL,
    ".github/workflows/ci.yml": CI,
    ".github/workflows/dependency-review.yml": REVIEW,
    ".github/workflows/scorecard.yml": "on: [push]\n",
    ".github/dependabot.yml": DEPENDABOT,
    ".github/CODEOWNERS": "* @someone\n",
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  // Like a real checkout after `pnpm install`: the TypeScript scripts find Node's types (ignored, never tracked).
  symlinkSync(join(here, "..", "node_modules"), join(root, "node_modules"));
  execFileSync("git", ["init", "-q", root], { env: GIT_ENV });
  commit(root, "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  change(root);
  git(root, "add", "-A");
  return root;
}

/** This process's environment without git's variables: a run inside a git hook must not reach the real repo. */
const GIT_ENV: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);
const git = (root: string, ...args: string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    env: GIT_ENV,
    encoding: "utf8",
  });

/** Commits everything under `root` with a synthetic identity; the fixture runs no hook. */
function commit(root: string, message: string): void {
  git(root, "add", "-A");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.org",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    message,
  );
}

/**
 * A stand-in for actionlint: reports `version`; fails a file holding `nope` (the expression canary); reports SC2086
 * for an unquoted `$FOO` as shellcheck would (the shell canary); fails a file holding `bad`.
 */
function fakeLint({
  version = "9.9.9",
  canary = true,
  shell = true,
  crash = false,
}: {
  version?: string;
  canary?: boolean;
  shell?: boolean;
  crash?: boolean;
} = {}): string {
  const bin = join(tempDir(), "actionlint");
  const script = `#!/bin/sh
if [ "$1" = "-version" ]; then echo "${version}"; exit 0; fi
${crash ? 'case "$*" in *.github*) echo "panic"; exit 3;; esac' : ""}
${canary ? 'if grep -q nope "$@"; then echo "canary found"; exit 1; fi' : ""}
${shell ? 'if grep -q "echo \\$FOO" "$@"; then echo "shellcheck reported issue in this script: SC2086:info:1:6"; exit 1; fi' : ""}
if grep -q bad "$@"; then echo "bad workflow"; exit 1; fi
exit 0
`;
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return bin;
}

/** A stand-in for pnpm: reports `version`; `licenses list --json --recursive` prints `licences`, exits `listExit`. */
function fakePnpm(
  version = "12.19.0",
  licences = '{"MIT":[{"name":"a"}],"ISC":[{"name":"b"}]}',
  listExit = 0,
): string {
  const bin = join(tempDir(), "pnpm");
  writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo "${version}"; exit 0; fi
if [ "$1" = "licenses" ]; then case " $* " in *" --recursive "*) ;; *) exit 2;; esac; echo '${licences}'; exit ${listExit}; fi
exit 2
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

/** A stand-in that only reports its version, as `<name> version` does. */
function fakeVersion(name: string, version: string): string {
  const bin = join(tempDir(), name);
  writeFileSync(bin, `#!/bin/sh\necho "${version}"\n`);
  chmodSync(bin, 0o755);
  return bin;
}

/** A stand-in for zizmor: reports `version`; finds a file holding `canary` (exit 13) or `bad` (exit 12). */
function fakeZizmor({
  version = "9.9.9",
  canary = true,
  crash = "",
}: {
  version?: string;
  canary?: boolean;
  crash?: "" | "canary" | ".github";
} = {}): string {
  const bin = join(tempDir(), "zizmor");
  writeFileSync(
    bin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then echo "zizmor ${version}"; exit 0; fi
case " $* " in *" --offline "*) ;; *) echo "online audits need a token"; exit 2;; esac
${crash ? `case "$*" in *${crash}*) echo "error: broken" >&2; exit 1;; esac` : ""}
files=""; for a in "$@"; do case "$a" in -*|plain) ;; *) files="$files $a";; esac; done
${canary ? 'if grep -q canary $files; then echo "error[dangerous-triggers]"; exit 13; fi' : ""}
if grep -q bad $files; then echo "warning[template-injection]"; exit 12; fi
exit 0
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}

interface RunOptions {
  lint?: string;
  pnpm?: string;
  zizmor?: string;
  gitleaks?: string;
  canaries?: string;
  extraEnv?: Record<string, string>;
}

function run(
  args: string[],
  {
    lint = fakeLint(),
    pnpm = fakePnpm(),
    zizmor = fakeZizmor(),
    gitleaks = fakeVersion("gitleaks", "9.9.9"),
    canaries = undefined,
    extraEnv = {},
  }: RunOptions = {},
): { code: number | null; out: string } {
  const env: NodeJS.ProcessEnv = {
    ...GIT_ENV,
    ACTIONLINT_BIN: lint,
    PNPM_BIN: pnpm,
    ZIZMOR_BIN: zizmor,
    GITLEAKS_BIN: gitleaks,
    ...extraEnv,
  };
  for (const k of ["CANARY_DIR", "GATE_BASE", "GATE_HEAD", "GITHUB_ACTIONS"])
    if (!(k in extraEnv)) delete env[k];
  if (canaries) env.CANARY_DIR = canaries;
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env,
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

/** Runs one check on a repository and asserts its exit code and the word its last line starts with. */
function expect(
  check: string,
  root: string,
  code: number,
  opts?: RunOptions,
): string {
  const r = run([check, "--root", root], opts);
  const word = ["PASS", "FINDING", "", "COULD NOT CHECK"][code];
  assert.equal(r.code, code, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1)!, // split always yields at least one line
    new RegExp(`^${word} ${check}\\b`),
    r.out,
  );
  return r.out;
}

const edit =
  (path: string, from: string, to: string) =>
  (root: string): void => {
    const text = readFileSync(join(root, path), "utf8");
    assert.ok(text.includes(from), `fixture ${path} lacks ${from}`);
    put(root, path, text.replace(from, to));
  };
const remove = (path: string) => (root: string) => rmSync(join(root, path));

test("files: passes on a complete repository", () => {
  expect("files", repo(), 0);
});
test("files: a missing requirements document is a finding", () => {
  assert.match(
    expect("files", repo(remove("docs/PRD.md")), 1),
    /docs\/PRD\.md/,
  );
});
test("files: a missing required file is a finding", () => {
  assert.match(expect("files", repo(remove("SECURITY.md")), 1), /SECURITY\.md/);
});
test("files: a LICENSE that differs by one byte is a finding", () => {
  expect(
    "files",
    repo((root) =>
      put(root, "LICENSE", LICENSE.toString().replace("Apache", "Apachf")),
    ),
    1,
  );
});
test("files: a NOTICE without the copyright line is a finding", () => {
  expect(
    "files",
    repo(edit("NOTICE", "Copyright 2026 R. Hannes Niedner", "Copyright")),
    1,
  );
});
test("files: a .gitignore without /tmp/ is a finding", () => {
  expect("files", repo(edit(".gitignore", "/tmp/", "/other/")), 1);
});
test("files: a folder that is not a git repository cannot be checked", () => {
  expect("files", tempDir(), 3);
});
test("files: a deleted test file is a finding", () => {
  const root = repo((r) => put(r, "scripts/other.test.mjs", PASSING_TEST));
  rmSync(join(root, "scripts/check-repo.test.ts"));
  execFileSync("git", ["-C", root, "add", "-A"]);
  assert.match(expect("files", root, 1), /scripts\/check-repo\.test\.ts/);
});

const pkg = (change: (p: Pkg) => unknown) => (root: string) => {
  const p = structuredClone(PACKAGE);
  change(p);
  put(root, "package.json", `${JSON.stringify(p, null, 2)}\n`);
};

test("toolchain: passes when node's major and pnpm's version match the pins", () => {
  expect("toolchain", repo(), 0);
});
test("toolchain: another node major than .node-version cannot be checked", () => {
  expect(
    "toolchain",
    repo((root) =>
      put(root, ".node-version", `${Number(NODE_MAJOR) - 1}.0.0\n`),
    ),
    3,
  );
});
test("toolchain: another pnpm version than packageManager cannot be checked", () => {
  expect("toolchain", repo(), 3, { pnpm: fakePnpm("12.18.0") });
});
test("toolchain: a package.json that is not JSON cannot be checked", () => {
  const out = expect(
    "toolchain",
    repo((root) => put(root, "package.json", "not json\n")),
    3,
  );
  assert.match(out, /package\.json is missing or not JSON/);
});
test("toolchain: a missing gitleaks cannot be checked", () => {
  // Before selftest, whose secret-scan tests would otherwise report it as failures.
  const out = expect("toolchain", repo(), 3, {
    gitleaks: join(tempDir(), "absent"),
  });
  assert.match(out, /cannot run .*absent/);
});
test("toolchain: a missing pnpm cannot be checked", () => {
  const out = expect("toolchain", repo(), 3, {
    pnpm: join(tempDir(), "absent"),
  });
  assert.match(out, /cannot run .*absent: ENOENT/);
});
test("toolchain: a package.json without a pnpm packageManager pin is a finding", () => {
  expect("toolchain", repo(pkg((p) => delete p.packageManager)), 1);
});

test("lockfile: passes on one lockfile document, exact versions, nothing shipped and one release age", () => {
  expect("lockfile", repo(), 0);
});
test("lockfile: svelte as the only peer passes", () => {
  expect(
    "lockfile",
    repo(pkg((p) => (p.peerDependencies = { svelte: "^5.20.0" }))),
    0,
  );
});
test("lockfile: a missing lockfile is a finding", () => {
  expect("lockfile", repo(remove("pnpm-lock.yaml")), 1);
});
test("lockfile: a lockfile of two YAML documents is a finding", () => {
  expect(
    "lockfile",
    repo((root) =>
      put(root, "pnpm-lock.yaml", `---\nlockfileVersion: '9.0'\n---\n${LOCK}`),
    ),
    1,
  );
});
test("lockfile: a version range in devDependencies is a finding", () => {
  assert.match(
    expect(
      "lockfile",
      repo(pkg((p) => (p.devDependencies.prettier = "^3.9.10"))),
      1,
    ),
    /prettier/,
  );
});
test("lockfile: a runtime dependency is a finding", () => {
  expect(
    "lockfile",
    repo(pkg((p) => (p.dependencies = { "left-pad": "1.3.0" }))),
    1,
  );
});
test("lockfile: a peer other than svelte is a finding", () => {
  expect(
    "lockfile",
    repo(
      pkg(
        (p) => (p.peerDependencies = { svelte: "^5.20.0", react: "^19.0.0" }),
      ),
    ),
    1,
  );
});
test("lockfile: a release age that differs from Dependabot's shortest npm cooldown is a finding", () => {
  expect("lockfile", repo(edit("pnpm-workspace.yaml", "4320", "10080")), 1);
});
test("lockfile: a shorter Dependabot npm cooldown than the release age is a finding", () => {
  expect(
    "lockfile",
    repo(
      edit(
        ".github/dependabot.yml",
        "semver-patch-days: 3",
        "semver-patch-days: 1",
      ),
    ),
    1,
  );
});
test("lockfile: no release age is a finding", () => {
  expect(
    "lockfile",
    repo(edit("pnpm-workspace.yaml", "minimumReleaseAge: 4320\n", "")),
    1,
  );
});
test("lockfile: a release-age exception without an advisory id is a finding", () => {
  expect(
    "lockfile",
    repo(
      edit(
        "pnpm-workspace.yaml",
        "pmOnFail",
        "minimumReleaseAgeExclude:\n  - prettier@3.9.11\npmOnFail",
      ),
    ),
    1,
  );
});
test("lockfile: a release-age exception naming its advisory passes", () => {
  const exclude =
    "minimumReleaseAgeExclude:\n  - prettier@3.9.11 # GHSA-c2f3-h4j5-m6p7\npmOnFail";
  expect("lockfile", repo(edit("pnpm-workspace.yaml", "pmOnFail", exclude)), 0);
});
/** The fixture's pnpm-workspace.yaml with `lines` before its first setting. */
const workspace = (lines: string) =>
  edit("pnpm-workspace.yaml", "pmOnFail", `${lines}\npmOnFail`);
const GHSA = "# GHSA-c2f3-h4j5-m6p7";
test("lockfile: a release-age exception without a version is a finding", () => {
  // A bare name exempts every later release of the package from the age limit.
  const bare = workspace(`minimumReleaseAgeExclude:\n  - prettier ${GHSA}`);
  assert.match(expect("lockfile", repo(bare), 1), /prettier/);
});
test("lockfile: a release-age exception after a comment line is still checked", () => {
  const commented = workspace(
    `minimumReleaseAgeExclude:\n  # a reason\n  - prettier@3.9.11`,
  );
  expect("lockfile", repo(commented), 1);
});
test("lockfile: release-age exceptions in flow style are a finding", () => {
  const flow = workspace(`minimumReleaseAgeExclude: [prettier@3.9.11] ${GHSA}`);
  expect("lockfile", repo(flow), 1);
});
/** The fixture's lockfile with one package resolved by `resolution`. */
const lockWith = (resolution: string) => (root: string) =>
  put(
    root,
    "pnpm-lock.yaml",
    `${LOCK}\npackages:\n\n  x@1.0.0:\n    resolution: ${resolution}\n`,
  );
test("lockfile: a package resolved from the registry by hash passes, from anywhere else is a finding", () => {
  expect("lockfile", repo(lockWith("{integrity: sha512-AA==}")), 0);
  const tarball = lockWith(
    "{tarball: https://example.org/x.tgz, integrity: sha512-AA==}",
  );
  assert.match(
    expect("lockfile", repo(tarball), 1),
    /not a registry package by hash/,
  );
});
test("lockfile: a Dependabot config without an npm cooldown is a finding that says so", () => {
  const none = (root: string) =>
    put(root, ".github/dependabot.yml", "version: 2\nupdates: []\n");
  assert.match(expect("lockfile", repo(none), 1), /no npm cooldown/);
});
test("lockfile: optional and bundled dependencies would ship", () => {
  const shipped = pkg((p) =>
    Object.assign(p, {
      optionalDependencies: { a: "1.0.0" },
      bundledDependencies: ["b"],
    }),
  );
  const out = expect("lockfile", repo(shipped), 1);
  assert.match(out, /optionalDependencies: a/);
  assert.match(out, /bundledDependencies: b/);
});
test("lockfile: a package.json not marked private is a finding", () => {
  // Until the packaging pull request, a stray publish must fail on the manifest.
  expect("lockfile", repo(pkg((p) => delete p.private)), 1);
});
test("files: a required file on disk but not tracked is a finding", () => {
  const root = repo();
  git(root, "rm", "-q", "--cached", "SECURITY.md"); // CI sees only tracked files
  assert.match(expect("files", root, 1), /missing: SECURITY\.md/);
});
test("files: a missing pin of a pinned program is a finding", () => {
  const out = expect("files", repo(remove("scripts/zizmor.version")), 1);
  assert.match(out, /missing: scripts\/zizmor\.version/);
});
test("lockfile: a package.json that is not JSON cannot be checked", () => {
  expect(
    "lockfile",
    repo((root) => put(root, "package.json", "{ nope")),
    3,
  );
});

test("text: passes when every classified file has LF endings, a final newline and no trailing whitespace", () => {
  expect("text", repo(), 0);
});
test("text: trailing whitespace is a finding that names the line", () => {
  assert.match(
    expect("text", repo(edit("NOTICE", "Fixture\n", "Fixture \n")), 1),
    /NOTICE:1/,
  );
});
test("text: a CRLF line ending is a finding", () => {
  expect("text", repo(edit(".gitignore", "/tmp/\n", "/tmp/\r\n")), 1);
});
test("text: a missing final newline is a finding", () => {
  expect(
    "text",
    repo((root) => put(root, ".node-version", `${NODE_MAJOR}.0.0`)),
    1,
  );
});
test("text: an opening or a closing merge-conflict marker is a finding", () => {
  for (const marker of ["<<<<<<< ours", ">>>>>>> theirs"])
    expect(
      "text",
      repo(edit("NOTICE", "Fixture\n", `${marker}\nFixture\n`)),
      1,
    );
});
test("format: the owner-approved requirements are never reformatted", () => {
  // The PRD changes only through its owner; the text step checks it instead.
  const unformatted = (root: string) =>
    put(root, "docs/PRD.md", "#   Requirements\n");
  expect("format", repo(unformatted), 0);
});
test("format: a spec file is never reformatted, and text still checks it", () => {
  expect(
    "format",
    repo((root) => put(root, "spec/a.md", "#   Spec\n")),
    0,
  );
  expect(
    "text",
    repo((root) => put(root, "spec/a.md", "# Spec \n")),
    1,
  );
});
test("text: the owner-approved method text is still checked", () => {
  expect(
    "text",
    repo(edit("docs/engineering/gates.md", "# Gates\n", "# Gates \n")),
    1,
  );
});
test("text: the generated lockfile is classified as not checked", () => {
  expect("text", repo(edit("pnpm-lock.yaml", "  .: {}\n", "  .: {} \n")), 0);
});
test("text: a conflict marker in a file of another class is a finding that names it", () => {
  // Markdown is only formatted, and Prettier keeps a conflict marker in it as text.
  const marked = (root: string) =>
    put(root, "CONTRIBUTING.md", "# Contributing\n\n<<<<<<< HEAD\n");
  assert.match(
    expect("text", repo(marked), 1),
    /CONTRIBUTING\.md:3: merge-conflict marker/,
  );
});
test("text: a repository without a file of its class cannot be checked", () => {
  const out = expect(
    "text",
    repo((root) =>
      [
        "LICENSE",
        "NOTICE",
        ".gitignore",
        "node_modules", // the link .gitignore kept untracked
        ".node-version",
        ".github/CODEOWNERS",
        "docs/engineering/method.md",
        "docs/engineering/gates.md",
        "docs/PRD.md",
        "scripts/actionlint.version",
        "scripts/zizmor.version",
        "scripts/gitleaks.version",
        "scripts/gitleaks.toml",
      ].forEach((f) => rmSync(join(root, f))),
    ),
    3,
  );
  assert.match(out, /no file to check/);
});
test("text: a tracked file of no known class cannot be checked, and names the file", () => {
  assert.match(
    expect(
      "text",
      repo((root) => put(root, "Makefile", "all:\n")),
      3,
    ),
    /Makefile/,
  );
});

/** A canary folder holding `files` (name -> text) for `step`, laid out as the steps read it: <dir>/<step>/<file>. */
function canaryDir(step: string, files: Record<string, string>): string {
  const dir = tempDir();
  for (const [name, t] of Object.entries(files)) put(dir, join(step, name), t);
  return dir;
}

// A tool that fails, on the canaries or on the repository, cannot have checked: the step says so and stops.
// Prettier fails on a package.json whose `prettier` key names a shared config that does not exist.
const BROKEN_PRETTIER = '{ "prettier": "./absent-config.json" }\n';
test("format: a Prettier that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("format", {
    "canary.md": "#   Unformatted\n",
    "package.json": BROKEN_PRETTIER,
  });
  assert.match(
    expect("format", repo(), 3, { canaries: dir }),
    /prettier probe failed/,
  );
});
test("format: a Prettier that fails on the repository cannot be checked", () => {
  const broken = pkg((p) => Object.assign(p, JSON.parse(BROKEN_PRETTIER)));
  assert.match(expect("format", repo(broken), 3), /prettier probe failed/);
});
// ESLint throws when a name it is given matches no file: an empty folder, or a link to a file that is gone.
test("lint: an ESLint that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("lint", { "canary.mjs": "x\n" });
  mkdirSync(join(dir, "lint", "empty"));
  assert.match(
    expect("lint", repo(), 3, { canaries: dir }),
    /eslint probe failed/,
  );
});
test("lint: an ESLint that fails on the repository cannot be checked", () => {
  const broken = (root: string) =>
    symlinkSync("gone.mjs", join(root, "scripts", "link.mjs"));
  assert.match(expect("lint", repo(broken), 3), /eslint probe failed/);
});
// Prettier and ESLint skip a file under a node_modules folder; only the root one is git-ignored, so one can be tracked.
const UNDER_NODE_MODULES = "docs/node_modules/note";
test("format: a file Prettier leaves out cannot be checked", () => {
  const out = expect(
    "format",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.md`, "# Note\n")),
    3,
  );
  assert.match(out, /Prettier did not check 1 file/);
});
test("lint: a file ESLint leaves out cannot be checked", () => {
  const out = expect(
    "lint",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.mjs`, TOOL)),
    3,
  );
  assert.match(out, /ESLint did not lint every file/);
});
test("format: passes when Prettier finds its canaries and every file of its class is formatted", () => {
  expect("format", repo(), 0);
});
test("format: an unformatted Markdown file is a finding that names it", () => {
  const bad = edit("CONTRIBUTING.md", "# Contributing\n", "#   Contributing\n");
  assert.match(expect("format", repo(bad), 1), /CONTRIBUTING\.md/);
});
test("format: an unformatted JSON file is a finding", () => {
  expect(
    "format",
    repo((root) => put(root, "data.json", '{"a":1}\n')),
    1,
  );
});
test("format: a YAML file Prettier cannot parse is a finding", () => {
  const broken = "on: [pull_request\n";
  expect(
    "format",
    repo((root) => put(root, ".github/workflows/scorecard.yml", broken)),
    1,
  );
});
test("format: the owner-approved method text is not reformatted", () => {
  expect(
    "format",
    repo(edit("docs/engineering/gates.md", "# Gates\n", "#   Gates\n")),
    0,
  );
});
test("format: a tracked file of no known class cannot be checked", () => {
  expect(
    "format",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
test("format: another Prettier version than the pin cannot be checked", () => {
  expect("format", repo(pkg((p) => (p.devDependencies.prettier = "3.0.0"))), 3);
});
test("format: a canary that Prettier accepts cannot be checked", () => {
  const formatted = canaryDir("format", { "canary.md": "# Formatted\n" });
  const out = expect("format", repo(), 3, { canaries: formatted });
  assert.match(out, /Prettier passed a planted canary/);
});
test("format: a missing canary folder cannot be checked", () => {
  expect("format", repo(), 3, { canaries: join(tempDir(), "absent") });
});

const script = (body: string) => (root: string) =>
  put(root, "scripts/x.mjs", body);
const BRANCHES = Array.from(
  { length: 21 },
  (_, i) => `  if (a === ${i}) return ${i};`,
).join("\n");

test("lint: passes when ESLint fails its canaries and accepts every script", () => {
  expect("lint", repo(script("export const one = 1;\n")), 0);
});
test("lint: eval is a finding that names the rule", () => {
  assert.match(
    expect("lint", repo(script('export const x = eval("1");\n')), 1),
    /no-eval/,
  );
});
test("lint: an undefined global is a finding", () => {
  assert.match(
    expect("lint", repo(script("export const x = nope;\n")), 1),
    /no-undef/,
  );
});
test("lint: a function over the complexity limit is a finding", () => {
  const body = `export function f(a) {\n${BRANCHES}\n  return -1;\n}\n`;
  assert.match(expect("lint", repo(script(body)), 1), /complexity/);
});
test("lint: an unused disable directive is a finding", () => {
  expect(
    "lint",
    repo(
      script("// eslint-disable-next-line no-eval\nexport const one = 1;\n"),
    ),
    1,
  );
});
test("lint: another ESLint version than the pin cannot be checked", () => {
  expect("lint", repo(pkg((p) => (p.devDependencies.eslint = "9.0.0"))), 3);
});
test("lint: a canary that ESLint accepts cannot be checked", () => {
  const clean = canaryDir("lint", {
    "canary.mjs": "export const one = 1;\n",
    "canary.ts": "export const one = 1;\n",
  });
  const out = expect("lint", repo(), 3, { canaries: clean });
  assert.match(out, /ESLint missed planted canaries/);
});
test("lint: a tracked file of no known class cannot be checked", () => {
  expect(
    "lint",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
const tsScript =
  (body: string) =>
  (root: string): void =>
    put(root, "scripts/y.ts", body);
test("lint: an explicit any in a TypeScript script is a finding that names the rule", () => {
  const out = expect("lint", repo(tsScript("export const v: any = 1;\n")), 1);
  assert.match(out, /@typescript-eslint\/no-explicit-any/);
});
test("lint: a floating promise in a TypeScript script is a finding (type-aware)", () => {
  const body =
    "export async function f(): Promise<void> {\n  Promise.resolve(1);\n}\n";
  assert.match(expect("lint", repo(tsScript(body)), 1), /no-floating-promises/);
});
test("lint: eval in a TypeScript script is a finding", () => {
  expect("lint", repo(tsScript('export const x: unknown = eval("1");\n')), 1);
});
test("lint: a canary folder without a TypeScript canary cannot be checked", () => {
  const onlyMjs = canaryDir("lint", {
    "canary.mjs": readFileSync(
      join(here, "canaries", "lint", "canary.mjs"),
      "utf8",
    ),
  });
  const out = expect("lint", repo(), 3, { canaries: onlyMjs });
  assert.match(out, /no canary for \.ts/);
});

/** A function of about 60 tokens, to plant as a clone. */
const BLOCK = `export function total(items) {
  let sum = 0;
  for (const item of items) {
    if (item.price > 0 && item.count > 0) {
      sum += item.price * item.count;
    }
  }
  return Math.round(sum * 100) / 100;
}
`;

test("dupes: passes when jscpd finds its canary clone and no clone in the scripts", () => {
  expect("dupes", repo(), 0);
});
test("dupes: a block repeated in two scripts is a finding that names both", () => {
  const twice = (root: string) => {
    put(root, "scripts/a.mjs", BLOCK);
    put(root, "scripts/b.mjs", BLOCK);
  };
  const out = expect("dupes", repo(twice), 1);
  assert.match(out, /scripts\/a\.mjs/);
  assert.match(out, /scripts\/b\.mjs/);
});
test("dupes: a block repeated in test files is not a finding", () => {
  const twice = (root: string) => {
    put(root, "scripts/a.test.mjs", BLOCK);
    put(root, "scripts/b.test.mjs", BLOCK);
  };
  expect("dupes", repo(twice), 0);
});
// jscpd fails on a name it reads as an option, and on a link to a file that is gone.
test("dupes: a jscpd that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("dupes", {
    "-a.mjs": BLOCK,
    "b.mjs": BLOCK,
    "a.ts": TS_BLOCK,
    "b.ts": TS_BLOCK,
  });
  assert.match(
    expect("dupes", repo(), 3, { canaries: dir }),
    /jscpd exited|no jscpd report/,
  );
});
test("dupes: a jscpd that fails on the repository cannot be checked", () => {
  const broken = (root: string) =>
    symlinkSync("gone.mjs", join(root, "scripts", "link.mjs"));
  assert.match(
    expect("dupes", repo(broken), 3),
    /jscpd exited|no jscpd report/,
  );
});
test("dupes: a file jscpd does not analyse cannot be checked", () => {
  // Under jscpd's 50 tokens: it is left out of the report like a file over its size limit.
  const short = (root: string) =>
    put(root, "scripts/short.mjs", "export const one = 1;\n");
  const out = expect("dupes", repo(short), 3);
  assert.match(out, /jscpd analysed 2 of 3 file\(s\)/);
});
test("dupes: another jscpd version than the pin cannot be checked", () => {
  expect("dupes", repo(pkg((p) => (p.devDependencies.jscpd = "4.0.0"))), 3);
});
test("dupes: a canary pair without a clone cannot be checked", () => {
  const apart = canaryDir("dupes", {
    "a.mjs": BLOCK,
    "b.mjs": "export const one = 1;\n",
  });
  const out = expect("dupes", repo(), 3, { canaries: apart });
  assert.match(out, /jscpd missed the planted clone/);
});
test("dupes: a tracked file of no known class cannot be checked", () => {
  expect(
    "dupes",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
const TS_BLOCK = BLOCK.replace(
  "(items)",
  "(items: { price: number; count: number }[])",
);
test("dupes: a block repeated in two TypeScript scripts is a finding", () => {
  const twice = (root: string): void => {
    put(root, "scripts/a.ts", TS_BLOCK);
    put(root, "scripts/b.ts", TS_BLOCK);
  };
  const out = expect("dupes", repo(twice), 1);
  assert.match(out, /scripts\/a\.ts/);
});
test("dupes: a block repeated in TypeScript test files is not a finding", () => {
  const twice = (root: string): void => {
    put(root, "scripts/a.test.ts", TS_BLOCK);
    put(root, "scripts/b.test.ts", TS_BLOCK);
  };
  expect("dupes", repo(twice), 0);
});
test("dupes: a canary folder without a TypeScript pair cannot be checked", () => {
  const onlyMjs = canaryDir("dupes", { "a.mjs": BLOCK, "b.mjs": BLOCK });
  const out = expect("dupes", repo(), 3, { canaries: onlyMjs });
  assert.match(out, /no canary pair for \.ts/);
});

test("types: passes when tsc fails its canary and the scripts type-check", () => {
  expect("types", repo(), 0);
});
test("types: a type error in a script is a finding that names the file", () => {
  const bad = (root: string): void =>
    put(root, "scripts/y.ts", 'export const n: number = "one";\n');
  assert.match(expect("types", repo(bad), 1), /scripts\/y\.ts/);
});
test("types: a TypeScript file outside tsconfig.json cannot be checked", () => {
  const outside = (root: string): void =>
    put(root, "tools/z.ts", "export const one = 1;\n");
  assert.match(expect("types", repo(outside), 3), /tools\/z\.ts/);
});
test("types: a repository without tsconfig.json cannot be checked", () => {
  const out = expect("types", repo(remove("tsconfig.json")), 3);
  assert.match(out, /tsc could not read/);
});
test("types: another TypeScript version than the pin cannot be checked", () => {
  expect(
    "types",
    repo(pkg((p) => (p.devDependencies.typescript = "5.0.0"))),
    3,
  );
});
test("types: a canary that tsc accepts cannot be checked", () => {
  const clean = canaryDir("types", {
    "canary.ts": "export const one = 1;\n",
    "tsconfig.json":
      '{ "compilerOptions": { "strict": true, "noEmit": true } }\n',
  });
  const out = expect("types", repo(), 3, { canaries: clean });
  assert.match(out, /tsc did not report the planted type error/);
});
test("types: a canary project that is not strict cannot be checked", () => {
  const loose = canaryDir("types", {
    "canary.ts":
      'export const n: number = "one";\nexport function same(x) {\n  return x;\n}\n',
    "tsconfig.json":
      '{ "compilerOptions": { "strict": false, "noEmit": true } }\n',
  });
  const out = expect("types", repo(), 3, { canaries: loose });
  assert.match(out, /TS7006/);
});
test("types: a canary tsc fails for another reason cannot be checked", () => {
  // A canary config listing no file makes tsc exit non-zero without ever reading the planted error.
  const broken = canaryDir("types", {
    "canary.ts": 'export const n: number = "one";\n',
    "tsconfig.json": '{ "files": [] }\n',
  });
  const out = expect("types", repo(), 3, { canaries: broken });
  assert.match(out, /tsc did not report the planted type error/);
});

/** A fixture whose branch holds one commit per subject after origin/main. */
function branch(...subjects: string[]): string {
  const root = repo();
  subjects.forEach((s, i) => {
    put(root, `notes/${i}.md`, `# Note ${i}\n`);
    commit(root, s);
  });
  return root;
}
/** The repository's own scan-secrets wrapper, replaced by one that prints its arguments and exits with `code`. */
const fakeScan =
  (code: number) =>
  (root: string): void =>
    put(
      root,
      "scripts/scan-secrets.ts",
      `console.log("scan-secrets " + process.argv.slice(2).join(" "));\n${code === 1 ? 'console.log("FINDING scan-secrets: 1 leak(s)");\n' : ""}process.exitCode = ${code};\n`,
    );
const notApplicable = (args: string[], opts?: RunOptions): void => {
  const r = run(args, opts);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1) ?? "",
    /^NOT APPLICABLE /,
    r.out,
  );
};
function scanBranch(code: number): string {
  const root = branch("feat: a commit to scan");
  fakeScan(code)(root);
  commit(root, "test: plant the fake scan wrapper");
  return root;
}

test("secrets: passes when the wrapper passes the branch's range, and names it", () => {
  assert.match(
    expect("secrets", scanBranch(0), 0),
    /scan-secrets git \S+ [0-9a-f]{40}\.\.HEAD/,
  );
});
test("secrets: a finding of the wrapper is a finding", () => {
  assert.match(expect("secrets", scanBranch(1), 1), /^ {2}scan-secrets git /m);
});
test("secrets: a wrapper that could not check cannot be checked", () => {
  expect("secrets", scanBranch(3), 3);
});
test("secrets: a branch with no commit after origin/main is not applicable", () => {
  notApplicable(["secrets", "--root", repo()]);
});
test("secrets: a repository without origin/main cannot be checked", () => {
  const root = scanBranch(0);
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  expect("secrets", root, 3);
});
test("secrets: CI's range from GATE_BASE and GATE_HEAD is the one scanned", () => {
  const root = scanBranch(0);
  const base = git(root, "rev-parse", "HEAD~1").trim();
  const out = expect("secrets", root, 0, {
    extraEnv: { GATE_BASE: base, GATE_HEAD: "HEAD" },
  });
  assert.ok(out.includes(`${base}..HEAD`), out);
});
test("secrets: a GATE_BASE of all zeros cannot be checked", () => {
  const root = scanBranch(0);
  const out = expect("secrets", root, 3, {
    extraEnv: { GATE_BASE: "0".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /all zeros/);
});
test("secrets: a GATE_BASE git does not know cannot be checked", () => {
  const out = expect("secrets", scanBranch(0), 3, {
    extraEnv: { GATE_BASE: "1".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /git cannot read the range/);
});
test("secrets: in CI, a missing GATE_BASE cannot be checked (no fallback to the local range)", () => {
  const out = expect("secrets", scanBranch(0), 3, {
    extraEnv: { GITHUB_ACTIONS: "true" },
  });
  assert.match(out, /GATE_BASE/);
});
test("secrets: in CI, an empty range cannot be checked, never NOT APPLICABLE", () => {
  const root = scanBranch(0);
  expect("secrets", root, 3, {
    extraEnv: { GITHUB_ACTIONS: "true", GATE_BASE: "HEAD", GATE_HEAD: "HEAD" },
  });
});

test("workflows: passes when the pinned zizmor flags its canary and finds nothing in the workflows", () => {
  expect("workflows", repo(), 0);
});
test("workflows: a workflow zizmor reports is a finding", () => {
  const out = expect(
    "workflows",
    repo(edit(".github/workflows/ci.yml", "echo done", "echo bad")),
    1,
  );
  assert.match(out, /warning\[template-injection\]/);
});
test("workflows: another zizmor version than the pinned one cannot be checked", () => {
  expect("workflows", repo(), 3, { zizmor: fakeZizmor({ version: "1.0.0" }) });
});
test("workflows: a zizmor that misses the canary cannot be checked", () => {
  expect("workflows", repo(), 3, { zizmor: fakeZizmor({ canary: false }) });
});
test("workflows: a zizmor that fails with an error cannot be checked", () => {
  for (const crash of ["canary", ".github"] as const)
    assert.match(
      expect("workflows", repo(), 3, { zizmor: fakeZizmor({ crash }) }),
      /error: broken/,
    );
});
test("workflows: a repository without a workflow file cannot be checked", () => {
  const out = expect(
    "workflows",
    repo((root) =>
      rmSync(join(root, ".github/workflows"), { recursive: true }),
    ),
    3,
  );
  assert.match(out, /no workflow file/);
});
test("workflows: a missing zizmor cannot be checked", () => {
  expect("workflows", repo(), 3, { zizmor: join(tempDir(), "absent") });
});

test("pins: passes when every action is pinned by a full SHA with its tag", () => {
  expect("pins", repo(), 0);
});
test("pins: a tag instead of a SHA is a finding", () => {
  assert.match(
    expect(
      "pins",
      repo(edit(".github/workflows/ci.yml", `@${SHA} # v1.0.0`, "@v4")),
      1,
    ),
    /ci\.yml:6/,
  );
});
test("pins: a shortened commit hash is a finding", () => {
  expect(
    "pins",
    repo(edit(".github/workflows/ci.yml", `@${SHA}`, `@${SHA.slice(0, 7)}`)),
    1,
  );
});
test("pins: a SHA without its tag comment is a finding", () => {
  expect("pins", repo(edit(".github/workflows/ci.yml", " # v1.0.0", "")), 1);
});
test("pins: a .yaml file outside the workflows folder is read too", () => {
  expect(
    "pins",
    repo((root) =>
      put(root, ".github/actions/x/action.yaml", "steps:\n  - uses: a/b@v1\n"),
    ),
    1,
  );
});
test("pins: a local or docker action is a finding", () => {
  expect(
    "pins",
    repo(
      edit(
        ".github/workflows/ci.yml",
        `actions/checkout@${SHA} # v1.0.0`,
        "./local",
      ),
    ),
    1,
  );
});
test("pins: a workflow whose only uses line is a comment cannot be checked", () => {
  expect(
    "pins",
    repo((root) =>
      [
        ".github/workflows/ci.yml",
        ".github/workflows/dependency-review.yml",
      ].forEach((w) => edit(w, "- uses:", "# - uses:")(root)),
    ),
    3,
  );
});
test("pins: a repository without workflow files cannot be checked", () => {
  expect(
    "pins",
    repo((root) =>
      rmSync(join(root, ".github/workflows"), { recursive: true }),
    ),
    3,
  );
});

test("gate-needs: passes when gate always runs and needs every other job", () => {
  expect("gate-needs", repo(), 0);
});
test("gate-needs: a job missing from gate's needs is a finding", () => {
  const more = CI.replace(
    "  gate:",
    "  extra:\n    runs-on: ubuntu-latest\n  gate:",
  );
  assert.match(
    expect(
      "gate-needs",
      repo((root) => put(root, ".github/workflows/ci.yml", more)),
      1,
    ),
    /extra/,
  );
});
test("gate-needs: a gate without `if: always()` is a finding", () => {
  expect(
    "gate-needs",
    repo(edit(".github/workflows/ci.yml", "    if: always()\n", "")),
    1,
  );
});
test("gate-needs: a workflow without a gate job is a finding", () => {
  expect(
    "gate-needs",
    repo(edit(".github/workflows/ci.yml", "  gate:", "  other:")),
    1,
  );
});
test("gate-needs: an untracked ci.yml cannot be checked", () => {
  const out = expect("gate-needs", repo(remove(".github/workflows/ci.yml")), 3);
  assert.match(out, /is not tracked/);
});
test("gate-needs: a ci.yml without a top-level jobs line cannot be checked", () => {
  const out = expect(
    "gate-needs",
    repo((root) => put(root, ".github/workflows/ci.yml", "on: [push]\n")),
    3,
  );
  assert.match(out, /no top-level jobs: line/);
});
test("gate-needs: a ci.yml whose jobs line holds no job cannot be checked", () => {
  const out = expect(
    "gate-needs",
    repo((root) =>
      put(root, ".github/workflows/ci.yml", "on: [push]\njobs:\n"),
    ),
    3,
  );
  assert.match(out, /no job found under jobs:/);
});
test("gate-needs: needs written as a block list cannot be checked", () => {
  expect(
    "gate-needs",
    repo(
      edit(
        ".github/workflows/ci.yml",
        "needs: [static]",
        "needs:\n      - static",
      ),
    ),
    3,
  );
});

test("links: passes when every relative link resolves", () => {
  expect("links", repo(), 0);
});
test("links: a link to a missing file is a finding", () => {
  assert.match(
    expect(
      "links",
      repo(edit("README.md", "docs/engineering/method.md", "docs/missing.md")),
      1,
    ),
    /README\.md:3/,
  );
});
test("links: a link to an untracked file is a finding", () => {
  const root = repo();
  put(root, "local-note.md", "# Local\n");
  put(root, "README.md", "See [a note](local-note.md).\n");
  execFileSync("git", ["-C", root, "add", "README.md"]);
  expect("links", root, 1);
});
test("links: a repository without any relative link cannot be checked", () => {
  const none = (root: string) =>
    ["README.md", "docs/engineering/method.md"].forEach((f) =>
      put(root, f, "# No links\n"),
    );
  expect("links", repo(none), 3);
});

test("actionlint: passes when the pinned binary finds the canary and accepts the workflows", () => {
  expect("actionlint", repo(), 0);
});
test("actionlint: a workflow the linter rejects is a finding", () => {
  const out = expect(
    "actionlint",
    repo(edit(".github/workflows/ci.yml", "echo done", "echo bad")),
    1,
  );
  assert.match(out, /bad workflow/);
});
test("actionlint: another version than the pinned one cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: fakeLint({ version: "1.0.0" }) });
});
test("actionlint: a linter that misses the canary cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: fakeLint({ canary: false }) });
});
test("actionlint: a version file without a version line cannot be checked", () => {
  const out = expect(
    "actionlint",
    repo((root) =>
      put(root, "scripts/actionlint.version", "linux_amd64_sha256 00\n"),
    ),
    3,
  );
  assert.match(out, /holds no line `version <x>`/);
});
test("actionlint: a repository without a workflow file cannot be checked", () => {
  const out = expect(
    "actionlint",
    repo((root) =>
      rmSync(join(root, ".github/workflows"), { recursive: true }),
    ),
    3,
  );
  assert.match(out, /no workflow file/);
});
test("actionlint: a linter that crashes on the workflows cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: fakeLint({ crash: true }) });
});
test("actionlint: a missing binary cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: join(tempDir(), "absent") });
});
test("actionlint: a linter that does not run shellcheck cannot be checked", () => {
  const out = expect("actionlint", repo(), 3, {
    lint: fakeLint({ shell: false }),
  });
  assert.match(out, /did not report SC2086/);
});

test("selftest: passes when the repository's own tests run and pass", () => {
  expect("selftest", repo(), 0);
});
test("selftest: a failing test is a finding", () => {
  const failing = PASSING_TEST.replace(
    "() => {}",
    '() => { throw new Error("planted"); }',
  );
  expect(
    "selftest",
    repo((root) => put(root, "scripts/check-repo.test.ts", failing)),
    1,
  );
});
test("selftest: a test file that holds no test cannot be checked", () => {
  expect(
    "selftest",
    repo((root) => put(root, "scripts/check-repo.test.ts", "// empty\n")),
    3,
  );
});
test("selftest: a repository without any test file cannot be checked", () => {
  const none = (root: string): void =>
    ["scripts/check-repo.test.ts", "scripts/scan-secrets.test.ts"].forEach(
      (f) => rmSync(join(root, f)),
    );
  expect("selftest", repo(none), 3);
});
test("selftest: every test file runs and is named with its count", () => {
  const out = expect(
    "selftest",
    repo((root) => put(root, "scripts/other.test.mjs", PASSING_TEST)),
    0,
  );
  assert.match(out, /scripts\/check-repo\.test\.ts: 1\b/);
  assert.match(out, /scripts\/other\.test\.mjs: 1\b/);
});
test("selftest: a failing second test file is a finding", () => {
  const failing = PASSING_TEST.replace(
    "() => {}",
    '() => { throw new Error("planted"); }',
  );
  expect(
    "selftest",
    repo((root) => put(root, "scripts/other.test.mjs", failing)),
    1,
  );
});
test("selftest: a second test file that holds no test cannot be checked", () => {
  expect(
    "selftest",
    repo((root) => put(root, "scripts/other.test.mjs", "// empty\n")),
    3,
  );
});

const needs = (json: string, code: number) => {
  const r = run(["needs", json]);
  assert.equal(r.code, code, r.out);
  assert.match(
    r.out,
    new RegExp(
      `^${["PASS", "FINDING", "", "COULD NOT CHECK"][code]} needs\\b`,
      "m",
    ),
  );
};
test("needs: passes when every job succeeded", () => {
  needs('{"static":{"result":"success"},"test":{"result":"success"}}', 0);
});
test("needs: a failed job is a finding", () => {
  needs('{"static":{"result":"failure"},"test":{"result":"skipped"}}', 1);
});
test("needs: a skipped or cancelled job cannot be checked", () => {
  needs('{"static":{"result":"success"},"test":{"result":"skipped"}}', 3);
  needs('{"static":{"result":"cancelled"}}', 3);
});
test("needs: an empty or unreadable list cannot be checked", () => {
  needs("{}", 3);
  needs("not json", 3);
});

test("all: passes when every step passes, and counts a step that was not applicable apart", () => {
  // The fixture has no commit after origin/main, so the secrets step has nothing to scan.
  const out = expect("all", repo(), 0);
  assert.match(out, /^PASS all: 15 checks passed, 1 not applicable: secrets$/m);
});
test("all: returns the failing step's finding and names the step", () => {
  const out = expect(
    "all",
    repo(edit("README.md", "docs/engineering/method.md", "docs/missing.md")),
    1,
  );
  assert.match(out, /^FINDING links\b/m);
});
test("all: returns could-not-check from a step that could not check", () => {
  const out = expect("all", repo(), 3, { pnpm: fakePnpm("1.0.0") });
  assert.match(out, /^COULD NOT CHECK toolchain\b/m);
  assert.match(out, /stopped at toolchain/);
});
test("text: a tracked file deleted without git rm is left out, not a crash", () => {
  const root = repo();
  rmSync(join(root, "NOTICE")); // still listed by git ls-files
  expect("text", root, 0);
});
test("text: a seven-equals heading underline is not a conflict marker", () => {
  // Prettier keeps a setext heading, so Markdown can hold one.
  const setext = (root: string) =>
    put(root, "CONTRIBUTING.md", "Contributing\n=======\n");
  expect("text", repo(setext), 0);
});
test("links: a link with a title to a missing file is a finding", () => {
  const titled = (root: string) =>
    put(
      root,
      "README.md",
      '# Fixture\n\nSee [x](docs/missing.md "Missing").\n',
    );
  assert.match(expect("links", repo(titled), 1), /docs\/missing\.md/);
});
test("links: a reference definition to a missing file is a finding", () => {
  const reference = (root: string) =>
    put(
      root,
      "README.md",
      "# Fixture\n\nSee [x][m].\n\n[m]: docs/missing.md\n",
    );
  assert.match(expect("links", repo(reference), 1), /docs\/missing\.md/);
});
test("gate-needs: a comment line between jobs does not hide the jobs after it", () => {
  const commented = edit(
    ".github/workflows/ci.yml",
    "  gate:\n",
    "# the checks\n  lint:\n    runs-on: ubuntu-latest\n  gate:\n",
  );
  assert.match(expect("gate-needs", repo(commented), 1), /lint/);
});
test("files: each pinned config every step reads is required", () => {
  for (const f of ["package.json", "pnpm-workspace.yaml", "tsconfig.json"])
    assert.match(
      expect("files", repo(remove(f)), 1),
      new RegExp(`missing: ${f}`),
    );
});
test("gate-needs: a job id with a trailing comment is still a job", () => {
  const commented = edit(
    ".github/workflows/ci.yml",
    "  gate:\n",
    "  lint:  # fast\n    runs-on: ubuntu-latest\n  gate:\n",
  );
  assert.match(expect("gate-needs", repo(commented), 1), /lint/);
});
test("types: a canary whose wrong type tsc does not report cannot be checked", () => {
  const strictOnly = canaryDir("types", {
    "canary.ts": "export function same(x) {\n  return x;\n}\n",
    "tsconfig.json":
      '{ "compilerOptions": { "strict": true, "noEmit": true } }\n',
  });
  expect("types", repo(), 3, { canaries: strictOnly });
});
test("an unknown first argument or a --root without a folder is a usage error", () => {
  assert.equal(run(["text", "--rot", "x"]).code, 2);
  assert.match(run(["text", "--root"]).out, /--root needs a folder/);
});
test("an unknown argument is a usage error", () => {
  const r = run(["text", "--root", repo(), "--rot", "x"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /unknown argument --rot/);
});
test("licences: passes when every package's licence is on the workflow's allow list", () => {
  assert.match(expect("licences", repo(), 0), /2 package\(s\)/);
});
test("licences: a licence outside the allow list is a finding that names the package", () => {
  const gpl = fakePnpm("12.19.0", '{"GPL-3.0-only":[{"name":"copyleft"}]}');
  assert.match(expect("licences", repo(), 1, { pnpm: gpl }), /copyleft/);
});
test("licences: a package whose licence pnpm cannot detect is a finding", () => {
  const unknown = fakePnpm("12.19.0", '{"Unknown":[{"name":"mystery"}]}');
  assert.match(expect("licences", repo(), 1, { pnpm: unknown }), /mystery/);
});
test("licences: a dependency-review workflow without an allow list cannot be checked", () => {
  const none = (root: string) =>
    put(
      root,
      ".github/workflows/dependency-review.yml",
      "on: [pull_request]\n",
    );
  assert.match(expect("licences", repo(none), 3), /allow-licenses/);
});
test("licences: a pnpm that cannot list the licences cannot be checked", () => {
  const broken = fakePnpm("12.19.0", "not json", 1);
  expect("licences", repo(), 3, { pnpm: broken });
});
test("licences: an empty licence record cannot be checked", () => {
  expect("licences", repo(), 3, { pnpm: fakePnpm("12.19.0", "{}") });
});
test("secrets: a wrapper that crashes cannot be checked, never a finding", () => {
  // node exits 1 on an uncaught error, the wrapper's own code for leaks
  const root = branch("feat: a commit to scan");
  put(root, "scripts/scan-secrets.ts", 'throw new Error("crash");\n');
  commit(root, "test: plant a crashing wrapper");
  assert.match(expect("secrets", root, 3), /no FINDING line/);
});
test("lockfile: bundleDependencies, npm's own spelling, would ship", () => {
  const bundled = pkg((p) => Object.assign(p, { bundleDependencies: ["c"] }));
  assert.match(expect("lockfile", repo(bundled), 1), /bundleDependencies: c/);
  const all = pkg((p) => Object.assign(p, { bundleDependencies: true }));
  assert.match(expect("lockfile", repo(all), 1), /bundleDependencies: all/);
});
test("an unknown check is a usage error", () => {
  assert.equal(run(["nothing"]).code, 2);
});
