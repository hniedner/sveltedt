// scan-secrets: the pinned gitleaks behind the gate's contract (docs/engineering/gates.md, G1 and G2).
//   node scripts/scan-secrets.ts dir <path>           scan a directory tree
//   node scripts/scan-secrets.ts git <repo> <range>   scan the commits of <range>, merge resolutions included
// Option: --config <gitleaks.toml> (default: scripts/gitleaks.toml). The pinned version is in scripts/gitleaks.version.
// Exit codes: 0 pass, 1 finding, 2 usage, 3 could not check. Leaks are printed as locations, never as values.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const T = "scan-secrets";
const PASS = 0, FINDING = 1, USAGE = 2, CANNOT = 3;
const BIN = process.env.GITLEAKS_BIN ?? "gitleaks";
const LEAK_EXIT = 7; // gitleaks' exit code for leaks; its exit 1 can then only mean a crash or bad input
const USE = "scan-secrets dir <path> | scan-secrets git <repo> <range> [--config <file>]";

class Outcome extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
const cannot = (why: string): never => {
  throw new Outcome(CANNOT, `COULD NOT CHECK ${T}: ${why}`);
};
const usage = (): never => {
  throw new Outcome(USAGE, `USAGE ${T}: ${USE}`);
};

interface Run { code: number | null; out: string; error?: Error }
function sh(cmd: string, args: string[]): Run {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { code: r.status, out: `${r.stderr ?? ""}${r.stdout ?? ""}`, error: r.error };
}

/** Regular files under root and their total size, skipping `.git` and symlinks. */
function walk(root: string): { files: number; bytes: number } {
  let files = 0, bytes = 0;
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const st = lstatSync(join(dir, name));
      if (st.isDirectory()) visit(join(dir, name));
      else if (st.isFile()) [files, bytes] = [files + 1, bytes + st.size];
    }
  };
  visit(root);
  return { files, bytes };
}

interface Leak { File: string; StartLine: number; Commit: string; RuleID: string }
interface Scan { leaks: Leak[]; bytes: number; commits: number | null }

