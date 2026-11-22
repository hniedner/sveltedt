// The fixtures and stand-ins the check-repo test files share.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_VARS } from "./gate-step.ts";

export const here = dirname(fileURLToPath(import.meta.url));
export const CLI = join(here, "check-repo.ts");
export const LICENSE = readFileSync(join(here, "..", "LICENSE"));
export const SHA = "0123456789abcdef0123456789abcdef01234567";
export const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "check-repo-"));
  made.push(d);
  return d;
}

export function put(root: string, path: string, text: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

export const CI = `on: [pull_request]
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
export const REVIEW = `on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/dependency-review-action@${SHA} # v1.0.0
        with:
          allow-licenses: ISC, MIT
`;
export const PASSING_TEST = `import { test } from "node:test";\ntest("one", () => {});\n`;
/** The fixture's root tsconfig, for components and the TypeScript beside them (svelte-check); scripts/ has its own
 * (tsc). ESLint's type-aware rules read the tsconfig.json nearest to each file. */
export const FIXTURE_TSCONFIG = `{
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
export const SCRIPTS_TSCONFIG = `{
  "extends": "../tsconfig.json",
  "include": ["**/*.ts"],
  "exclude": ["canaries/**"]
}
`;
export const NODE_MAJOR = process.versions.node.split(".")[0];
/** A script long enough for jscpd to count it (a file under its 50 tokens is not a source). */
export const TOOL = `export function describe(entries) {
  const lines = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null) continue;
    lines.push(key + " = " + String(value).trim());
  }
  return lines.sort().join("\\n");
}
`;
/** TypeScript long enough for jscpd to analyse, and unlike TOOL, so the two are no clone. */
export const TOOL_TS = `export function gross(prices: number[], rate: number): number {
  let sum = 0;
  for (const price of prices) {
    if (!Number.isFinite(price) || price < 0) continue;
    sum += price * (1 + rate);
  }
  return Math.round(sum * 100) / 100;
}
`;
export interface Pkg {
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
export const PINS = (
  JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as Pkg
).devDependencies;
export const PACKAGE: Pkg = {
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
    vitest: PINS.vitest,
  },
};
export const WORKSPACE = "pmOnFail: ignore\nminimumReleaseAge: 4320\n";
export const LOCK = "lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n";
export const DEPENDABOT = `version: 2
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

/** The hooks a clone runs. */
export const HOOKS = ["pre-commit", "commit-msg", "pre-push"];
export const hookFile = (hook: string): string =>
  join(here, "..", ".githooks", hook);

/** A repository that passes every check; `change` plants the break before the files are staged. */
export function repo(change: (root: string) => void = () => {}): string {
  const root = tempDir();
  const files = {
    "README.md": "# Fixture\n\nSee [the method](docs/engineering/method.md).\n",
    LICENSE,
    NOTICE: "Fixture\nCopyright 2026 R. Hannes Niedner\n",
    "CONTRIBUTING.md": "# Contributing\n",
    "SECURITY.md": "# Security\n",
    ".gitignore": "/tmp/\n/node_modules\n/reports/\n/coverage/\n",
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
    "scripts/check-repo-hooks.test.ts": PASSING_TEST,
    "scripts/check-repo-lint.test.ts": PASSING_TEST,
    "scripts/check-repo-site.test.ts": PASSING_TEST,
    "scripts/check-repo-tools.test.ts": PASSING_TEST,
    "scripts/scan-secrets.ts": TOOL_TS,
    "scripts/scan-secrets.test.ts": PASSING_TEST,
    "scripts/setup.test.ts": PASSING_TEST,
    "scripts/trace.test.ts": PASSING_TEST,
    "scripts/gitleaks.toml": "",
    "scripts/gitleaks.version": "version 9.9.9\n",
    "scripts/tool.mjs": TOOL,
    ".github/workflows/ci.yml": CI,
    ".github/workflows/dependency-review.yml": REVIEW,
    ".github/workflows/scorecard.yml": "on: [push]\n",
    ".github/dependabot.yml": DEPENDABOT,
    ".github/CODEOWNERS": "* @someone\n",
    "svelte.config.js": "export default {};\n",
    // The committed hooks themselves, so a change to one reaches the rows that run git.
    ".githooks/pre-commit": readFileSync(hookFile("pre-commit"), "utf8"),
    ".githooks/commit-msg": readFileSync(hookFile("commit-msg"), "utf8"),
    ".githooks/pre-push": readFileSync(hookFile("pre-push"), "utf8"),
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  // The committed hooks' own mode: git skips a hook that is not executable.
  for (const h of HOOKS)
    chmodSync(join(root, ".githooks", h), statSync(hookFile(h)).mode & 0o777);
  // Like a real checkout after `pnpm install`: the TypeScript scripts find Node's types (ignored, never tracked).
  symlinkSync(join(here, "..", "node_modules"), join(root, "node_modules"));
  execFileSync("git", ["init", "-q", root], { env: GIT_ENV });
  git(root, "config", "core.hooksPath", ".githooks"); // as `git config core.hooksPath .githooks` sets it up
  commit(root, "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  change(root);
  git(root, "add", "-A");
  return root;
}

/** This process's environment without git's variables: a run inside a git hook must not reach the real repo. */
export const GIT_ENV: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);
export const git = (root: string, ...args: string[]): string =>
  execFileSync("git", ["-C", root, ...args], {
    env: GIT_ENV,
    encoding: "utf8",
  });

/**
 * Commits everything under `root` with a synthetic identity; the fixture runs no hook. The message goes through a
 * file: Linux refuses a single argument over 128 KiB, which the long-header rows need.
 */
export function commit(
  root: string,
  message: string,
  ...flags: string[]
): void {
  const file = join(tempDir(), "message");
  writeFileSync(file, message);
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
    ...flags,
    "-F",
    file,
  );
}

/**
 * A stand-in for actionlint: reports `version`; fails a file holding `nope` (the expression canary); reports SC2086
 * for an unquoted `$FOO` as shellcheck would (the shell canary); fails a file holding `bad`.
 */
export function fakeLint({
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
export function fakePnpm(
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
export function fakeVersion(name: string, version: string): string {
  const bin = join(tempDir(), name);
  writeFileSync(bin, `#!/bin/sh\necho "${version}"\n`);
  chmodSync(bin, 0o755);
  return bin;
}

/** A stand-in for zizmor: reports `version`; finds a file holding `canary` (exit 13) or `bad` (exit 12). */
export function fakeZizmor({
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

export interface RunOptions {
  lint?: string;
  pnpm?: string;
  zizmor?: string;
  gitleaks?: string;
  canaries?: string;
  extraEnv?: Record<string, string>;
}

export function run(
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
  for (const k of GATE_VARS) if (!(k in extraEnv)) delete env[k];
  if (canaries) env.CANARY_DIR = canaries;
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env,
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

/** Runs one check on a repository and asserts its exit code and the word its last line starts with. */
export function expect(
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

export const edit =
  (path: string, from: string, to: string) =>
  (root: string): void => {
    const text = readFileSync(join(root, path), "utf8");
    assert.ok(text.includes(from), `fixture ${path} lacks ${from}`);
    put(root, path, text.replace(from, to));
  };
export const remove = (path: string) => (root: string) =>
  rmSync(join(root, path));

export const pkg = (change: (p: Pkg) => unknown) => (root: string) => {
  const p = structuredClone(PACKAGE);
  change(p);
  put(root, "package.json", `${JSON.stringify(p, null, 2)}\n`);
};
/** The fixture's pnpm-workspace.yaml with `lines` before its first setting. */
export const workspace = (lines: string) =>
  edit("pnpm-workspace.yaml", "pmOnFail", `${lines}\npmOnFail`);
/** The fixture with a workspace package `site` whose manifest is `manifest` (none when null). */
export const sitePackage =
  (manifest: object | null) =>
  (root: string): void => {
    workspace("packages:\n  - site")(root);
    if (manifest) put(root, "site/package.json", JSON.stringify(manifest));
  };

/** A canary folder holding `files` (name -> text) for `step`, laid out as the steps read it: <dir>/<step>/<file>. */
export function canaryDir(step: string, files: Record<string, string>): string {
  const dir = tempDir();
  for (const [name, t] of Object.entries(files)) put(dir, join(step, name), t);
  return dir;
}
// Prettier and ESLint skip a file under a node_modules folder; only the root one is git-ignored, so one can be tracked.
export const UNDER_NODE_MODULES = "docs/node_modules/note";
// A nested Prettier config would change what "formatted" means in its folder (and a prettier.config.mjs would run).
export const nested = (data: string) => (root: string) => {
  put(root, "sub/.prettierrc.json", '{ "tabWidth": 4 }\n');
  put(root, "sub/data.json", data);
};

export const script = (body: string) => (root: string) =>
  put(root, "scripts/x.mjs", body);
/** A tracked Svelte component under src/, which the fixture's tsconfig.json includes. */
export const component =
  (body: string, path = "src/Count.svelte") =>
  (root: string): void =>
    put(root, path, body);
export const COMPONENT = `<script lang="ts">\n  const { count }: { count: number } = $props();\n</script>\n\n<p>{count}</p>\n`;
/** A tracked Vitest config and test file; the config runs src/ tests only, like a config that forgot site/. */
export const vitestTest =
  (body: string, path = "src/a.test.ts") =>
  (root: string): void => {
    put(
      root,
      "vitest.config.ts",
      'export default { test: { include: ["src/**/*.test.ts"] } };\n',
    );
    put(root, path, `import { expect, test } from "vitest";\n${body}`);
  };
export const PASSING_VITEST =
  'test("adds", () => {\n  expect(1 + 1).toBe(2);\n});\n';
// The comments that switch a check off, built from parts so this file does not hold them.
export const SUPPRESSIONS = [
  ["svelte-", "ignore"],
  ["@ts-", "expect-error"],
  ["@ts-", "nocheck"],
  ["jscpd:", "ignore"],
  ["prettier-", "ignore"],
  ["v8 ", "ignore"],
  ["c8 ", "ignore"],
  ["istanbul ", "ignore"],
].map((parts) => parts.join(""));

/** A fixture whose branch holds one commit per subject after origin/main. */
export function branch(...subjects: string[]): string {
  const root = repo();
  subjects.forEach((s, i) => {
    put(root, `notes/${i}.md`, `# Note ${i}\n`);
    commit(root, s);
  });
  return root;
}
/** The repository's own scan-secrets wrapper, replaced by one that prints its arguments and exits with `code`. */
export const fakeScan =
  (code: number) =>
  (root: string): void =>
    put(
      root,
      "scripts/scan-secrets.ts",
      `console.log("scan-secrets " + process.argv.slice(2).join(" "));\n${code === 1 ? 'console.log("FINDING scan-secrets: 1 leak(s)");\n' : ""}process.exitCode = ${code};\n`,
    );
export function scanBranch(code: number): string {
  const root = branch("feat: a commit to scan");
  fakeScan(code)(root);
  commit(root, "test: plant the fake scan wrapper");
  return root;
}

/** A home folder of its own, so a contributor's global git configuration never reaches a row. */
export function isolatedHome(global = ""): Record<string, string> {
  const home = tempDir();
  put(home, ".gitconfig", global);
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, "xdg"),
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
  };
}
