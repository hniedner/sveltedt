// Tests for check-repo.ts. Each case builds a small git repository in a temporary folder, plants one break
// and asserts the exit code and the word its last line starts with; a usage case asserts exit 2.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
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
/** The fixture's root tsconfig, for components and the TypeScript beside them (svelte-check); scripts/ has its own
 * (tsc). ESLint's type-aware rules read the tsconfig.json nearest to each file. */
const FIXTURE_TSCONFIG = `{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src", "site", "test"]
}
`;
const SCRIPTS_TSCONFIG = `{
  "extends": "../tsconfig.json",
  "include": ["**/*.ts"],
  "exclude": ["canaries/**"]
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
  type?: string;
  license: string;
  packageManager?: string;
  prettier?: { plugins: string[] };
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
  type: "module", // as the repository's
  license: "Apache-2.0",
  packageManager: "pnpm@12.19.0",
  prettier: { plugins: ["prettier-plugin-svelte"] },
  devDependencies: {
    eslint: PINS.eslint,
    jscpd: PINS.jscpd,
    prettier: PINS.prettier,
    "svelte-check": PINS["svelte-check"],
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
    "scripts/tsconfig.json": SCRIPTS_TSCONFIG,
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
    "svelte.config.js": "export default {};\n",
    ".githooks/commit-msg":
      '#!/bin/sh\nexec node scripts/check-repo.ts commit-msg "$@"\n',
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  chmodSync(join(root, ".githooks/commit-msg"), 0o755);
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
    repo((root) => put(root, "spec/x/a.md", "#   Spec\n")),
    0,
  );
  expect(
    "format",
    repo((root) => put(root, "docs/spec/a.md", "#   Spec\n")),
    1,
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
        ".githooks/commit-msg",
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
  const out = expect("lint", repo(script("export const one = 1;\n")), 0);
  assert.match(out, /\.svelte 0$/m);
});
test("lint and format: the Svelte config, the one .js file, is linted and formatted like a script", () => {
  const config = (text: string) => (root: string) =>
    put(root, "svelte.config.js", text);
  expect(
    "lint",
    repo(config('export const a = eval("1");\nexport default {};\n')),
    1,
  );
  expect("format", repo(config("export default {}\n")), 1);
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
// A component project has small files: an index of two lines, a Vite config of 35 tokens, a barrel of four lines
// (counts by jscpd 5.4.3). jscpd leaves out a file under its 50 tokens or, measured, 5 lines; such a file cannot hold a
// clone, so it is set aside by name with jscpd's own count. mid.mjs (65 tokens, 7 lines) must be analysed, so a raised
// token minimum fails; five.mjs (exactly 5 lines) must be analysed, so a raised line minimum fails.
const SMALL = {
  "scripts/index.mjs":
    'export { one } from "./one.mjs";\nexport const two = 2;\n',
  "scripts/vite.config.mjs":
    'import { defineConfig } from "vite";\nexport default defineConfig({\n  root: "site",\n  build: { outDir: "dist" },\n  server: { port: 5173 },\n});\n',
  "scripts/mid.mjs":
    'export const settings = {\n  name: "table",\n  rows: [1, 2, 3, 4, 5, 6, 7, 8],\n  columns: ["id", "name", "price"],\n  page: { size: 20, index: 0 },\n  sort: { by: "name", up: true },\n};\n',
  "scripts/barrel.mjs":
    'export { alpha, beta, gamma, delta, epsilon, zeta } from "./greek.mjs";\nexport { one, two, three, four, five, six } from "./numbers.mjs";\nexport { red, green, blue, cyan, magenta, yellow } from "./colors.mjs";\nexport { north, south, east, west, up, down } from "./ways.mjs";\n',
  "scripts/five.mjs":
    'export const sizes = [10, 20, 50, 100];\nexport const orders = ["asc", "desc", "none"];\nexport const labels = { next: "Next", previous: "Previous" };\nexport const page = { index: 0, size: 20, count: 1 };\nexport const sort = { by: "id", order: "asc", stable: true };\n',
  "scripts/empty.mjs": "",
  "scripts/blank.mjs": "\n\n",
};
const small = (root: string) => {
  for (const [path, text] of Object.entries(SMALL)) put(root, path, text);
};
test("dupes: a file too small to hold a clone is set aside by name with jscpd's token count", () => {
  const out = expect("dupes", repo(small), 0);
  for (const line of [
    "scripts/index.mjs: 13 tokens in 2 line(s)",
    "scripts/vite.config.mjs: 35 tokens in 6 line(s)",
    "scripts/barrel.mjs: 68 tokens in 4 line(s)",
    "scripts/empty.mjs: blank",
    "scripts/blank.mjs: blank",
  ])
    assert.ok(out.includes(line), `${line}: ${out}`);
  assert.doesNotMatch(out, /mid\.mjs|five\.mjs/);
  assert.match(out, /set aside 5 file\(s\) under 50 tokens or 5 lines/);
});
test("dupes: a repository whose every file is too small passes, the files set aside", () => {
  // Measured with jscpd 5.4.3: it exits 0 and writes its report when it analyses no file at all.
  const out = expect(
    "dupes",
    repo((root) => {
      rmSync(join(root, "scripts", "tool.mjs"));
      rmSync(join(root, "scripts", "scan-secrets.ts"));
      small(root);
      rmSync(join(root, "scripts", "mid.mjs"));
      rmSync(join(root, "scripts", "five.mjs"));
    }),
    0,
  );
  assert.match(out, /no clone in 0 of 5 file\(s\); set aside 5 file\(s\)/);
});
test("dupes: a name with .d inside a word keeps its class: dupes reads it unless it is a test", () => {
  const out = expect(
    "dupes",
    repo((root) => {
      for (const f of [
        "src/x.dom.ts",
        "src/x.dom.test.ts",
        "scripts/x.dom.test.ts",
      ])
        put(root, f, "export const one = 1;\n");
    }),
    0,
  );
  assert.match(out, /^ {2}src\/x\.dom\.ts: /m);
  assert.doesNotMatch(out, /x\.dom\.test\.ts/);
});
test("dupes: a clone is still a finding beside the files set aside", () => {
  const out = expect(
    "dupes",
    repo((root) => {
      small(root);
      put(root, "scripts/a.mjs", BLOCK);
      put(root, "scripts/b.mjs", BLOCK);
    }),
    1,
  );
  assert.match(out, /scripts\/a\.mjs:\d+-\d+ repeats scripts\/b\.mjs/);
});
test("dupes: a file jscpd leaves out that could hold a clone cannot be checked, and is named", () => {
  // Over jscpd's 1mb: left out of both runs, though it holds tokens.
  const big = (root: string) =>
    put(root, "scripts/big.mjs", "export const one = 1;\n".repeat(60000));
  const out = expect("dupes", repo(big), 3);
  assert.match(out, /scripts\/big\.mjs: not counted/);
  assert.match(out, /could hold a clone/);
});
test("dupes: a summary that names fewer files than jscpd analysed cannot pass: each is measured again and blocks", () => {
  // jscpd caps its summary list at --summary-top. An analysed file cut from the list is measured like a file left out,
  // and an analysed file holds a clone's worth of tokens and lines, so it blocks. The fake caps the first run's list.
  const bin = join(tempDir(), "jscpd");
  const real = join(here, "..", "node_modules", ".bin", "jscpd");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
const r = spawnSync(${JSON.stringify(real)}, args, { stdio: "inherit" });
if (args.includes("--output") && args[args.indexOf("--min-tokens") + 1] !== "1") {
  const f = args[args.indexOf("--output") + 1] + "/jscpd-report.json";
  const report = JSON.parse(readFileSync(f, "utf8"));
  report.summary.files = report.summary.files.slice(0, 1);
  writeFileSync(f, JSON.stringify(report));
}
process.exit(r.status ?? 1);
`,
  );
  chmodSync(bin, 0o755);
  const out = expect("dupes", repo(), 3, { extraEnv: { JSCPD_BIN: bin } });
  assert.match(
    out,
    /left out 1 file\(s\) that could hold a clone of 50 tokens and 5 lines/,
  );
  assert.match(out, /^ {2}scripts\/\S+: \d+ tokens in \d+ line\(s\)$/m);
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
/** A tracked Svelte component under src/, which the fixture's tsconfig.json includes. */
const component =
  (body: string, path = "src/Count.svelte") =>
  (root: string): void =>
    put(root, path, body);
