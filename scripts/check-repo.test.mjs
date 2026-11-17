// Tests for check-repo.mjs. Each case builds a small git repository in a temporary folder, plants one break
// and asserts the exit code and the first word of the output: 0 PASS, 1 FINDING, 3 COULD NOT CHECK.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "check-repo.mjs");
const LICENSE = readFileSync(join(here, "..", "LICENSE"));
const SHA = "0123456789abcdef0123456789abcdef01234567";
const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "check-repo-"));
  made.push(d);
  return d;
}

function put(root, path, text) {
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
const PASSING_TEST = `import { test } from "node:test";\ntest("one", () => {});\n`;

/** A repository that passes every check; `change` plants the break before the files are staged. */
function repo(change = () => {}) {
  const root = tempDir();
  const files = {
    "README.md": "# Fixture\n\nSee [the method](docs/engineering/method.md).\n",
    LICENSE,
    NOTICE: "Fixture\nCopyright 2026 R. Hannes Niedner\n",
    "CONTRIBUTING.md": "# Contributing\n",
    "SECURITY.md": "# Security\n",
    ".gitignore": "/tmp/\n",
    ".node-version": "26.0.0\n",
    "docs/engineering/method.md": "# Method\n\n[Companion](gates.md), [site](https://example.org/a), [top](#method).\n",
    "docs/engineering/gates.md": "# Gates\n",
    "AGENTS.md": "# Agents\n",
    "scripts/actionlint.version": "version 9.9.9\nlinux_amd64_sha256 00\n",
    "scripts/check-repo.test.mjs": PASSING_TEST,
    ".github/workflows/ci.yml": CI,
    ".github/workflows/dependency-review.yml": "on: [pull_request]\n",
    ".github/workflows/scorecard.yml": "on: [push]\n",
    ".github/dependabot.yml": "version: 2\n",
    ".github/CODEOWNERS": "* @someone\n",
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  change(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  return root;
}

/** A stand-in for actionlint: reports `version`, fails a file holding `nope` (the canary) or `bad`. */
function fakeLint({ version = "9.9.9", canary = true } = {}) {
  const bin = join(tempDir(), "actionlint");
  const script = `#!/bin/sh
if [ "$1" = "-version" ]; then echo "${version}"; exit 0; fi
${canary ? 'if grep -q nope "$@"; then echo "canary found"; exit 1; fi' : ""}
if grep -q bad "$@"; then echo "bad workflow"; exit 1; fi
exit 0
`;
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return bin;
}

function run(args, { lint = fakeLint() } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env: { ...process.env, ACTIONLINT_BIN: lint } });
  return { code: r.status, out: r.stdout + r.stderr };
}

/** Runs one check on a repository and asserts its exit code and the word its last line starts with. */
function expect(check, root, code, opts) {
  const r = run([check, "--root", root], opts);
  const word = ["PASS", "FINDING", "", "COULD NOT CHECK"][code];
  assert.equal(r.code, code, r.out);
  assert.match(r.out.trim().split("\n").at(-1), new RegExp(`^${word} ${check}\\b`), r.out);
  return r.out;
}

const edit = (path, from, to) => (root) => {
  const text = readFileSync(join(root, path), "utf8");
  assert.ok(text.includes(from), `fixture ${path} lacks ${from}`);
  put(root, path, text.replace(from, to));
};
const remove = (path) => (root) => rmSync(join(root, path));

test("files: passes on a complete repository", () => {
  expect("files", repo(), 0);
});
test("files: a missing required file is a finding", () => {
  assert.match(expect("files", repo(remove("SECURITY.md")), 1), /SECURITY\.md/);
});
test("files: a LICENSE that differs by one byte is a finding", () => {
  expect("files", repo((root) => put(root, "LICENSE", LICENSE.toString().replace("Apache", "Apachf"))), 1);
});
test("files: a NOTICE without the copyright line is a finding", () => {
  expect("files", repo(edit("NOTICE", "Copyright 2026 R. Hannes Niedner", "Copyright")), 1);
});
test("files: a .gitignore without /tmp/ is a finding", () => {
  expect("files", repo(edit(".gitignore", "/tmp/", "/other/")), 1);
});
test("files: a folder that is not a git repository cannot be checked", () => {
  expect("files", tempDir(), 3);
});

test("pins: passes when every action is pinned by a full SHA with its tag", () => {
  expect("pins", repo(), 0);
});
test("pins: a tag instead of a SHA is a finding", () => {
  assert.match(expect("pins", repo(edit(".github/workflows/ci.yml", `@${SHA} # v1.0.0`, "@v4")), 1), /ci\.yml:6/);
});
test("pins: a shortened commit hash is a finding", () => {
  expect("pins", repo(edit(".github/workflows/ci.yml", `@${SHA}`, `@${SHA.slice(0, 7)}`)), 1);
});
test("pins: a SHA without its tag comment is a finding", () => {
  expect("pins", repo(edit(".github/workflows/ci.yml", " # v1.0.0", "")), 1);
});
test("pins: a .yaml file outside the workflows folder is read too", () => {
  expect("pins", repo((root) => put(root, ".github/actions/x/action.yaml", "steps:\n  - uses: a/b@v1\n")), 1);
});
test("pins: a local or docker action is a finding", () => {
  expect("pins", repo(edit(".github/workflows/ci.yml", `actions/checkout@${SHA} # v1.0.0`, "./local")), 1);
});
test("pins: a workflow whose only uses line is a comment cannot be checked", () => {
  expect("pins", repo(edit(".github/workflows/ci.yml", "- uses:", "# - uses:")), 3);
});
test("pins: a repository without workflow files cannot be checked", () => {
  expect("pins", repo((root) => rmSync(join(root, ".github/workflows"), { recursive: true })), 3);
});

test("gate-needs: passes when gate always runs and needs every other job", () => {
  expect("gate-needs", repo(), 0);
});
test("gate-needs: a job missing from gate's needs is a finding", () => {
  const more = CI.replace("  gate:", "  extra:\n    runs-on: ubuntu-latest\n  gate:");
  assert.match(expect("gate-needs", repo((root) => put(root, ".github/workflows/ci.yml", more)), 1), /extra/);
});
test("gate-needs: a gate without `if: always()` is a finding", () => {
  expect("gate-needs", repo(edit(".github/workflows/ci.yml", "    if: always()\n", "")), 1);
});
test("gate-needs: a workflow without a gate job is a finding", () => {
  expect("gate-needs", repo(edit(".github/workflows/ci.yml", "  gate:", "  other:")), 1);
});
test("gate-needs: needs written as a block list cannot be checked", () => {
  expect("gate-needs", repo(edit(".github/workflows/ci.yml", "needs: [static]", "needs:\n      - static")), 3);
});

test("links: passes when every relative link resolves", () => {
  expect("links", repo(), 0);
});
test("links: a link to a missing file is a finding", () => {
  assert.match(expect("links", repo(edit("README.md", "docs/engineering/method.md", "docs/missing.md")), 1), /README\.md:3/);
});
test("links: a link to an untracked file is a finding", () => {
  const root = repo();
  put(root, "local-note.md", "# Local\n");
  put(root, "README.md", "See [a note](local-note.md).\n");
  execFileSync("git", ["-C", root, "add", "README.md"]);
  expect("links", root, 1);
});
test("links: a repository without any relative link cannot be checked", () => {
  const none = (root) => ["README.md", "docs/engineering/method.md"].forEach((f) => put(root, f, "# No links\n"));
  expect("links", repo(none), 3);
});

test("actionlint: passes when the pinned binary finds the canary and accepts the workflows", () => {
  expect("actionlint", repo(), 0);
});
test("actionlint: a workflow the linter rejects is a finding", () => {
  expect("actionlint", repo(edit(".github/workflows/ci.yml", "echo done", "echo bad")), 1);
});
test("actionlint: another version than the pinned one cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: fakeLint({ version: "1.0.0" }) });
});
test("actionlint: a linter that misses the canary cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: fakeLint({ canary: false }) });
});
test("actionlint: a missing binary cannot be checked", () => {
  expect("actionlint", repo(), 3, { lint: join(tempDir(), "absent") });
});

