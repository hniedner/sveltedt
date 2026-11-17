// Tests for scan-secrets.ts. Each case runs the wrapper as a separate process, as the gate and CI do. Cases that
// need the scanner's real behaviour use the pinned gitleaks; refusal cases use a fake scanner that hands the
// canary run to the real one, so each refusal is reached past the canary and asserts its own reason.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

const here = import.meta.dirname;
const WRAPPER = join(here, "scan-secrets.ts");
const PIN = /^version (\S+)$/m.exec(readFileSync(join(here, "gitleaks.version"), "utf8"))?.[1] ?? "";
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "scan-secrets-test-"));
  made.push(d);
  return d;
}

function tree(root: string, files: Record<string, string>): string {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function git(repo: string, ...args: string[]): string {
  const id = ["-c", "user.name=T", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false"];
  const r = spawnSync("git", [...id, "-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

function commit(repo: string, message: string, files: Record<string, string> = {}): void {
  tree(repo, files);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "--allow-empty", "-m", message);
}

function repoWith(files: Record<string, string>): string {
  const r = tempDir();
  git(r, "init", "-q", "-b", "main");
  commit(r, "one", files);
  return r;
}

/** A token shape gitleaks' default rules flag, built at run time so no token-shaped literal sits in this file. */
function fakeToken(): string {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 36; i++) s += a[Math.floor(Math.random() * a.length)];
  return `gh${"p"}_${s}`;
}

/** A fake scanner: reports the pinned version, hands the canary run to the real gitleaks, then runs `body`. */
function fakeScanner(body: string, { canary = true, version = PIN } = {}): string {
  const p = join(tempDir(), "fake-gitleaks");
  const lines = [
    "#!/bin/sh",
    `[ "$1" = version ] && { echo ${version}; exit 0; }`,
    canary ? 'case "$*" in *scan-secrets-canary-*) exec gitleaks "$@";; esac' : "",
    body,
  ];
  writeFileSync(p, `${lines.join("\n")}\n`);
  chmodSync(p, 0o755);
  return p;
}

function run(args: string[], env: Record<string, string> = {}, wrapper = WRAPPER): { code: number; out: string } {
  const r = spawnSync(process.execPath, [wrapper, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
}

const oneFile = () => tree(tempDir(), { "a.txt": "x\n" });

before(() => {
  const v = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
  assert.ok(!v.error, "gitleaks is not installed: these tests need the pinned gitleaks on PATH");
  assert.equal(v.stdout.trim().replace(/^v/, ""), PIN, `installed gitleaks is not the pinned ${PIN}`);
});

// Directory mode

test("dir: passes a clean tree, says how much it scanned and that the canary was found", () => {
  const r = run(["dir", tree(tempDir(), { "a.txt": "hello world\n", "sub/b.md": "# title\n" })]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS scan-secrets: 2 files, \d+ bytes scanned, canary found/);
});
test("dir: a planted token is a finding with file:line, and the token is never printed", () => {
  const tok = fakeToken();
  const r = run(["dir", tree(tempDir(), { "ok.txt": "fine\n", "conf/x.env": `a=1\ntoken = "${tok}"\n` })]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FINDING scan-secrets: 1 leak/);
  assert.match(r.out, /conf\/x\.env:2/);
  assert.ok(!r.out.includes(tok));
});
test("dir: a missing directory cannot be checked", () => {
  const r = run(["dir", join(tempDir(), "nope")]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /COULD NOT CHECK scan-secrets: not a directory/);
});
test("dir: an empty directory cannot be checked", () => {
  const r = run(["dir", tempDir()]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /nothing to scan/);
});
test("dir: a scanner that reads 0 bytes of a non-empty tree cannot be checked", () => {
  const fake = fakeScanner('echo "INF scanned ~0 bytes (0) in 1ms" >&2; exit 0');
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /read 0 bytes/);
});
test("dir: a scanner that misses the canary cannot be checked", () => {
  const fake = fakeScanner('echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 0', { canary: false });
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /canary not found/);
});
test("dir: a scanner crash (exit 1) cannot be checked, never a finding or a pass", () => {
  const fake = fakeScanner('echo "boom" >&2; exit 1');
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /scanner exited 1/);
});
test("dir: a scanner that logs an error cannot be checked", () => {
  const fake = fakeScanner('echo "ERR could not read a file" >&2; echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 0');
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /logged an error/);
});
test("dir: a scanner that reports no byte count cannot be checked", () => {
  const fake = fakeScanner("exit 0");
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /did not report bytes scanned/);
});
test("dir: a leak exit without a report cannot be checked", () => {
  const fake = fakeScanner('echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 7');
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fake });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /wrote no report/);
});
test("dir: a leak exit with an empty report cannot be checked", () => {
  const body = [
    'while [ $# -gt 0 ]; do [ "$1" = --report-path ] && rp="$2"; shift; done',
    'echo "[]" > "$rp"; echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 7',
  ].join("\n");
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fakeScanner(body) });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /report is empty/);
});
test("dir: a scanner that is not installed cannot be checked", () => {
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: join(tempDir(), "no-such-bin") });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /not runnable/);
});
test("dir: a scanner of another version than the pinned one cannot be checked", () => {
  const r = run(["dir", oneFile()], { GITLEAKS_BIN: fakeScanner("exit 0", { version: "8.1.0" }) });
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /version 8\.1\.0 is not the pinned/);
});
test("dir: a missing config file cannot be checked", () => {
  const r = run(["dir", oneFile(), "--config", join(tempDir(), "none.toml")]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /config file missing/);
});
test("dir: a missing version file cannot be checked", () => {
  const copy = join(tempDir(), "scan-secrets.ts");
  copyFileSync(WRAPPER, copy);
  const r = run(["dir", oneFile(), "--config", join(here, "gitleaks.toml")], {}, copy);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /gitleaks\.version/);
});
test("a bad command line is a usage error", () => {
  assert.equal(run([]).code, 2);
  assert.equal(run(["dirx", "."]).code, 2);
  assert.equal(run(["dir", ".", "--colour", "x"]).code, 2);
});