const COMPONENT = `<script lang="ts">\n  const { count }: { count: number } = $props();\n</script>\n\n<p>{count}</p>\n`;
test("svelte: with no Svelte file tracked the step is not applicable, after svelte-check failed its canary", () => {
  const r = run(["svelte", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1) ?? "",
    /^NOT APPLICABLE svelte: svelte-check \S+ failed the canary; no component and no TypeScript outside scripts\/ is tracked$/,
    r.out,
  );
});
test("svelte: passes when svelte-check fails its canary and accepts every tracked component", () => {
  expect("svelte", repo(component(COMPONENT)), 0);
});
test("svelte: a type error in a component is a finding that names the file and the code", () => {
  const out = expect(
    "svelte",
    repo(
      component(
        COMPONENT.replace("<p>{count}</p>", "<p>{count.toUpperCase()}</p>"),
      ),
    ),
    1,
  );
  assert.match(out, /src\/Count\.svelte:\d+ 2339 /);
});
test("svelte: a component outside tsconfig.json's include cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      put(root, "lib/Other.svelte", COMPONENT);
    }),
    3,
  );
  assert.match(out, /lib\/Other\.svelte/);
});
test("svelte: a component in a folder tsconfig.json excludes cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      put(root, "src/legacy/Old.svelte", COMPONENT);
      edit(
        "tsconfig.json",
        '"include"',
        '"exclude": ["src/legacy"],\n  "include"',
      )(root);
    }),
    3,
  );
  assert.match(out, /src\/legacy\/Old\.svelte/);
});
test("svelte: tsconfig.json is read as TypeScript reads it: comments, a ./ include and an inherited exclude", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      put(root, "src/Count.svelte", COMPONENT);
      put(root, "src/legacy/Old.svelte", COMPONENT);
      put(root, "tsconfig.base.json", '{ "exclude": ["src/legacy"] }\n');
      const options = JSON.stringify(
        (JSON.parse(FIXTURE_TSCONFIG) as { compilerOptions: object })
          .compilerOptions,
      );
      put(
        root,
        "tsconfig.json",
        `{\n  // as generated configs are written\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": ${options},\n  "include": ["./src/**/*.svelte"],\n}\n`,
      );
    }),
    3,
  );
  assert.match(out, /src\/legacy\/Old\.svelte/);
  assert.doesNotMatch(out, /src\/Count\.svelte/);
});
const TABLE = `<script lang="ts" generics="T extends { id: number }">\n  const { rows }: { rows: T[] } = $props();\n</script>\n\n<p>{rows.length}</p>\n`;
const MOUNT = (row: string) =>
  `import { mount } from "svelte";\nimport Table from "./Table.svelte";\ninterface Item {\n  id: number;\n  name: string;\n}\nexport const show = (target: HTMLElement) =>\n  mount(Table<Item>, { target, props: { rows: [${row}] } });\n`;