test("selftest: passes when the repository's own tests run and pass", () => {
  expect("selftest", repo(), 0);
});
test("selftest: a failing test is a finding", () => {
  const failing = PASSING_TEST.replace("() => {}", '() => { throw new Error("planted"); }');
  expect("selftest", repo((root) => put(root, "scripts/check-repo.test.mjs", failing)), 1);
});
test("selftest: a test file that holds no test cannot be checked", () => {
  expect("selftest", repo((root) => put(root, "scripts/check-repo.test.mjs", "// empty\n")), 3);
});
test("selftest: a missing test file cannot be checked", () => {
  expect("selftest", repo(remove("scripts/check-repo.test.mjs")), 3);
});

const needs = (json, code) => {
  const r = run(["needs", json]);
  assert.equal(r.code, code, r.out);
  assert.match(r.out, new RegExp(`^${["PASS", "FINDING", "", "COULD NOT CHECK"][code]} needs\\b`, "m"));
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

test("all: passes when every step passes", () => {
  expect("all", repo(), 0);
});
test("all: returns the failing step's finding and names the step", () => {
  const out = expect("all", repo(edit("README.md", "docs/engineering/method.md", "docs/missing.md")), 1);
  assert.match(out, /^FINDING links\b/m);
});
test("all: returns could-not-check from a step that could not check", () => {
  const out = expect("all", repo(), 3, { lint: fakeLint({ version: "1.0.0" }) });
  assert.match(out, /^COULD NOT CHECK actionlint\b/m);
});
test("an unknown check is a usage error", () => {
  assert.equal(run(["nothing"]).code, 2);
});
