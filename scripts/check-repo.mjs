// check-repo: the repository checks that need no product code, and `all`, the gate command that runs them.
//   node scripts/check-repo.mjs <check> [--root <dir>]      check: all, selftest, files, pins, gate-needs, links, actionlint
//   node scripts/check-repo.mjs needs '<json>'              CI only: the `needs` context of the `gate` job
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// Files are listed with `git ls-files`, so only tracked files are read.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, posix } from "node:path";
import { fileURLToPath } from "node:url";

const PASS = 0, FINDING = 1, USAGE = 2, CANNOT = 3;
const WORD = { [PASS]: "PASS", [FINDING]: "FINDING", [USAGE]: "USAGE", [CANNOT]: "COULD NOT CHECK" };
const LICENSE_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"; // apache.org LICENSE-2.0.txt
const COPYRIGHT = "Copyright 2026 R. Hannes Niedner";
const REQUIRED = [
  "README.md", "LICENSE", "NOTICE", "CONTRIBUTING.md", "SECURITY.md", ".gitignore", ".node-version", "AGENTS.md",
  "docs/engineering/method.md", "docs/engineering/gates.md", "scripts/actionlint.version",
  ".github/workflows/ci.yml", ".github/workflows/dependency-review.yml", ".github/workflows/scorecard.yml",
  ".github/dependabot.yml", ".github/CODEOWNERS",
];
const TEST_FILE = "scripts/check-repo.test.mjs";
const CI_FILE = ".github/workflows/ci.yml";
const PINNED = /^["']?[\w.-]+\/[\w./-]+@[0-9a-f]{40}["']? # \S+/;

const result = (code, summary, details = []) => ({ code, summary, details });

function tracked(root) {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const files = r.stdout.split("\0").filter(Boolean);
  return files.length ? new Set(files) : null;
}

function files(root, list) {
  const details = [];
  for (const f of REQUIRED) if (!list.has(f) || !existsSync(join(root, f))) details.push(`missing: ${f}`);
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f)) : Buffer.alloc(0));
  if (createHash("sha256").update(read("LICENSE")).digest("hex") !== LICENSE_SHA256) details.push("LICENSE: not the Apache-2.0 text");
  if (!read("NOTICE").toString().includes(COPYRIGHT)) details.push(`NOTICE: no line "${COPYRIGHT}"`);
  if (!read(".gitignore").toString().split("\n").includes("/tmp/")) details.push(".gitignore: no line /tmp/");
  if (details.length) return result(FINDING, `${details.length} problem(s)`, details);
  return result(PASS, `${REQUIRED.length} required files present, LICENSE, NOTICE and .gitignore as required`);
}

function pins(root, list) {
  const yaml = [...list].filter((f) => /^\.github\/.*\.ya?ml$/.test(f));
  if (!yaml.length) return result(CANNOT, "no YAML file under .github/");
  let uses = 0;
  const details = [];
  for (const f of yaml) {
    readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
      const m = /^\s*(?:-\s*)?uses\s*:\s*(.*)$/.exec(line);
      if (!m) return;
      uses += 1;
      if (!PINNED.test(m[1])) details.push(`${f}:${i + 1}: not "owner/repo@<40-hex sha> # <tag>": ${m[1].trim()}`);
    });
  }
  if (!uses) return result(CANNOT, `no uses line in ${yaml.length} YAML file(s)`);
  if (details.length) return result(FINDING, `${details.length} of ${uses} uses line(s) not pinned`, details);
  return result(PASS, `${uses} uses line(s) in ${yaml.length} YAML file(s), all pinned by SHA with a tag`);
}

function gateNeeds(root, list) {
  if (!list.has(CI_FILE)) return result(CANNOT, `${CI_FILE} is not tracked`);
  const lines = readFileSync(join(root, CI_FILE), "utf8").split("\n");
  const start = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (start < 0) return result(CANNOT, `${CI_FILE}: no top-level jobs: line`);
  const jobs = new Map();
  let current = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const id = /^ {2}([\w-]+):\s*$/.exec(line);
    if (id) jobs.set((current = id[1]), []);
    else if (current) jobs.get(current).push(line);
  }
  if (!jobs.size) return result(CANNOT, `${CI_FILE}: no job found under jobs:`);
  if (!jobs.has("gate")) return result(FINDING, `${CI_FILE}: no job named gate`);
  const body = jobs.get("gate");
  const needsLine = body.find((l) => /^ {4}needs\s*:/.test(l));
  const flow = needsLine && /^ {4}needs: \[([\w\s,-]*)\]\s*$/.exec(needsLine);
  if (needsLine && !flow) return result(CANNOT, `${CI_FILE}: gate's needs is not written as needs: [a, b]`);
  const needs = new Set(flow ? flow[1].split(",").map((s) => s.trim()).filter(Boolean) : []);
  const details = [...jobs.keys()].filter((j) => j !== "gate" && !needs.has(j)).map((j) => `gate does not need job ${j}`);
  if (!body.some((l) => /^ {4}if: always\(\)\s*$/.test(l))) details.push("gate has no line `if: always()`");
  if (details.length) return result(FINDING, `${details.length} problem(s) in the gate job`, details);
  return result(PASS, `gate always runs and needs all ${jobs.size - 1} other job(s)`);
}