test("svelte: TypeScript that mounts a generic component is checked against its real type", () => {
  // tsc would refuse Table<Item> (TS2635: it sees only svelte's ambient module); svelte-check knows the component.
  const project = (row: string) => (root: string) => {
    put(root, "src/Table.svelte", TABLE);
    put(root, "src/show.ts", MOUNT(row));
  };
  const ok = expect("svelte", repo(project('{ id: 1, name: "a" }')), 0);
  assert.match(ok, /accepted 2 file\(s\)/);
  // Measured: tsc refuses Table<Item> (TS2635); here Item's own field is missing, which only the explicit Item can
  // say (TS2741).
  const out = expect("svelte", repo(project("{ id: 1 }")), 1);
  assert.match(out, /src\/show\.ts:\d+ 2741 /);
});
test("svelte: TypeScript in neither program cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => put(root, "tools/z.ts", "export const one = 1;\n")),
    3,
  );
  assert.match(out, /leaves out/);
  assert.match(out, /tools\/z\.ts/);
});
test("svelte: a script in the component program as well as in tsc's cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      edit(
        "tsconfig.json",
        '"include": ["src"',
        '"include": ["scripts", "src"',
      )(root);
    }),
    3,
  );
  assert.match(out, /scripts\/scan-secrets\.ts/);
});
test("svelte: a test and a rune module beside the components are svelte-check's, their errors found", () => {
  const COUNTER =
    "export function counter() {\n  let n = $state(0);\n  return { get: () => n, add: () => n++ };\n}\n";
  const beside = (file: string, text: string) => (r: string) => {
    component(COMPONENT)(r);
    put(r, file, text);
  };
  expect("svelte", repo(beside("src/count.svelte.ts", COUNTER)), 0);
  for (const [file, text, code] of [
    ["test/x.test.ts", 'export const n: number = "one";\n', 2322],
    [
      "src/count.svelte.ts",
      COUNTER.replace("$state(0)", '$state<number>("zero")'),
      2345,
    ],
  ] as const) {
    const out = expect("svelte", repo(beside(file, text)), 1);
    assert.match(out, new RegExp(`${file.replace(".", "\\.")}:\\d+ ${code} `));
  }
});
test("svelte: a component Svelte cannot parse is a finding with Svelte's own message and line", () => {
  // Measured with svelte-check 4.7.8: it drops a Svelte parse error that says "expected" when the config has no
  // preprocess and the component has any lang attribute, so a style Svelte rejects (p:is()) would hide an untyped
  // script. The step reports the parse error itself, with Svelte's line and message (measured with svelte 5.57.3's
  // parse).
  for (const [body, line] of [
    [
      '<script lang="ts">\n  const n = ;\n</script>\n\n<p>{n}</p>\n',
      "2: Unexpected token",
    ],
    [
      '<script lang="js">\n  const a = 1;\n</script>\n\n<p>{a}</p>\n\n<style>\n  p:is() {\n    color: red;\n  }\n</style>\n',
      "8: \\S",
    ],
    [
      '<p>{1}</p>\n\n<style lang="css">\n  p:is() {\n    color: red;\n  }\n</style>\n',
      "4: \\S",
    ],
  ]) {
    const out = expect("svelte", repo(component(body)), 1);
    // Each row pins Svelte's line; row 1 also its message's text, rows 2-3 only that some text follows. The message is
    // its first line only (the second is a link).
    assert.match(
      out,
      new RegExp(`src/Count\\.svelte: Svelte cannot parse it at line ${line}`),
      body,
    );
    assert.doesNotMatch(out, /svelte\.dev\/e\//, body);
  }
});
test("svelte: TypeScript outside scripts/ with no component cannot be checked: svelte-check needs one", () => {
  // Measured: svelte-check reports error 100001, no Svelte input, on a program of TypeScript alone.
  const out = expect(
    "svelte",
    repo((r) => put(r, "src/index.ts", "export const one = 1;\n")),
    3,
  );
  assert.match(out, /no component is tracked/);
  assert.match(out, /src\/index\.ts/);
});
test("svelte: a component without a TypeScript script is a finding: svelte-check would check none of it", () => {
  // Measured: svelte-check reports no error in the markup of a component without a script, nor in a script without
  // lang="ts"; only a TypeScript file that imports one gets TS7016.
  for (const body of [
    "<p>{1}</p>\n",
    "<script>\n  const n = 1;\n</script>\n\n<p>{n}</p>\n",
    '<script lang="js">\n  const n = 1;\n</script>\n\n<p>{n}</p>\n',
    `<script module>\n  export const k = 1;\n</script>\n\n${COMPONENT}`,
    '<!-- <script lang="ts"></script> -->\n<p>{1}</p>\n',
  ]) {
    const out = expect("svelte", repo(component(body)), 1);
    assert.match(
      out,
      /src\/Count\.svelte: a script that is not lang="ts", or none/,
      body,
    );
  }
});
test("svelte: a canary that svelte-check accepts cannot be checked", () => {
  const dir = canaryDir("svelte", {
    "tsconfig.json": `${JSON.stringify({
      ...(JSON.parse(FIXTURE_TSCONFIG) as object),
      include: ["canary.svelte"],
    })}\n`,
    "canary.svelte": COMPONENT,
  });
  // svelte-check must be able to accept it: the folder finds svelte's types as a real canary folder does.
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "svelte", "node_modules"),
  );
  const out = expect("svelte", repo(), 3, { canaries: dir });
  assert.match(out, /did not report the planted type errors/);
});
test("svelte: without a tracked svelte.config.js the step cannot be checked", () => {
  const out = expect("svelte", repo(remove("svelte.config.js")), 3);
  assert.match(out, /svelte\.config\.js is not tracked/);
});
test("svelte: no Svelte config below the root is imported, only the root's", () => {
  // svelte-check searches above the root and imports vite.config.* only while no root config exists (measured with
  // svelte-check 4.7.8, 2026-11-17); the step refuses to run without one, so the nested case is the one a run can meet.
  const root = repo(component(COMPONENT));
  const marker = join(root, "MARKER-nested");
  put(
    root,
    "docs/deep/svelte.config.js",
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\nexport default {};\n`,
  );
  expect("svelte", root, 0);
  assert.ok(!existsSync(marker), "the nested svelte.config.js was imported");
});
test("format: a formatted Svelte component passes through Prettier's Svelte plugin", () => {
  expect("format", repo(component(COMPONENT)), 0);
});
test("format: an unformatted Svelte component is a finding that names it", () => {
  const out = expect(
    "format",
    repo(component(COMPONENT.replace("<p>{count}</p>", "<p>{ count }</p>"))),
    1,
  );
  assert.match(out, /src\/Count\.svelte/);
});
test("format: the Svelte canary is checked only while Prettier's config loads the Svelte plugin", () => {
  // Prettier infers a file's parser from the config it finds above the file, so the canary folder gets its own.
  const canaries = (prettier: object) => {
    const dir = canaryDir("format", {
      "canary.svelte": readFileSync(
        join(here, "canaries", "format", "canary.svelte"),
        "utf8",
      ),
    });
    put(dir, "package.json", `${JSON.stringify(prettier)}\n`);
    symlinkSync(join(here, "..", "node_modules"), join(dir, "node_modules"));
    return dir;
  };
  const plugin = { prettier: { plugins: ["prettier-plugin-svelte"] } };
  expect("format", repo(), 0, { canaries: canaries(plugin) });
  const out = expect("format", repo(), 3, { canaries: canaries({}) });
  assert.match(out, /canary\.svelte/);
});
test("lint: a component in allowed markup passes, and the summary counts it per extension", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  let el: HTMLElement | undefined = $state();\n</script>",
        ).replace(
          "<p>{count}</p>",
          "<p bind:this={el} class={count > 1 ? 'many' : 'one'}>{count}</p>",
        ),
      ),
    ),
    0,
  );
  assert.match(out, /\.svelte 1$/m);
});
test("lint: a class: directive in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          "<p class:many={count > 1}>{count}</p>",
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax class: directive/);
});
test("lint: a <style> block in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        `${COMPONENT}\n<style>\n  p {\n    margin: 0;\n  }\n</style>\n`,
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax <style> block/);
});
test("lint: markup and code beside the injection bans pass in a component (setAttribute once would not: on plus letters, like any handler)", () => {
  // Near misses: another element through svelte:element, literal or computed; an iframe without srcdoc; reading
  // innerHTML; a string holding its name; setAttribute and createElement of other names; a write that is not a
  // document's; a name that only contains a sink's name; a local parseHTML or addRule; a bracketed name that is no
  // sink's; setAttribute of open or only-x (not handlers); execCommand of another command.
  expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          '  const { innerHTML } = document.body;\n  const log = { write: (s: string): string => s };\n  const sink = "innerHTML";\n' +
            '  const tag = "p";\n  const text = document.body.innerHTML;\n  const box = document.createElement("div");\n' +
            '  box.setAttribute("title", text);\n  box.setAttribute("open", "");\n  box.setAttribute("only-x", "");\n  box.append(document.createElementNS("http://www.w3.org/2000/svg", "circle"));\n  box["title"] = text;\n  const csvDocument = log;\n  const myDOMParserName = csvDocument.write(sink);\n' +
            '  const parseHTML = (s: string): string => s;\n  const addRule = (s: string): string => s;\n  document.execCommand("copy", false, addRule(parseHTML(text)));\n</script>',
        ).replace(
          "<p>{count}</p>",
          '<svelte:element this="p">{count}{log.write(innerHTML)}{sink}</svelte:element>\n<iframe title="frame" src="about:blank"></iframe>\n' +
            "<svelte:element this={tag}>{myDOMParserName}{box.title}</svelte:element>",
        ),
      ),
    ),
    0,
  );
});
// RND-04 (spec/table.md): with the per-name test below, every raw-HTML form its example names is a finding: {@html
// and srcdoc in a component, the
// script forms in a script (the script bans run in components too: canary.svelte plants setAttribute style and
// innerHTML).
const SINK = (body: string) =>
  `export function sink(el: HTMLElement, html: string): unknown {\n  ${body}\n  return el;\n}\n`;
test("lint: the raw-HTML forms of RND-04 are findings that name their ban", () => {
  for (const [form, change, ban] of [
    [
      "{@html",
      component(`${COMPONENT}{@html String(count)}\n`),
      "svelte/no-at-html-tags",
    ],
    [
      "innerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.innerHTML = html;")),
      "no-restricted-syntax assigning innerHTML",
    ],
    [
      "outerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.outerHTML = html;")),
      "no-restricted-syntax assigning innerHTML, outerHTML",
    ],
    [
      "insertAdjacentHTML",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('el.insertAdjacentHTML("beforeend", html);'),
        ),
      "no-restricted-syntax insertAdjacentHTML",
    ],
    [
      "document.write",
      (r: string) => put(r, "scripts/x.ts", SINK("document.write(html);")),
      "no-restricted-syntax document.write",
    ],
    [
      "createContextualFragment",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK("document.createRange().createContextualFragment(html);"),
        ),
      "no-restricted-syntax setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
    [
      "DOMParser",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('new DOMParser().parseFromString(html, "text/html");'),
        ),
      "no-restricted-syntax DOMParser",
    ],
    [
      "srcdoc",
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<iframe title="t" srcdoc={String(count)}></iframe>',
        ),
      ),
      "no-restricted-syntax srcdoc attribute",
    ],
  ] as const) {
    const out = expect("lint", repo(change), 1);
    assert.ok(out.includes(ban), `${form}: ${out}`);
  }
});
test("lint: every name a ban lists is a finding of that ban", () => {
  const scripts = [
    ['document.createElement("style");', "createElement of style"],
    ['document.createElement("link");', "createElement of style"],
    ['document.createElement("script");', "createElement of style"],
    ['el.setAttribute("SRCDOC", html);', "setAttribute srcdoc"],
    [
      'el.setAttribute("onclick", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    ["el.setHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["Document.parseHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["el.setHTML(html);", "setHTML or createRawSnippet"],
    ["void createRawSnippet;", "setHTML or createRawSnippet"],
    [
      "(el as HTMLIFrameElement).srcdoc = html;",
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    ['el["innerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      'Object.assign(el, { "outerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "Object.assign(el, { srcdoc: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    ["document.writeln(html);", "document.write"],
    ["window.document.write(html);", "document.write"],
    ["el.ownerDocument.write(html);", "document.write"],
    ["void new CSSStyleSheet();", "constructed or inserted style sheet"],
    [
      "void document.adoptedStyleSheets;",
      "constructed or inserted style sheet",
    ],
    [
      'document.styleSheets[0]?.insertRule("p {}");',
      "a rule inserted into a style sheet",
    ],
    [
      'document.styleSheets[0]?.addRule("p", "margin: 0");',
      "a rule inserted into a style sheet",
    ],
    [
      "(el as HTMLIFrameElement).contentDocument?.write(html);",
      "document.write",
    ],
    ["window.Document.parseHTML(html);", "Document.parseHTML"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "style");',
      "createElementNS of style",
    ],
    ['el["insertAdjacentHTML"]("beforeend", html);', "a sink name in brackets"],
    ['document["write"](html);', "a sink name in brackets"],
    ['el["setAttribute"]("style", "");', "a sink name in brackets"],
    [
      'document.execCommand("INSERTHTML", false, html);',
      "execCommand insertHTML",
    ],
    ["Document.parseHTML(html);", "Document.parseHTML"],
    ['document.createElement("SCRIPT");', "createElement of style"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "script");',
      "createElementNS of style",
    ],
    [
      'document.createElementNS("http://www.w3.org/1999/xhtml", "link");',
      "createElementNS of style",
    ],
    ['el["outerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      '(el as HTMLIFrameElement)["srcdoc"] = html;',
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    [
      "Object.assign(el, { outerHTML: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "innerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "srcdoc": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "const { ownerDocument } = el;\n  ownerDocument.write(html);",
      "document.write",
    ],
    [
      "const { contentDocument } = el as HTMLIFrameElement;\n  contentDocument?.write(html);",
      "document.write",
    ],
    ["el.innerHTML += html;", "assigning innerHTML, outerHTML or srcdoc"],
    [
      'el.setAttribute("ONCLICK", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    // Every name the bracket ban lists, in brackets: a name dropped from its list cannot stay green.
    ...[
      "insertAdjacentHTML",
      "setHTML",
      "setHTMLUnsafe",
      "parseHTML",
      "parseHTMLUnsafe",
      "createContextualFragment",
      "createRawSnippet",
      "DOMParser",
      "write",
      "writeln",
      "execCommand",
      "setAttribute",
      "createElement",
      "createElementNS",
      "CSSStyleSheet",
      "adoptedStyleSheets",
      "insertRule",
      "addRule",
    ].map((name) => [`void el["${name}"];`, "a sink name in brackets"]),
  ].map(([body, ban], i) => [`scripts/s${i}.ts`, SINK(body), ban]);
  const markup = [
    ['<iframe SRCDOC="<p>x</p>" title="t"></iframe>', "srcdoc attribute"],
    [
      '<svelte:element this={"STYLE"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ["<x-raw {outerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
    ['<link rel="stylesheet" href="x.css" />', "style, link or script element"],
    ["<div><script>alert(1)</script></div>", "style, link or script element"],
    ["<div><style></style></div>", "style, link or script element"],
    ["<div><sCRIPT>alert(1)</sCRIPT></div>", "style, link or script element"],
    [
      '<svelte:element this="script"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="link"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="SCRIPT"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this={"style"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    [
      '<svelte:element this={"link"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ['<iframe {srcdoc} title="t"></iframe>', "srcdoc attribute"],
    ["<x-raw outerHTML={srcdoc}></x-raw>", "innerHTML or outerHTML attribute"],
    ["<x-raw {innerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
  ].map(([tag, ban], i) => [
    `src/C${i}.svelte`,
    COMPONENT.replace(
      "$props();",
      '$props();\n  const srcdoc = "";\n  const innerHTML = "";\n  const outerHTML = "";',
    ).replace(
      "<p>{count}</p>",
      `<p>{count}{srcdoc}{innerHTML}{outerHTML}</p>\n${tag}`,
    ),
    ban,
  ]);
  const out = expect(
    "lint",
    repo((root) => {
      component(COMPONENT)(root);
      for (const [file, text] of [...scripts, ...markup]) put(root, file, text);
    }),
    1,
  );
  const lines = out.split("\n").map((l) => l.trim());
  for (const [file, , ban] of [...scripts, ...markup])
    assert.ok(
      lines.some(
        (l) =>
          l.startsWith(`${file}:`) && l.includes(`no-restricted-syntax ${ban}`),
      ),
      `${file} ${ban}: ${out}`,
    );
});
test("lint: a raw-HTML sink named without being called or assigned is a finding", () => {
  for (const [body, ban] of [
    ["const Parser = DOMParser;\n  void new Parser();", "DOMParser"],
    [
      "const write = document.write.bind(document);\n  write(html);",
      "document.write",
    ],
    [
      "const fragment = document.createRange().createContextualFragment;\n  void fragment;",
      "setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
  ]) {
    const out = expect(
      "lint",
      repo((r) => put(r, "scripts/x.ts", SINK(body))),
      1,
    );
    assert.ok(out.includes(`no-restricted-syntax ${ban}`), `${body}: ${out}`);
  }
});
test("lint: a raw-HTML sink in a .js or .mjs file is a finding", () => {
  for (const file of ["svelte.config.js", "scripts/x.mjs"]) {
    const out = expect(
      "lint",
      repo((r) =>
        put(
          r,
          file,
          "export function sink(el, html) {\n  el.innerHTML = html;\n}\n",
        ),
      ),
      1,
    );
    assert.ok(
      out.includes("no-restricted-syntax assigning innerHTML"),
      `${file}: ${out}`,
    );
  }
});
test("lint: a browser API above the support floor in a component is a finding that names the rule", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  const share = new PaymentRequest([], { total: { label: 'x', amount: { currency: 'EUR', value: '1' } } });\n</script>",
        ).replace("{count}</p>", "{count}{String(share)}</p>"),
      ),
    ),
    1,
  );
  assert.match(out, /compat\/compat/);
});
test("lint: an HTML disable comment does not switch a rule off in a component", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<!-- eslint-disable -->\n<p style="color: red">{count}</p>',
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax style attribute/);
});
// The comments that switch a check off, built from parts so this file does not hold them.
const SUPPRESSIONS = [
  ["svelte-", "ignore"],
  ["@ts-", "expect-error"],
  ["@ts-", "nocheck"],
  ["jscpd:", "ignore"],
  ["prettier-", "ignore"],
].map((parts) => parts.join(""));
test("text: each suppression comment in a script or a component is a finding that names it", () => {
  for (const word of SUPPRESSIONS) {
    const out = expect(
      "text",
      repo((root) => {
        put(
          root,
          "scripts/x.ts",
          `// ${word} for a reason\nexport const one = 1;\n`,
        );
        put(root, "scripts/y.mjs", `export const one = 1; // ${word}\n`);
        put(root, "scripts/z.svelte.ts", `export const one = 1;\n// ${word}\n`);
        component(COMPONENT.replace("<p>", `<!-- ${word} -->\n<p>`))(root);
      }),
      1,
    );
    for (const at of [
      "scripts/x.ts:1",
      "scripts/y.mjs:1",
      "scripts/z.svelte.ts:2",
    ])
      assert.ok(out.includes(`${at}: suppression comment ${word}`), out);
    assert.ok(
      out.includes(`src/Count.svelte:5: suppression comment ${word}`),
      out,
    );
  }
});
test("text: suppression comments on successive lines are each a finding", () => {
  const out = expect(
    "text",
    repo((root) =>
      put(
        root,
        "scripts/x.ts",
        `// ${SUPPRESSIONS[1]}\n// ${SUPPRESSIONS[2]}\nexport const one = 1;\n`,
      ),
    ),
    1,
  );
  assert.ok(
    out.includes(`scripts/x.ts:1: suppression comment ${SUPPRESSIONS[1]}`),
    out,
  );
  assert.ok(
    out.includes(`scripts/x.ts:2: suppression comment ${SUPPRESSIONS[2]}`),
    out,
  );
});
test("lint: a config block that changes a proven rule for the component's folders cannot be checked", () => {
  // Measured: a later block that sets no-restricted-syntax for some files replaces the list for them, while every
  // canary still passes. Each rule the canaries prove must be configured for src/lib and site/src as for its canary.
  const real = join(here, "..", "eslint.config.mjs");
  for (const [block, named, file = ""] of [
    [
      '{ files: ["src/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte: no-restricted-syntax\n",
    ],
    // A block narrower than the probes: the file it reaches is compared too.
    [
      '{ files: ["src/lib/components/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/components/Grid.svelte: no-restricted-syntax\n",
      "src/lib/components/Grid.svelte",
    ],
    [
      '{ files: ["**/DataTable.svelte"], rules: { "svelte/no-at-html-tags": "off" } }',
      "src/lib/DataTable.svelte: svelte/no-at-html-tags",
      "src/lib/DataTable.svelte",
    ],
    [
      '{ files: ["src/**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte.ts: no-restricted-syntax\n",
    ],
    [
      '{ files: ["src/**"], linterOptions: { noInlineConfig: false } }',
      "src/lib/probe.svelte: linterOptions",
    ],
    [
      '{ files: ["site/**"], rules: { "svelte/no-at-html-tags": "off" } }',
      "site/src/probe.svelte: svelte/no-at-html-tags",
    ],
    [
      '{ files: ["src/**/*.ts"], rules: { "@typescript-eslint/ban-ts-comment": "off" } }',
      "src/lib/probe.ts: @typescript-eslint/ban-ts-comment",
    ],
    [
      '{ files: ["site/**"], settings: { browsers: ["chrome 140"] } }',
      "site/src/probe.ts: settings",
    ],
  ]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect(
      "lint",
      repo(file ? component(COMPONENT, file) : () => {}),
      3,
      { extraEnv: { ESLINT_CONFIG: config } },
    );
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
  // Adding a block that leaves the proven rules alone is not a finding.
  const config = join(tempDir(), "eslint.config.mjs");
  writeFileSync(
    config,
    `import base from ${JSON.stringify(real)};\nexport default [...base, { files: ["src/**"], rules: { "no-console": "error" } }];\n`,
  );
  expect("lint", repo(), 0, { extraEnv: { ESLINT_CONFIG: config } });
});
test("lint: a block that weakens the bans for a whole extension, its canary too, cannot be checked", () => {
  // Measured (security review of 4528469): a block for **/*.svelte.ts keeping the one ban its canary plants, or a no-op
  // processor for components, changed canary and file alike, and the step passed with the sink in the file.
  const real = join(here, "..", "eslint.config.mjs");
  const RUNE =
    'export const doc = new DOMParser().parseFromString("<p></p>", "text/html");\nexport const s = document.createElement("style");\n';
  const RAW =
    '<script lang="ts">\n  const { html }: { html: string } = $props();\n</script>\n\n{@html html}\n';
  const allBut = (files: string[]) =>
    `{ files: ${JSON.stringify(files)}, rules: { "no-restricted-syntax": ["error", ...base.flatMap((b) => b.files?.includes("**/*.svelte.ts") ? (b.rules?.["no-restricted-syntax"] ?? []).slice(1) : []).filter((e) => !/DOMParser/.test(e.message))] } }`;
  for (const [block, named, change] of [
    [
      `{ files: ["**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "assigning innerHTML (PRD-S2)" }] } }`,
      "scripts/rune.svelte.ts: no-restricted-syntax without each ban of the .ts canary",
      (root: string) => put(root, "scripts/rune.svelte.ts", RUNE),
    ],
    [
      allBut(["**/*.svelte"]),
      "src/lib/probe.svelte: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      allBut(["**/*.mjs", "**/*.js"]),
      "src/lib/probe.mjs: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      '{ files: ["src/lib/**/*.svelte"], processor: { preprocess: () => [], postprocess: () => [] } }',
      "src/lib/Raw.svelte: processor",
      component(RAW, "src/lib/Raw.svelte"),
    ],
    [
      '{ files: ["src/lib/**/*.ts"], languageOptions: { parser: { meta: { name: "other", version: "1.0.0" }, parse: () => { throw new Error("unused"); } } } }',
      "src/lib/probe.ts: parser",
      () => {},
    ],
  ] as [string, string, (root: string) => void][]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect("lint", repo(change), 3, {
      extraEnv: { ESLINT_CONFIG: config },
    });
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
});
test("lint: no PostCSS config is loaded for a component, not even one above the root", () => {
  const parent = tempDir();
  const root = join(parent, "root");
  // An ignore comment (SUPPRESSIONS[0]) makes the plugin compile the component, the path that loads PostCSS (measured).
  const styled = COMPONENT.replace(
    "<p>{count}</p>",
    `<!-- ${SUPPRESSIONS[0]} a11y_missing_attribute -->\n<p class="n">{count}</p>\n\n<style lang="postcss">\n  .n {\n    color: red;\n  }\n</style>`,
  );
  cpSync(repo(component(styled)), root, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const marker = join(parent, "MARKER-postcss");
  put(
    parent,
    "postcss.config.cjs",
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nmodule.exports = {};\n`,
  );
  const out = expect("lint", root, 1);
  assert.match(out, /no-restricted-syntax <style> block/);
  assert.ok(
    !existsSync(marker),
    "the PostCSS config above the root was loaded",
  );
});
test("text: a suppression word in prose is not a finding", () => {
  const prose = `# Notes\n\nNever use ${SUPPRESSIONS[0]}.\n`;
  expect(
    "text",
    repo((root) => put(root, "docs/notes.md", prose)),
    0,
  );
});
test("svelte: a warning is a finding that names its code", () => {
  const out = expect(
    "svelte",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<p>{count}</p>\n<img src="count.png" />',
        ),
      ),
    ),
    1,
  );
  assert.match(out, /src\/Count\.svelte:\d+ a11y_missing_attribute /);
});
test("svelte: a canary that reports only the wrong type, as a non-strict config would, cannot be checked", () => {
  const options = (JSON.parse(FIXTURE_TSCONFIG) as { compilerOptions: object })
    .compilerOptions;
  const dir = canaryDir("svelte", {
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { ...options, strict: false }, include: ["canary.svelte"] })}\n`,
    "canary.svelte": readFileSync(
      join(here, "canaries", "svelte", "canary.svelte"),
      "utf8",
    ),
  });
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "svelte", "node_modules"),
  );
  const out = expect("svelte", repo(), 3, { canaries: dir });
  assert.match(out, /did not report the planted type errors/);
});
/** A stand-in for svelte-check: the canary folder (.../svelte) prints `canary`, the repository `rest`, each line a
 * machine-verbose line; the canary run exits 1, the repository run `status`. */
function fakeSvelteCheck(canary: string[], rest: string[], status = 1): string {
  const bin = join(tempDir(), "svelte-check");
  const say = (lines: string[]) =>
    lines.map((l) => `echo '1 ${l}'`).join("; ") || ":";
  writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "svelte-check, ${PINS["svelte-check"]}"; exit 0; fi\ncase "$(pwd)" in\n  */svelte) ${say(canary)};;\n  *) ${say(rest)}; exit ${status};;\nesac\nexit 1\n`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
/** One diagnostic line as svelte-check prints it. */
const diagnostic = (code: number, type = "ERROR", filename = "canary.svelte") =>
  JSON.stringify({
    type,
    filename,
    start: { line: 1 },
    code,
    message: "planted",
  });
const PLANTED = [
  diagnostic(2322),
  diagnostic(7006),
  diagnostic(2322, "ERROR", "canary.ts"),
];
test("svelte: output that is not svelte-check's diagnostics cannot be checked, from the canary run or the real one", () => {
  for (const [canary, rest] of [
    [['{"type":"ERROR","filename'], []],
    [PLANTED, ['{"type":"ERROR","filename']],
    [PLANTED, ['{"type":"ERROR"}']],
  ]) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: { SVELTE_CHECK_BIN: fakeSvelteCheck(canary, rest) },
    });
    assert.match(out, /not its diagnostics/);
  }
});
test("svelte: a canary run missing a planted error, reporting it as a warning or on another file cannot be checked", () => {
  for (const canary of [
    [diagnostic(7006)],
    [diagnostic(2322), diagnostic(7006, "WARNING")],
    [diagnostic(2322), diagnostic(7006, "ERROR", "other.svelte")],
    [diagnostic(2322), diagnostic(7006)],
  ]) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: { SVELTE_CHECK_BIN: fakeSvelteCheck(canary, []) },
    });
    assert.match(out, /did not report the planted type errors/);
  }
});
test("svelte: a status and output other than exit 0 clean or exit 1 with diagnostics cannot be checked, and is named", () => {
  const found = [diagnostic(2322, "ERROR", "src/Count.svelte")];
  for (const [rest, status] of [
    [[], 1],
    [found, 0],
    [found, 2],
  ] as const) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: {
        SVELTE_CHECK_BIN: fakeSvelteCheck(PLANTED, [...rest], status),
      },
    });
    assert.match(out, new RegExp(`svelte-check exited ${status}$`, "m"));
  }
});
test("svelte: a tsconfig.json TypeScript cannot read cannot be checked, and says why", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      edit("tsconfig.json", "{", '{\n  "extends": "./nope.json",')(root);
    }),
    3,
  );
  assert.match(out, /TypeScript cannot read tsconfig\.json/);
});
test("svelte: another svelte-check version than the pin cannot be checked", () => {
  expect(
    "svelte",
    repo(pkg((p) => (p.devDependencies["svelte-check"] = "0.0.1"))),
    3,
  );
});
test("types: scripts/ name their own types: the component side's ambient types are not theirs", () => {
  // The root tsconfig.json declares the component side's types (svelte here; Vite's client in a component project);
  // scripts/tsconfig.json names its own, so a rune, which only Svelte's types declare, is a type error in a script.
  const root = repo((r) => {
    for (const f of ["tsconfig.json", "scripts/tsconfig.json"])
      put(r, f, readFileSync(join(here, "..", f)));
    put(r, "scripts/count.ts", "export const n: number = $state(0);\n");
  });
  const out = expect("types", root, 1);
  assert.match(out, /scripts\/count\.ts.*TS2304/);
});
test("types: a script scripts/tsconfig.json leaves out cannot be checked", () => {
  const outside = (root: string): void => {
    put(root, "scripts/z.ts", "export const one = 1;\n");
    put(
      root,
      "scripts/tsconfig.json",
      SCRIPTS_TSCONFIG.replace('"canaries/**"]', '"canaries/**", "z.ts"]'),
    );
  };
  assert.match(expect("types", repo(outside), 3), /scripts\/z\.ts/);
});
test("types: a repository without scripts/tsconfig.json cannot be checked", () => {
  const out = expect("types", repo(remove("scripts/tsconfig.json")), 3);
  assert.match(out, /tsc could not read/);
});
test("types: a scripts/tsconfig.json that turns checking off cannot be checked: the canary runs under it", () => {
  const root = repo((r) => {
    put(
      r,
      "scripts/tsconfig.json",
      SCRIPTS_TSCONFIG.replace(
        "{\n",
        '{\n  "compilerOptions": { "noCheck": true },\n',
      ),
    );
    for (const f of ["canary.ts", "tsconfig.json"])
      put(
        r,
        `scripts/canaries/types/${f}`,
        readFileSync(join(here, "canaries", "types", f), "utf8"),
      );
  });
  const out = expect("types", root, 3, {
    canaries: join(root, "scripts", "canaries"),
  });
  assert.match(out, /tsc did not report the planted type errors/);
});
test("types: a declaration file, or any .js file but the root svelte.config.js, has no class until one is decided", () => {
  // TypeScript reads any name with ".d." as a declaration file (ts.isDeclarationFileName), and skipLibCheck skips it.
  for (const file of [
    "src/app.d.ts",
    "scripts/x.d.ts",
    "src/x.d.css.ts",
    "src/x.d.test.ts",
    "scripts/x.d.test.ts",
    "scripts/a.d.svelte.ts",
    "src/x.js",
    "vite.config.js",
    "docs/svelte.config.js",
  ]) {
    const out = expect(
      "types",
      repo((r) => put(r, file, "export {};\n")),
      3,
    );
    assert.ok(out.includes(file), `${file}: ${out}`);
  }
});
test("types: a name with .d inside a word keeps its class: only .d. marks a declaration", () => {
  // tsc must check it: an error in it is a finding.
  const out = expect(
    "types",
    repo((r) =>
      put(r, "scripts/x.dom.ts", 'export const n: number = "one";\n'),
    ),
    1,
  );
  assert.match(out, /scripts\/x\.dom\.ts/);
  // ... and it stays tsc's alone: the svelte step has nothing of its own.
  const svelte = run([
    "svelte",
    "--root",
    repo((r) => put(r, "scripts/x.dom.ts", "export const one = 1;\n")),
  ]);
  assert.equal(svelte.code, 0, svelte.out);
  assert.match(svelte.out, /^NOT APPLICABLE svelte/m);
});

