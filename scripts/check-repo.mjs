// check-repo: the repository checks that need no product code, and `all`, the gate command that runs them.
//   node scripts/check-repo.mjs <check> [--root <dir>]      check: all, selftest, files, pins, gate-needs, links, actionlint
//   node scripts/check-repo.mjs needs '<json>'              CI only: the `needs` context of the `gate` job
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
  CANNOT = 3,
  NA = 4; // nothing of the step's kind here: exits 0, never prints PASS
const WORD = {
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
  "scripts/actionlint.version",
  ".github/workflows/ci.yml",
  ".github/workflows/dependency-review.yml",
  ".github/workflows/scorecard.yml",
  ".github/dependabot.yml",
  ".github/CODEOWNERS",
];
const TEST_FILE = "scripts/check-repo.test.mjs";
const CI_FILE = ".github/workflows/ci.yml";
const PINNED = /^["']?[\w.-]+\/[\w./-]+@[0-9a-f]{40}["']? # \S+/;

const result = (code, summary, details = []) => ({ code, summary, details });

function tracked(root) {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const files = r.stdout.split("\0").filter(Boolean);
  return files.length ? new Set(files) : null;
}

function files(root, list) {
  const details = [];
  for (const f of REQUIRED)
    if (!list.has(f) || !existsSync(join(root, f)))
      details.push(`missing: ${f}`);
  const read = (f) =>
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

function pins(root, list) {
  const yaml = [...list].filter((f) => /^\.github\/.*\.ya?ml$/.test(f));
  if (!yaml.length) return result(CANNOT, "no YAML file under .github/");
  let uses = 0;
  const details = [];
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
  if (!jobs.has("gate"))
    return result(FINDING, `${CI_FILE}: no job named gate`);
  const body = jobs.get("gate");
  const needsLine = body.find((l) => /^ {4}needs\s*:/.test(l));
  const flow = needsLine && /^ {4}needs: \[([\w\s,-]*)\]\s*$/.exec(needsLine);
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

function links(root, list) {
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
  const details = [];
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

function actionlint(root, list) {
  const bin = process.env.ACTIONLINT_BIN || "actionlint";
  const wanted = /^version (\S+)$/m.exec(
    existsSync(join(root, "scripts/actionlint.version"))
      ? readFileSync(join(root, "scripts/actionlint.version"), "utf8")
      : "",
  );
  if (!wanted)
    return result(
      CANNOT,
      "scripts/actionlint.version holds no line `version <x>`",
    );
  const v = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (v.error || v.status !== 0)
    return result(
      CANNOT,
      `cannot run ${bin}: ${v.error?.code ?? `exit ${v.status}`}`,
    );
  const got = v.stdout.split("\n")[0].trim();
  if (got !== wanted[1])
    return result(
      CANNOT,
      `actionlint is ${got}, the pinned version is ${wanted[1]}`,
    );
  const dir = mkdtempSync(join(tmpdir(), "actionlint-canary-"));
  try {
    writeFileSync(join(dir, "canary.yml"), CANARY);
    if (spawnSync(bin, [join(dir, "canary.yml")]).status === 0)
      return result(CANNOT, "actionlint passed the planted bad workflow");
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
      `actionlint ${got} found the canary and passed ${workflows.length} workflow(s)`,
    );
  if (r.status === 1)
    return result(
      FINDING,
      `actionlint reported problems in ${workflows.length} workflow(s)`,
      out,
    );
  return result(CANNOT, `actionlint exited ${r.status ?? r.error?.code}`, out);
}

function selftest(root, list) {
  if (!list.has(TEST_FILE) || !existsSync(join(root, TEST_FILE)))
    return result(CANNOT, `${TEST_FILE} is missing`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // set when this runs inside a test run; it would change the child's reporter
  // Run the file itself, not `node --test <file>`: the latter counts a file holding no test as one passing test.
  const r = spawnSync(
    process.execPath,
    ["--test-reporter=tap", join(root, TEST_FILE)],
    { cwd: root, encoding: "utf8", env },
  );
  const count = (name) =>
    Number(new RegExp(`^# ${name} (\\d+)$`, "m").exec(r.stdout)?.[1] ?? NaN);
  const [tests, pass, fail] = [count("tests"), count("pass"), count("fail")];
  if (!(tests > 0))
    return result(CANNOT, `${TEST_FILE}: no test ran (exit ${r.status})`);
  if (r.status !== 0 || fail > 0 || pass !== tests) {
    const lines = r.stdout.split("\n").filter((l) => /^\s*not ok /.test(l));
    return result(
      FINDING,
      `${TEST_FILE}: ${fail} of ${tests} test(s) failed (exit ${r.status})`,
      lines,
    );
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
  if (jobs.some(([, j]) => j?.result === "failure"))
    return result(FINDING, "a needed job failed", lines);
  if (jobs.some(([, j]) => j?.result !== "success"))
    return result(CANNOT, "a needed job did not run to success", lines);
  return result(PASS, `${jobs.length} needed job(s) succeeded`, lines);
}

function readJson(root, f) {
  try {
    return JSON.parse(readFileSync(join(root, f), "utf8"));
  } catch {
    return null;
  }
}

// Node's major must equal .node-version's (CI runs the exact pin); pnpm must be the packageManager version, because
// `pmOnFail: ignore` keeps pnpm itself from enforcing it (docs/decisions/001-quality-tooling.md).
function toolchain(root) {
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
  const bin = process.env.PNPM_BIN || "pnpm";
  const v = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (v.error || v.status !== 0)
    return result(
      CANNOT,
      `cannot run ${bin}: ${v.error?.code ?? `exit ${v.status}`}`,
    );
  if (v.stdout.trim() !== pin[1])
    return result(
      CANNOT,
      `pnpm is ${v.stdout.trim()}, packageManager pins ${pin[1]}`,
    );
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
const yamlNumber = (lines, key) =>
  Number(
    lines
      .map((l) => new RegExp(`^\\s*${key}:\\s*(\\d+)\\s*$`).exec(l)?.[1])
      .find(Boolean) ?? NaN,
  );

const readText = (root, f) =>
  existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : "";

/** The lockfile is tracked and is one YAML document (G11). */
function lockfileProblems(root, list) {
  if (!list.has("pnpm-lock.yaml")) return ["pnpm-lock.yaml is not tracked"];
  const docs = readText(root, "pnpm-lock.yaml")
    .split(/^---\s*$/m)
    .filter((d) => d.trim());
  return docs.length === 1
    ? []
    : [`pnpm-lock.yaml holds ${docs.length} YAML documents, not 1`];
}

/** Exact development dependencies; nothing ships but a svelte peer (PRD-S5). */
function packageProblems(pkg) {
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
function ageProblems(root) {
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
  const problems = [];
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
function lockfile(root, list) {
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
const CLASSES = [
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
  { match: /\.(md|ya?ml|json)$/, steps: ["format"] },
  {
    match:
      /^(LICENSE|NOTICE|\.editorconfig|\.gitignore|\.node-version|\.github\/CODEOWNERS|scripts\/[\w-]+\.version)$/,
    steps: ["text"],
  },
];

/** The tracked files a step checks, and the tracked files of no class. */
function classified(list, step) {
  const mine = [],
    unknown = [];
  for (const f of list) {
    const c = CLASSES.find((k) => k.match.test(f));
    if (!c) unknown.push(f);
    else if (c.steps.includes(step)) mine.push(f);
  }
  return { mine, unknown };
}

const CONFLICT = /^(<{7} |={7}$|>{7} )/;

// For files no formatter rewrites: LF line endings, a final newline, no trailing whitespace, no conflict marker.
function text(root, list) {
  const { mine, unknown } = classified(list, "text");
  if (unknown.length)
    return result(
      CANNOT,
      `${unknown.length} tracked file(s) of no class`,
      unknown,
    );
  if (!mine.length) return result(CANNOT, "no file to check");
  const details = [];
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
const canaries = (step) =>
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

/** A tool's own record for `files` under `root`, from the copy of `pkg` installed next to this script, or an error. */
function toolRecord(pkg, probe, root, files, extra = []) {
  let url;
  try {
    url = import.meta.resolve(pkg); // the ESM entry, next to this script
  } catch {
    return { error: `${pkg} is not installed (run pnpm install)` };
  }
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", probe, url, ...extra, root, ...files],
    { encoding: "utf8" },
  );
  try {
    return JSON.parse(r.stdout);
  } catch {
    return {
      error: `the ${pkg} probe failed (exit ${r.status}): ${r.stderr.split("\n")[0]}`,
    };
  }
}

/** The files of `step`'s class and its canary folder, or a could-not-check result. */
function toolInputs(list, step) {
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
function format(root, list) {
  const inputs = toolInputs(list, "format");
  if ("code" in inputs) return inputs;
  const { mine, dir, planted } = inputs;
  const prettierRecord = (r, f) => toolRecord("prettier", PRETTIER_PROBE, r, f);
  const canary = prettierRecord(dir, planted);
  if (canary.error) return result(CANNOT, canary.error);
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
  if (rec.error) return result(CANNOT, rec.error);
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

const LINT_CANARY_RULES = [
  "complexity",
  "no-eval",
  "no-implied-eval",
  "no-new-func",
  "no-undef",
];

// ESLint on every file of the lint class with this repository's config and no ignore patterns. The planted canary
// must raise each rule of LINT_CANARY_RULES first; any message, warning or error, is a finding (no warning budget).
function lint(root, list) {
  const inputs = toolInputs(list, "lint");
  if ("code" in inputs) return inputs;
  const { mine, dir, planted } = inputs;
  const config = [join(HERE, "..", "eslint.config.mjs")];
  const eslintRecord = (r, f) =>
    toolRecord("eslint", ESLINT_PROBE, r, f, config);
  const canary = eslintRecord(dir, planted);
  if (canary.error) return result(CANNOT, canary.error);
  const raised = new Set(
    canary.files.flatMap((c) => c.messages.map((m) => m.rule)),
  );
  const missed = LINT_CANARY_RULES.filter((rule) => !raised.has(rule));
  if (missed.length)
    return result(CANNOT, "ESLint missed planted canaries", missed);
  const pin = readJson(root, "package.json")?.devDependencies?.eslint;
  const rec = eslintRecord(root, mine);
  if (rec.error) return result(CANNOT, rec.error);
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
    `ESLint ${rec.version} raised ${LINT_CANARY_RULES.length} canary rules and accepted ${mine.length} file(s)`,
  );
}

/** jscpd's JSON report for `files` under `root`, from the jscpd installed next to this script, or an error. */
function jscpdReport(root, files) {
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
      return { error: `jscpd exited ${r.status ?? r.error?.code}` };
    const report = JSON.parse(
      readFileSync(join(out, "jscpd-report.json"), "utf8"),
    );
    // Absolute paths back to the relative paths given (the temp folder may sit behind a symlink).
    const given = (n) => files.find((f) => n.endsWith(`/${f}`)) ?? n;
    for (const d of report.duplicates)
      for (const side of [d.firstFile, d.secondFile])
        side.name = given(side.name);
    return report;
  } catch (e) {
    return { error: `no jscpd report: ${e.message.split("\n")[0]}` };
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

const at = (side) => `${side.name}:${side.start}-${side.end}`;

// Copy detection over every file of the dupes class (method section 5): any clone is a finding, so a repository that
// starts at zero stays at zero. The canary pair must be reported as one clone first. jscpd skips a file shorter than
// its minimum clone, which cannot hold a clone, so only "more than 0 files analysed" is demanded of the report.
function dupes(root, list) {
  const inputs = toolInputs(list, "dupes");
  if ("code" in inputs) return inputs;
  const { mine, dir, planted } = inputs;
  const pin = readJson(root, "package.json")?.devDependencies?.jscpd;
  const version = jscpdVersion();
  if (version !== pin)
    return result(
      CANNOT,
      `jscpd ${version} is installed, package.json pins ${pin}`,
    );
  const canary = jscpdReport(dir, planted);
  if (canary.error) return result(CANNOT, canary.error);
  const inClone = new Set(
    canary.duplicates.flatMap((d) => [d.firstFile.name, d.secondFile.name]),
  );
  const missed = planted.filter((f) => !inClone.has(f));
  if (missed.length)
    return result(CANNOT, "jscpd missed the planted clone", missed);
  const report = jscpdReport(root, mine);
  if (report.error) return result(CANNOT, report.error);
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
const headerProblem = (h) =>
  !HEADER.test(h)
    ? `"${h}": not "<type>(<scope>)?!?: <subject>" with a type of ${TYPES.join(", ")}`
    : h.length > MAX_HEADER
      ? `"${h}": ${h.length} characters, more than ${MAX_HEADER}`
      : null;

/** The range to check: CI passes GATE_BASE and GATE_HEAD; locally it is the branch after origin/main. */
function commitRange(root) {
  const run = (...a) =>
    spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  if (process.env.GATE_BASE) {
    if (/^0+$/.test(process.env.GATE_BASE))
      return { error: "GATE_BASE is all zeros: no base commit" };
    return {
      range: `${process.env.GATE_BASE}..${process.env.GATE_HEAD || "HEAD"}`,
    };
  }
  const base = run("merge-base", "refs/remotes/origin/main", "HEAD");
  if (base.status !== 0)
    return { error: "no merge base with origin/main (fetch it first)" };
  return { range: `${base.stdout.trim()}..HEAD` };
}

// Every commit of the branch, merges left out, has a conventional header of at most 100 characters.
function commits(root) {
  const { range, error } = commitRange(root);
  if (error) return result(CANNOT, error);
  const r = spawnSync(
    "git",
    ["-C", root, "log", "--no-merges", "--format=%h %s", range],
    { encoding: "utf8" },
  );
  if (r.status !== 0)
    return result(CANNOT, `git log ${range} failed: ${r.stderr.trim()}`);
  const lines = r.stdout.split("\n").filter(Boolean);
  if (!lines.length) return result(NA, `no commit in ${range}`);
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
    `${lines.length} commit(s) in ${range}, every header conventional`,
  );
}

// The commit-msg hook's check of one message file. git's own merge header passes; the gate's range check, which
// leaves real merges out, still catches a non-merge commit that only looks like one.
function commitMsg(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return result(USAGE, `cannot read the message file ${file}`);
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

const CHECKS = {
  toolchain,
  selftest,
  files,
  lockfile,
  text,
  format,
  lint,
  dupes,
  commits,
  pins,
  "gate-needs": gateNeeds,
  links,
  actionlint,
};

function report(name, r) {
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} ${name}: ${r.summary}`);
  return r.code === NA ? PASS : r.code;
}

function main(argv) {
  const [name, ...rest] = argv;
  if (name === "needs") return report("needs", needs(rest[0]));
  if (name === "commit-msg") return report(name, commitMsg(rest[0]));
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
  console.log(`USAGE check-repo: crashed: ${e?.stack ?? e}`);
  process.exitCode = USAGE;
}