// Git mode

test("git: passes a clean range and counts its commits", () => {
  const r = repoWith({ "a.txt": "x\n" });
  commit(r, "two", { "b.txt": "y\n" });
  const out = run(["git", r, "HEAD~1..HEAD"]);
  assert.equal(out.code, 0, out.out);
  assert.match(out.out, /PASS scan-secrets: 1 commits, \d+ bytes scanned, canary found/);
});
test("git: a token in a commit of the range is a finding with commit:file:line", () => {
  const r = repoWith({ "a.txt": "x\n" });
  const tok = fakeToken();
  commit(r, "two", { "k.txt": `t = "${tok}"\n` });
  const sha = git(r, "rev-parse", "--short=12", "HEAD");
  const out = run(["git", r, "HEAD~1..HEAD"]);
  assert.equal(out.code, 1, out.out);
  assert.ok(out.out.includes(`${sha}:k.txt:1`), out.out);
  assert.ok(!out.out.includes(tok));
});
test("git: a range ending in a merge commit passes", () => {
  const r = repoWith({ "a.txt": "x\n" });
  git(r, "switch", "-q", "-c", "side");
  commit(r, "side", { "s.txt": "s\n" });
  git(r, "switch", "-q", "main");
  commit(r, "main", { "m.txt": "m\n" });
  git(r, "merge", "-q", "--no-edit", "side");
  const out = run(["git", r, "HEAD~1..HEAD"]);
  assert.equal(out.code, 0, out.out);
});
test("git: a range holding a delete-only and an empty commit passes", () => {
  const r = repoWith({ "a.txt": "x\n", "b.txt": "y\n" });
  git(r, "rm", "-q", "b.txt");
  git(r, "commit", "-q", "-m", "delete only");
  commit(r, "empty");
  commit(r, "add", { "c.txt": "z\n" });
  const out = run(["git", r, "HEAD~3..HEAD"]);
  assert.equal(out.code, 0, out.out);
});
test("git: a token added only while resolving a merge is found", () => {
  const r = repoWith({ "a.txt": "base\n" });
  git(r, "switch", "-q", "-c", "side");
  commit(r, "side", { "a.txt": "side\n" });
  git(r, "switch", "-q", "main");
  commit(r, "main", { "a.txt": "main\n" });
  spawnSync("git", ["-C", r, "merge", "-q", "side"], { encoding: "utf8" });
  const tok = fakeToken();
  commit(r, "merge with a resolution", { "a.txt": `token = "${tok}"\n` });
  const out = run(["git", r, "HEAD~1..HEAD"]);
  assert.equal(out.code, 1, out.out);
  assert.ok(!out.out.includes(tok));
});
test("git: a bad ref range cannot be checked", () => {
  const out = run(["git", repoWith({ "a.txt": "x\n" }), "nosuchref..HEAD"]);
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /bad commit range/);
});
test("git: an empty range cannot be checked", () => {
  const out = run(["git", repoWith({ "a.txt": "x\n" }), "HEAD..HEAD"]);
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /is empty/);
});
test("git: a folder that is not a repository cannot be checked", () => {
  const out = run(["git", oneFile(), "HEAD~1..HEAD"]);
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /not a git repository/);
});
test("git: a scanner that scans fewer commits than add text cannot be checked", () => {
  const r = repoWith({ "a.txt": "x\n" });
  commit(r, "two", { "b.txt": "y\n" });
  const fake = fakeScanner('echo "INF 0 commits scanned." >&2; echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 0');
  const out = run(["git", r, "HEAD~1..HEAD"], { GITLEAKS_BIN: fake });
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /scanned 0 commits/);
});
test("git: a scanner that scans more commits than the range holds cannot be checked", () => {
  const r = repoWith({ "a.txt": "x\n" });
  commit(r, "two", { "b.txt": "y\n" });
  const fake = fakeScanner('echo "INF 5 commits scanned." >&2; echo "INF scanned ~10 bytes (10) in 1ms" >&2; exit 0');
  const out = run(["git", r, "HEAD~1..HEAD"], { GITLEAKS_BIN: fake });
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /scanned 5 commits/);
});
test("git: a scanner that reads 0 bytes cannot be checked", () => {
  const r = repoWith({ "a.txt": "x\n" });
  commit(r, "two", { "b.txt": "y\n" });
  const fake = fakeScanner('echo "INF 1 commits scanned." >&2; echo "INF scanned ~0 bytes (0) in 1ms" >&2; exit 0');
  const out = run(["git", r, "HEAD~1..HEAD"], { GITLEAKS_BIN: fake });
  assert.equal(out.code, 3, out.out);
  assert.match(out.out, /read 0 bytes/);
});