test("types: TypeScript outside scripts/ is not tsc's: an error there is svelte-check's to find", () => {
  // tsc sees a component only through svelte's ambient module, so it is not asked about the component side.
  const out = expect(
    "types",
    repo((root) =>
      put(root, "src/bad.ts", 'export const n: number = "one";\n'),
    ),
    0,
  );
  assert.doesNotMatch(out, /src\/bad\.ts/);
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

test("commits: passes when every commit after origin/main has a conventional header", () => {
  expect(
    "commits",
    branch("feat: add a thing", "fix(table)!: change a thing"),
    0,
  );
});
test("commits: a header without a type is a finding that names it", () => {
  const out = expect("commits", branch("feat: fine", "Add the thing"), 1);
  assert.match(out, /Add the thing/);
});
test("commits: a type outside the list is a finding", () => {
  expect("commits", branch("feature: add a thing"), 1);
});
test("commits: a header over 100 characters is a finding", () => {
  expect("commits", branch(`feat: ${"x".repeat(95)}`), 1);
});
/** Makes `side` from `from` with one commit `subject`, then merges it into the branch with git's own header. */
function mergeSide(root: string, from: string, subject: string): void {
  git(root, "checkout", "-q", "-b", "side", from);
  commit(root, subject);
  git(root, "checkout", "-q", "-");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.org",
    "-c",
    "core.hooksPath=/dev/null",
    "merge",
    "-q",
    "--no-ff",
    "-m",
    "Merge branch 'side'",
    "side",
  );
}
test("commits: a merge commit is not checked", () => {
  const root = branch("feat: on the branch");
  mergeSide(root, "HEAD~1", "fix: on the side");
  expect("commits", root, 0);
});
test("commits: a branch that merged main is not judged by main's plain subjects", () => {
  // Older main history has plain subjects. Only commits after the merge base with main count; not first-parent,
  // because a branch merged into this one (not main) lands on main too and is checked.
  const root = branch("feat: on the branch");
  mergeSide(root, "refs/remotes/origin/main", "Add a plain subject on main");
  git(root, "update-ref", "refs/remotes/origin/main", "side");
  const main = git(root, "rev-parse", "side").trim();
  assert.match(expect("commits", root, 0), /^PASS commits: 1 commit\(s\)/m);
  expect("commits", root, 0, {
    extraEnv: { GATE_BASE: main, GATE_HEAD: "HEAD" },
  });
});
test("commits: a branch with no commit after origin/main is not applicable", () => {
  notApplicable(["commits", "--root", repo()]);
});
test("commits: in CI, an empty range cannot be checked, never NOT APPLICABLE", () => {
  expect("commits", repo(), 3, {
    extraEnv: { GITHUB_ACTIONS: "true", GATE_BASE: "HEAD", GATE_HEAD: "HEAD" },
  });
});
test("commits: a repository without origin/main cannot be checked", () => {
  const root = branch("feat: x");
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  expect("commits", root, 3);
});
test("commits: CI's range from GATE_BASE and GATE_HEAD is the one checked", () => {
  const root = branch("Add a thing", "feat: fine");
  const base = git(root, "rev-parse", "HEAD~1").trim();
  expect("commits", root, 0, {
    extraEnv: { GATE_BASE: base, GATE_HEAD: "HEAD" },
  });
});

/** Runs the commit-msg entry on a message file holding `text`. */
function commitMsg(text: string, code: number): string {
  const file = join(tempDir(), "COMMIT_EDITMSG");
  writeFileSync(file, text);
  const r = run(["commit-msg", file]);
  assert.equal(r.code, code, r.out);
  return r.out;
}
test("commit-msg: a conventional header passes", () => {
  commitMsg("# a comment git adds\nfeat: add a thing\n\nThe body.\n", 0);
});
test("commit-msg: a header without a type is a finding", () => {
  assert.match(commitMsg("Add a thing\n", 1), /^FINDING commit-msg/m);
});
test("commit-msg: git's merge header passes", () => {
  commitMsg("Merge branch 'main' into chore/hooks\n", 0);
});
test("commit-msg: an empty message is a finding", () => {
  commitMsg("# only a comment\n", 1);
});
test("commit-msg: a message file that cannot be read is a usage error", () => {
  const r = run(["commit-msg", join(tempDir(), "absent")]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /^USAGE commit-msg: cannot read the message file /m);
});

test("commit-msg: git runs the hook and refuses a header that is not conventional", () => {
  const root = repo((r) => {
    for (const f of ["check-repo.ts", "pinned.ts"])
      put(r, `scripts/${f}`, readFileSync(join(here, f)));
  });
  commit(root, "chore: add the runner");
  git(root, "config", "core.hooksPath", ".githooks");
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  const gitCommit = (message: string) => {
    const r = spawnSync(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.org",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-q",
        "-m",
        message,
      ],
      { encoding: "utf8", env: GIT_ENV },
    );
    return { code: r.status, out: r.stdout + r.stderr };
  };
  const head = () => git(root, "log", "-1", "--format=%s").trim();
  const refused = gitCommit("Add a note");
  assert.notEqual(refused.code, 0, refused.out);
  assert.match(refused.out, /^FINDING commit-msg: /m);
  assert.equal(head(), "chore: add the runner");
  const taken = gitCommit("docs: add a note");
  assert.equal(taken.code, 0, taken.out);
  assert.equal(head(), "docs: add a note");
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
  // The fixture has no commit after origin/main, so the commits and secrets steps have nothing to check.
  const out = expect("all", repo(), 0);
  assert.match(
    out,
    /^PASS all: 15 checks passed, 3 not applicable: svelte, commits, secrets$/m,
  );
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