function gitleaks(args: string[], config: string): Scan {
  const work = mkdtempSync(join(tmpdir(), "scan-secrets-"));
  const report = join(work, "report.json");
  try {
    const r = sh(BIN, [...args, "--config", config, "--exit-code", String(LEAK_EXIT), "--report-format", "json",
      "--report-path", report, "--no-banner", "--no-color", "--log-level", "info"]);
    if (r.error) cannot(`cannot run ${BIN}: ${r.error.message}`);
    if (r.code !== 0 && r.code !== LEAK_EXIT) cannot(`scanner exited ${r.code} (crash or bad input): ${r.out.trim().split("\n").pop()}`);
    const error = r.out.split("\n").find((l) => /\b(ERR|FTL)\b/.test(l));
    if (error) cannot(`scanner logged an error: ${error}`);
    const bytes = Number(/scanned ~(\d+) bytes/.exec(r.out)?.[1] ?? NaN);
    if (Number.isNaN(bytes)) cannot("scanner did not report bytes scanned");
    const commits = /(\d+) commits scanned/.exec(r.out);
    let leaks: Leak[] = [];
    if (r.code === LEAK_EXIT) {
      if (!existsSync(report)) cannot("scanner reported leaks but wrote no report");
      leaks = JSON.parse(readFileSync(report, "utf8")) as Leak[];
      if (leaks.length === 0) cannot("scanner reported leaks but the report is empty");
    }
    return { leaks, bytes, commits: commits ? Number(commits[1]) : null };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Positive control: a fake token planted in a temporary tree must be found with the same binary and config. */
function canary(config: string): void {
  const d = mkdtempSync(join(tmpdir(), "scan-secrets-canary-"));
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 36; i++) s += a[Math.floor(Math.random() * a.length)];
  writeFileSync(join(d, "canary.txt"), `token = "gh${"p"}_${s}"\n`); // assembled so no token-shaped literal is committed
  try {
    let found = false;
    try {
      found = gitleaks(["dir", d], config).leaks.length > 0;
    } catch {
      found = false;
    }
    if (!found) cannot("canary not found: the planted fake token was not reported");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
}

function preflight(config: string): void {
  const versionFile = join(import.meta.dirname, "gitleaks.version");
  const pinned = existsSync(versionFile) ? /^version (\S+)$/m.exec(readFileSync(versionFile, "utf8"))?.[1] : undefined;
  if (!pinned) cannot(`no line "version <x>" in ${versionFile}`);
  if (!existsSync(config)) cannot(`config file missing: ${config}`);
  const v = sh(BIN, ["version"]);
  if (v.error || v.code !== 0) cannot(`scanner not runnable: ${BIN}`);
  const got = v.out.trim().replace(/^v/, "");
  if (got !== pinned) cannot(`scanner version ${got} is not the pinned ${pinned}`);
  canary(config);
}

function report(leaks: Leak[], where: (l: Leak) => string): number {
  console.log(`FINDING ${T}: ${leaks.length} leak(s)`);
  for (const l of leaks) console.log(`  ${where(l)} ${l.RuleID}`);
  return FINDING;
}

/** Commits of the range that add at least one text line, with merges diffed against their first parent. */
function commitsAddingText(repo: string, range: string): number {
  const r = sh("git", ["-C", repo, "log", "--diff-merges=first-parent", "--numstat", "--format=%x00%H", range, "--"]);
  if (r.code !== 0) cannot(`git log failed for ${range}`);
  return r.out.split("\0").filter((c) => /^[1-9]\d*\t/m.test(c)).length;
}

function scanDir(target: string, config: string): number {
  const root = resolve(target);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) cannot(`not a directory: ${target}`);
  const w = walk(root);
  if (w.files === 0 || w.bytes === 0) cannot(`nothing to scan in ${target}`);
  preflight(config);
  const s = gitleaks(["dir", root], config);
  if (s.bytes === 0) cannot(`scanner read 0 bytes of a ${w.bytes}-byte tree`);
  if (s.leaks.length) return report(s.leaks, (l) => `${l.File.startsWith(root) ? l.File.slice(root.length + 1) : l.File}:${l.StartLine}`);
  console.log(`PASS ${T}: ${w.files} files, ${s.bytes} bytes scanned, canary found`);
  return PASS;
}

function scanGit(target: string, range: string, config: string): number {
  const top = sh("git", ["-C", resolve(target), "rev-parse", "--show-toplevel"]);
  if (top.code !== 0) cannot(`not a git repository: ${target}`);
  const repo = top.out.trim();
  const rl = sh("git", ["-C", repo, "rev-list", range, "--"]);
  if (rl.code !== 0) cannot(`bad commit range ${range}: ${rl.out.trim()}`);
  const total = rl.out.split("\n").filter(Boolean).length;
  if (total === 0) cannot(`commit range ${range} is empty`);
  const adding = commitsAddingText(repo, range);
  preflight(config);
  // gitleaks counts only commits that yield text to scan, so the count lies between those and the whole range.
  const s = gitleaks(["git", repo, `--log-opts=--diff-merges=first-parent ${range}`], config);
  if (s.commits === null || s.commits < adding || s.commits > total) {
    cannot(`scanner scanned ${s.commits ?? "?"} commits; the range holds ${total}, of which ${adding} add text`);
  }
  if (s.bytes === 0) cannot("scanner read 0 bytes");
  if (s.leaks.length) return report(s.leaks, (l) => `${l.Commit.slice(0, 12)}:${l.File}:${l.StartLine}`);
  console.log(`PASS ${T}: ${total} commits, ${s.bytes} bytes scanned, canary found`);
  return PASS;
}

function main(argv: string[]): number {
  const pos: string[] = [];
  let config = join(import.meta.dirname, "gitleaks.toml");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config" && i + 1 < argv.length) config = resolve(argv[++i]);
    else if (argv[i].startsWith("--")) usage();
    else pos.push(argv[i]);
  }
  const [mode, target, range] = pos;
  if (mode === "dir" && target && pos.length === 2) return scanDir(target, config);
  if (mode === "git" && target && range && pos.length === 3) return scanGit(target, range, config);
  return usage();
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof Outcome) {
    console.error(e.message);
    process.exitCode = e.code;
  } else {
    console.error(`COULD NOT CHECK ${T}: internal error: ${(e as Error).message}`);
    process.exitCode = CANNOT;
  }
}