function links(root, list) {
  const markdown = [...list].filter((f) => f.endsWith(".md"));
  if (!markdown.length) return result(CANNOT, "no tracked Markdown file");
  const dirs = new Set([...list].flatMap((f) => f.split("/").slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join("/"))));
  let count = 0;
  const details = [];
  for (const f of markdown) {
    readFileSync(join(root, f), "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].replace(/[#?].*$/, "");
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue;
        count += 1;
        const path = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(f), target)).replace(/\/$/, "");
        if (!list.has(path) && !dirs.has(path)) details.push(`${f}:${i + 1}: ${m[1]} does not resolve to a tracked file`);
      }
    });
  }
  if (!count) return result(CANNOT, `no relative link in ${markdown.length} Markdown file(s)`);
  if (details.length) return result(FINDING, `${details.length} of ${count} relative link(s) broken`, details);
  return result(PASS, `${count} relative link(s) in ${markdown.length} Markdown file(s) resolve`);
}

const CANARY = "on: push\njobs:\n  nope:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ nope.value }}\n";

function actionlint(root, list) {
  const bin = process.env.ACTIONLINT_BIN || "actionlint";
  const wanted = /^version (\S+)$/m.exec(existsSync(join(root, "scripts/actionlint.version")) ? readFileSync(join(root, "scripts/actionlint.version"), "utf8") : "");
  if (!wanted) return result(CANNOT, "scripts/actionlint.version holds no line `version <x>`");
  const v = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (v.error || v.status !== 0) return result(CANNOT, `cannot run ${bin}: ${v.error?.code ?? `exit ${v.status}`}`);
  const got = v.stdout.split("\n")[0].trim();
  if (got !== wanted[1]) return result(CANNOT, `actionlint is ${got}, the pinned version is ${wanted[1]}`);
  const dir = mkdtempSync(join(tmpdir(), "actionlint-canary-"));
  try {
    writeFileSync(join(dir, "canary.yml"), CANARY);
    if (spawnSync(bin, [join(dir, "canary.yml")]).status === 0) return result(CANNOT, "actionlint passed the planted bad workflow");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const workflows = [...list].filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  if (!workflows.length) return result(CANNOT, "no workflow file");
  const r = spawnSync(bin, workflows.map((f) => join(root, f)), { cwd: root, encoding: "utf8" });
  const out = `${r.stdout}${r.stderr}`.trim().split("\n").filter(Boolean);
  if (r.status === 0) return result(PASS, `actionlint ${got} found the canary and passed ${workflows.length} workflow(s)`);
  if (r.status === 1) return result(FINDING, `actionlint reported problems in ${workflows.length} workflow(s)`, out);
  return result(CANNOT, `actionlint exited ${r.status ?? r.error?.code}`, out);
}

function selftest(root, list) {
  if (!list.has(TEST_FILE) || !existsSync(join(root, TEST_FILE))) return result(CANNOT, `${TEST_FILE} is missing`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // set when this runs inside a test run; it would change the child's reporter
  // Run the file itself, not `node --test <file>`: the latter counts a file holding no test as one passing test.
  const r = spawnSync(process.execPath, ["--test-reporter=tap", join(root, TEST_FILE)], { cwd: root, encoding: "utf8", env });
  const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(r.stdout)?.[1] ?? NaN);
  const [tests, pass, fail] = [count("tests"), count("pass"), count("fail")];
  if (!(tests > 0)) return result(CANNOT, `${TEST_FILE}: no test ran (exit ${r.status})`);
  if (r.status !== 0 || fail > 0 || pass !== tests) {
    const lines = r.stdout.split("\n").filter((l) => /^\s*not ok /.test(l));
    return result(FINDING, `${TEST_FILE}: ${fail} of ${tests} test(s) failed (exit ${r.status})`, lines);
  }
  return result(PASS, `${TEST_FILE}: ${tests} test(s) ran and passed`);
}

function needs(json) {
  let jobs;
  try {
    jobs = Object.entries(JSON.parse(json ?? ""));
  } catch {
    return result(CANNOT, "the needs context is not JSON");
  }
  if (!jobs.length) return result(CANNOT, "the needs context lists no job");
  const lines = jobs.map(([id, j]) => `${id}: ${j?.result}`);
  if (jobs.some(([, j]) => j?.result === "failure")) return result(FINDING, "a needed job failed", lines);
  if (jobs.some(([, j]) => j?.result !== "success")) return result(CANNOT, "a needed job did not run to success", lines);
  return result(PASS, `${jobs.length} needed job(s) succeeded`, lines);
}

const CHECKS = { selftest, files, pins, "gate-needs": gateNeeds, links, actionlint };

function report(name, r) {
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} ${name}: ${r.summary}`);
  return r.code;
}

function main(argv) {
  const [name, ...rest] = argv;
  if (name === "needs") return report("needs", needs(rest[0]));
  if (name !== "all" && !CHECKS[name]) return report(name ?? "", result(USAGE, `unknown check; use one of all, needs, ${Object.keys(CHECKS).join(", ")}`));
  const at = rest.indexOf("--root");
  const root = at >= 0 ? rest[at + 1] : join(dirname(fileURLToPath(import.meta.url)), "..");
  if (!root) return report(name, result(USAGE, "--root needs a folder"));
  const list = tracked(normalize(root));
  if (!list) return report(name, result(CANNOT, `${root}: git ls-files failed or lists nothing`));
  if (name !== "all") return report(name, CHECKS[name](root, list));
  for (const [step, check] of Object.entries(CHECKS)) {
    const code = report(step, check(root, list));
    if (code !== PASS) return report("all", result(code, `stopped at ${step}`));
  }
  return report("all", result(PASS, `${Object.keys(CHECKS).length} checks passed`));
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.log(`USAGE check-repo: crashed: ${e?.stack ?? e}`);
  process.exitCode = USAGE;
}
