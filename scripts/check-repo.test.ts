// Tests for check-repo.ts. Each case builds a small git repository in a temporary folder, plants one break
// and asserts the exit code and the word its last line starts with; a usage case asserts exit 2.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  CI,
  COMPONENT,
  LICENSE,
  LOCK,
  NODE_MAJOR,
  PASSING_TEST,
  SHA,
  SUPPRESSIONS,
  canaryDir,
  commit,
  component,
  edit,
  expect,
  fakeLint,
  fakePnpm,
  fakeZizmor,
  git,
  here,
  isolatedHome,
  pkg,
  put,
  remove,
  repo,
  run,
  scanBranch,
  sitePackage,
  tempDir,
  vitestTest,
  workspace,
} from "./check-repo.fixture.ts";

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
      put(
        root,
        "LICENSE",
        LICENSE.toString().replace("Permission", "Permissioo"),
      ),
    ),
    1,
  );
});
test("files: an Apache-2.0 LICENSE is a finding that names the MIT text", () => {
  const apache = "Apache License\n Version 2.0, January 2004\n";
  assert.match(
    expect(
      "files",
      repo((root) => put(root, "LICENSE", apache)),
      1,
    ),
    /LICENSE: not the MIT text/,
  );
});
test("files: a NOTICE without the vincjo/datatables notice is a finding", () => {
  expect(
    "files",
    repo(edit("NOTICE", "vincjo/datatables", "another/library")),
    1,
  );
});
test("files: a .gitignore without /tmp/ is a finding", () => {
  expect("files", repo(edit(".gitignore", "/tmp/", "/other/")), 1);
});
test("files: a .gitignore without /reports/ or /coverage/ is a finding", () => {
  for (const line of ["/reports/", "/coverage/"])
    assert.match(
      expect("files", repo(edit(".gitignore", `${line}\n`, "")), 1),
      new RegExp(`.gitignore: no line ${line}`),
    );
});
test("files: a folder that is not a git repository cannot be checked", () => {
  expect("files", tempDir(), 3);
});
const GATE_TESTS = [
  ...["", "-hooks", "-lint", "-site", "-tools"].map(
    (s) => `scripts/check-repo${s}.test.ts`,
  ),
  "scripts/scan-secrets.test.ts",
  "scripts/setup.test.ts",
  "scripts/trace.test.ts",
];
for (const file of GATE_TESTS)
  test(`files: a deleted ${file} is a finding`, () => {
    const root = repo((r) => put(r, "scripts/other.test.mjs", PASSING_TEST));
    rmSync(join(root, file));
    execFileSync("git", ["-C", root, "add", "-A"]);
    assert.ok(expect("files", root, 1).includes(file), file);
  });

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
test("lockfile: a workspace package with workspace links and exact development versions passes", () => {
  const site = sitePackage({
    dependencies: { "@hniedner/sveltedt": "workspace:*" },
    devDependencies: { vite: "8.3.8" },
  });
  expect("lockfile", repo(site), 0);
});
test("lockfile: a workspace package's range or registry dependency is a finding that names its manifest", () => {
  const site = sitePackage({
    dependencies: { "@hniedner/sveltedt": "workspace:*", "left-pad": "1.3.0" },
    devDependencies: { vite: "^8.3.8" },
  });
  const out = expect("lockfile", repo(site), 1);
  assert.match(out, /site\/package\.json: dependencies: left-pad is "1\.3\.0"/);
  assert.match(
    out,
    /site\/package\.json: devDependencies: vite is "\^8\.3\.8"/,
  );
  assert.doesNotMatch(out, /sveltedt/);
});
test("lockfile: a workspace package without a manifest is a finding", () => {
  assert.match(
    expect("lockfile", repo(sitePackage(null)), 1),
    /site\/package\.json is missing or not JSON/,
  );
});
test("lockfile: workspace packages written in a form the step cannot read are a finding, never a pass", () => {
  for (const form of [
    "packages: [site]",
    "packages:\n- site",
    "packages: # the site",
  ]) {
    const site = (root: string): void => {
      workspace(form)(root);
      put(root, "site/package.json", "{}");
    };
    assert.match(
      expect("lockfile", repo(site), 1),
      /pnpm-workspace\.yaml: packages are named in a form this step cannot read/,
    );
  }
});
test("lockfile: every entry of the packages list is read, and the list ends at the next setting", () => {
  const list = (root: string): void => {
    workspace(
      `packages:\n  - site\n  # the tools\n\n  - "tools/x"\n# exceptions\nminimumReleaseAgeExclude:\n  - prettier@3.9.11 ${GHSA}`,
    )(root);
    put(
      root,
      "site/package.json",
      '{ "devDependencies": { "jsdom": "^31.0.1" } }',
    );
    put(
      root,
      "tools/x/package.json",
      '{ "devDependencies": { "vite": "^8.3.8" } }',
    );
  };
  const out = expect("lockfile", repo(list), 1);
  assert.match(out, /tools\/x\/package\.json: devDependencies: vite/);
  assert.match(out, /site\/package\.json: devDependencies: jsdom/);
  assert.doesNotMatch(out, /prettier/);
});
test("lockfile: an optional or peer dependency of a workspace package other than a workspace link is a finding", () => {
  const site = sitePackage({
    optionalDependencies: { "left-pad": "1.3.0" },
    peerDependencies: { svelte: "^5.0.0" },
  });
  const out = expect("lockfile", repo(site), 1);
  assert.match(out, /site\/package\.json: optionalDependencies: left-pad/);
  assert.match(out, /site\/package\.json: peerDependencies: svelte/);
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
        ".githooks/pre-commit",
        ".githooks/commit-msg",
        ".githooks/pre-push",
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
test("text: the setup script is a file of the text class", () => {
  assert.match(
    expect(
      "text",
      repo((root) => put(root, "scripts/setup", "#!/bin/sh \n")),
      1,
    ),
    /scripts\/setup/,
  );
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
test("text: a suppression word in prose is not a finding", () => {
  const prose = `# Notes\n\nNever use ${SUPPRESSIONS[0]}.\n`;
  expect(
    "text",
    repo((root) => put(root, "docs/notes.md", prose)),
    0,
  );
});
/** The step names of the result lines `all` printed, in order. */
const stepsOf = (out: string): string[] =>
  [
    ...out.matchAll(
      /^(?:PASS|FINDING|COULD NOT CHECK|NOT APPLICABLE) ([\w-]+):/gm,
    ),
  ].map((m) => m[1]);
// Pins the order: `all` stops at the first step that does not pass, so a pull request red on any later step must still
// have had its secret scan.
test("all: scans the branch's commits for secrets before it reaches a later step that fails", () => {
  const root = scanBranch(1);
  put(root, "notes/unformatted.md", "#  Not formatted\n");
  git(root, "add", "-A");
  const out = expect("all", root, 1);
  assert.match(out, /^FINDING secrets: /m);
  assert.match(out, /^FINDING all: stopped at secrets$/m);
  assert.doesNotMatch(out, /format/);
  // toolchain, then secrets: no other step reports before them
  assert.deepEqual(stepsOf(out), ["toolchain", "secrets", "all"]);
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
test("all: hooks runs right after secrets, and its finding stops all there", () => {
  const root = repo();
  git(root, "config", "--unset", "core.hooksPath");
  const out = expect("all", root, 1, { extraEnv: isolatedHome() });
  assert.deepEqual(stepsOf(out), ["toolchain", "secrets", "hooks", "all"]);
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
// The static job leaves the browser step to its own CI job through GATE_BROWSER: allowed only outside the job browser,
// and only when a job browser that runs the step exists and gate needs it
const ciWith = (ci: string) => (root: string) =>
  put(root, ".github/workflows/ci.yml", ci);
const leavesBrowser = CI.replace(
  "    runs-on: ubuntu-latest\n    steps:\n      - uses",
  "    runs-on: ubuntu-latest\n    env:\n      GATE_BROWSER: job\n    steps:\n      - uses",
);
const browserJob = (ci: string, run = "node scripts/check-repo.ts browser") =>
  ci
    .replace(
      "  gate:",
      `  browser:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${run}\n  gate:`,
    )
    .replace("needs: [static]", "needs: [static, browser]");
test("gate-needs: GATE_BROWSER needs a browser job that runs the step", () => {
  for (const ci of [
    leavesBrowser,
    browserJob(leavesBrowser, "echo ok"),
    browserJob(leavesBrowser, "echo node scripts/check-repo.ts browser"),
    browserJob(leavesBrowser, "node scripts/check-repo.ts browser || true"),
  ])
    assert.match(
      expect("gate-needs", repo(ciWith(ci)), 1),
      /GATE_BROWSER is set but no job named browser runs the step/,
    );
  expect("gate-needs", repo(ciWith(browserJob(leavesBrowser))), 0);
});
test("gate-needs: GATE_BROWSER for the whole workflow or in the browser job is a finding", () => {
  const top = browserJob(CI).replace(
    "jobs:\n",
    "env:\n  GATE_BROWSER: job\njobs:\n",
  );
  assert.match(
    expect("gate-needs", repo(ciWith(top)), 1),
    /GATE_BROWSER is set for the whole workflow/,
  );
  const inJob = browserJob(leavesBrowser).replace(
    "  browser:\n    runs-on: ubuntu-latest\n",
    "  browser:\n    runs-on: ubuntu-latest\n    env:\n      GATE_BROWSER: job\n",
  );
  assert.match(
    expect("gate-needs", repo(ciWith(inJob)), 1),
    /GATE_BROWSER is set in the job browser/,
  );
});
test("gate-needs: a job browser that may pass without the step is a finding", () => {
  // An if: or a continue-on-error at job level, on the step itself, after it, or on another step
  for (const shape of [
    "    continue-on-error: true\n    steps:\n      - run: node",
    "    if: false\n    steps:\n      - run: node",
    "    steps:\n      - continue-on-error: true\n        run: node",
    "    steps:\n      - run: node scripts/check-repo.ts browser\n        continue-on-error: true\n      - run: node",
    "    steps:\n      - name: Upload\n        if: failure()\n        run: echo up\n      - run: node",
  ]) {
    const ci = browserJob(leavesBrowser).replace(
      "    steps:\n      - run: node",
      shape,
    );
    assert.match(
      expect("gate-needs", repo(ciWith(ci)), 1),
      /the job browser has continue-on-error or if/,
    );
  }
  // A named step's run line is fine
  const named = browserJob(leavesBrowser).replace(
    "- run: node",
    "- name: Browser\n        run: node",
  );
  expect("gate-needs", repo(ciWith(named)), 0);
});
test("gate-needs: a browser job without GATE_BROWSER passes", () => {
  expect("gate-needs", repo(ciWith(browserJob(CI))), 0);
});
// The static job leaves the mutation step to the job mutation by the same rules as the browser step
const leavesMutation = leavesBrowser.replaceAll(
  "GATE_BROWSER",
  "GATE_MUTATION",
);
const mutationJob = (ci: string, run = "node scripts/check-repo.ts mutation") =>
  browserJob(ci, run)
    .replace("  browser:", "  mutation:")
    .replace("static, browser]", "static, mutation]");
test("gate-needs: GATE_MUTATION needs a mutation job that runs the step, set in no other place", () => {
  for (const ci of [
    leavesMutation,
    mutationJob(leavesMutation, "echo ok"),
    mutationJob(leavesMutation, "node scripts/check-repo.ts browser"),
  ])
    assert.match(
      expect("gate-needs", repo(ciWith(ci)), 1),
      /GATE_MUTATION is set but no job named mutation runs the step/,
    );
  expect("gate-needs", repo(ciWith(mutationJob(leavesMutation))), 0);
  const top = mutationJob(CI).replace(
    "jobs:\n",
    "env:\n  GATE_MUTATION: job\njobs:\n",
  );
  assert.match(
    expect("gate-needs", repo(ciWith(top)), 1),
    /GATE_MUTATION is set for the whole workflow/,
  );
  const inJob = mutationJob(leavesMutation).replace(
    "  mutation:\n    runs-on: ubuntu-latest\n",
    "  mutation:\n    runs-on: ubuntu-latest\n    env:\n      GATE_MUTATION: job\n",
  );
  assert.match(
    expect("gate-needs", repo(ciWith(inJob)), 1),
    /GATE_MUTATION is set in the job mutation/,
  );
  const unsure = mutationJob(leavesMutation).replace(
    "    steps:\n      - run: node",
    "    if: false\n    steps:\n      - run: node",
  );
  assert.match(
    expect("gate-needs", repo(ciWith(unsure)), 1),
    /the job mutation has continue-on-error or if/,
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
test("selftest: a test file the gate runs sees none of the gate's context variables", () => {
  const sees = `import assert from "node:assert/strict";
import { test } from "node:test";
test("no gate variable", () => {
  for (const k of [
    "CANARY_DIR",
    "GATE_BASE",
    "GATE_BROWSER",
    "GATE_EVENT",
    "GATE_HEAD",
    "GATE_MUTATION",
    "GITHUB_ACTIONS",
  ])
    assert.equal(process.env[k], undefined, k);
});
`;
  expect(
    "selftest",
    repo((root) => put(root, "scripts/check-repo.test.ts", sees)),
    0,
    {
      extraEnv: {
        GITHUB_ACTIONS: "true",
        GATE_EVENT: "pull_request",
        GATE_BASE: "HEAD",
        GATE_BROWSER: "job",
        GATE_HEAD: "HEAD",
        CANARY_DIR: join(here, "canaries"),
      },
    },
  );
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
    GATE_TESTS.forEach((f) => rmSync(join(root, f)));
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
/**
 * A test file that passes only if every file in `others` ran while it ran: each marks `<name>.running` when it starts
 * and `<name>.ended` when its process exits, and one that had ended before this one began does not count. The wait is
 * bounded by `ms` only to end a wait that can never be met; no row passes by it.
 */
const meets = (
  name: string,
  others: string[],
  ms: number,
) => `import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";
const at = (n, s) => new URL(\`./\${n}.\${s}\`, import.meta.url);
const others = ${JSON.stringify(others)};
const gone = others.filter((n) => existsSync(at(n, "ended")));
writeFileSync(at("${name}", "running"), "");
process.on("exit", () => writeFileSync(at("${name}", "ended"), ""));
test("${name} runs beside the others", () => {
  const all = () => !gone.length && others.every((n) => existsSync(at(n, "running")));
  const end = Date.now() + ${ms};
  while (!all() && !gone.length && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  assert.ok(all(), "the other test files did not run at the same time");
});
`;
/** `count` files named f0, f1, ..., each meeting all the others. */
const meeting = (count: number, ms: number) => (root: string) => {
  const names = Array.from({ length: count }, (_, i) => `f${i}`);
  for (const n of names)
    put(
      root,
      `scripts/${n}.test.mjs`,
      meets(
        n,
        names.filter((o) => o !== n),
        ms,
      ),
    );
};
test("selftest: as many test files run at once as the machine has cores", () => {
  // One core gives one lane, and one file meets no other: the row still holds
  const out = expect(
    "selftest",
    repo(meeting(availableParallelism(), 30_000)),
    0,
  );
  assert.match(out, /scripts\/f0\.test\.mjs: 1 passed/);
});
test("selftest: no more test files run at once than the machine has cores", () => {
  // One file more than the cores, each needing all the others beside it: the first to end cannot have had them all
  const out = expect(
    "selftest",
    repo(meeting(availableParallelism() + 1, 10_000)),
    1,
  );
  assert.match(out, /not ok 1 - f\d+ runs beside the others/);
});
test("selftest: a failing file among several is named, the others counted, in the order of their names", () => {
  // a ends last on purpose (it waits, bounded, for b and c to end), so the order of the lines is not the order of ends
  const ended = (name: string, body: string) =>
    `import { writeFileSync as w } from "node:fs";\nprocess.on("exit", () => w(new URL("./${name}.ended", import.meta.url), ""));\n${body}`;
  const last = `import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { test } from "node:test";
test("a ends last", () => {
  // One lane runs the files in turn: the order of ends is then the order of names anyway
  if (availableParallelism() < 2) return;
  const done = () => ["b", "c"].every((n) => existsSync(new URL(\`./\${n}.ended\`, import.meta.url)));
  const end = Date.now() + 30_000;
  while (!done() && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  assert.ok(done(), "b and c did not end while a ran");
});
`;
  const failing = PASSING_TEST.replace(
    "() => {}",
    '() => { throw new Error("planted"); }',
  );
  const out = expect(
    "selftest",
    repo((root) => {
      put(root, "scripts/a.test.mjs", last);
      put(root, "scripts/b.test.mjs", ended("b", failing));
      put(root, "scripts/c.test.mjs", ended("c", PASSING_TEST));
    }),
    1,
  );
  assert.match(
    out,
    /scripts\/a\.test\.mjs: 1 passed\n {2}scripts\/b\.test\.mjs: 1 of 1 failed[^\n]*\n.*\n {2}scripts\/c\.test\.mjs: 1 passed/,
  );
});
test("selftest: a test file killed by a signal cannot be checked, and its line names the signal", () => {
  const out = expect(
    "selftest",
    repo((root) =>
      put(
        root,
        "scripts/other.test.mjs",
        'process.kill(process.pid, "SIGKILL");\n',
      ),
    ),
    3,
  );
  assert.match(
    out,
    /scripts\/other\.test\.mjs: no test ran \(killed by SIGKILL\)/,
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
  // The fixture has no component, no site, no test file, no spec, no browser test and no commit after origin/main:
  // svelte, site, inline, stylesheet, package, consumer, test, trace, diff-coverage, red-check, mutation, browser, commits and secrets have nothing to check.
  const out = expect("all", repo(), 0);
  assert.match(
    out,
    /^PASS all: 16 checks passed, 14 not applicable: secrets, svelte, site, inline, stylesheet, package, consumer, test, trace, diff-coverage, red-check, mutation, browser, commits$/m,
  );
});
test("consumer: with no tracked consumer/package.json the step is not applicable", () => {
  const r = run(["consumer", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE consumer: no consumer\/package\.json is tracked$/m,
  );
});
test("consumer: a tracked consumer project runs check-consumer.ts, which needs no LICENSE and cannot build here", () => {
  // check-package.ts reads LICENSE first and would crash (exit 2) in this repository, so the exit 3 names the script
  const out = expect(
    "consumer",
    repo((root) => {
      put(root, "consumer/package.json", "{}\n");
      put(root, "consumer/pnpm-lock.yaml", "\n");
      remove("LICENSE")(root);
    }),
    3,
  );
  assert.match(out, /svelte-package exited/);
});
test("package: with nothing tracked under src/lib the step is not applicable", () => {
  const r = run(["package", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE package: nothing is tracked under src\/lib$/m,
  );
});
test("stylesheet: with nothing tracked under src/lib the step is not applicable", () => {
  const r = run(["stylesheet", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE stylesheet: nothing is tracked under src\/lib$/m,
  );
});
test("stylesheet: a stylesheet with a raw colour is a finding that names the statement", () => {
  const out = expect(
    "stylesheet",
    repo((root) => {
      put(
        root,
        "src/lib/styles.css",
        '/* @spec("TST-01") */\n.sdt-x { color: #333 }\n',
      );
      put(
        root,
        "spec/a.md",
        "# S\n\n**TST-01** A real-browser statement.\n- Reason: r.\n- Layer: real browser.\n- Traces: PRD-A1.\n",
      );
      put(
        root,
        "docs/styling.md",
        "## Tokens\n\n| Token | Paints | Fallback |\n|---|---|---|\n| `--sdt-a` | x | `Canvas` |\n",
      );
    }),
    1,
  );
  assert.match(out, /THEME-01 src\/lib\/styles\.css: color: #333/);
});
test("all: test, trace and diff-coverage share one vitest run", () => {
  // A wrapper around the real vitest that counts the runs of the repository's tests (the canaries run without --config)
  const calls = join(tempDir(), "calls");
  const wrapper = join(tempDir(), "vitest");
  const real = join(here, "..", "node_modules", ".bin", "vitest");
  writeFileSync(
    wrapper,
    `#!/bin/sh\ncase " $* " in *" --config "*) echo run >> "${calls}";; esac\nexec "${real}" "$@"\n`,
  );
  chmodSync(wrapper, 0o755);
  const marked = (root: string): void => {
    vitestTest(
      '// @spec("TST-01", "cee49bc1")\ntest("adds", () => {\n  expect(1 + 1).toBe(2);\n});\n',
    )(root);
    put(
      root,
      "spec/a.md",
      "# Spec\n\n**TST-01** A sum MUST add.\n\n- Reason: a sum is useful.\n- Layer: unit.\n- Traces: PRD-A1.\n",
    );
    // ESLint's type-aware rules need the config in the program, as the real tsconfig.json has it
    edit("tsconfig.json", '"test"]', '"test", "vitest.config.ts"]')(root);
    component(COMPONENT)(root); // the svelte step cannot pass without one
    // The component is on origin/main; the branch changes one module the test covers
    commit(root, "chore: the component");
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    put(
      root,
      "src/sum.ts",
      "export const sum = (a: number): number => a + 1;\n",
    );
    put(
      root,
      "src/sum.test.ts",
      'import { expect, test } from "vitest";\nimport { sum } from "./sum.ts";\ntest("sums", () => {\n  expect(sum(1)).toBe(2);\n});\n',
    );
  };
  // The changed module gives the mutation step work, and the fixture has no packages to install: it cannot check and
  // stops the run, after the three steps this test is about
  const out = expect("all", repo(marked), 3, {
    extraEnv: { VITEST_BIN: wrapper },
  });
  assert.match(out, /^COULD NOT CHECK mutation\b/m);
  assert.match(out, /^PASS trace: .*1 marker\(s\)/m);
  assert.match(out, /^PASS diff-coverage: 1\/1 changed lines covered/m);
  assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 1);
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
test("lockfile: bundleDependencies, npm's own spelling, would ship", () => {
  const bundled = pkg((p) => Object.assign(p, { bundleDependencies: ["c"] }));
  assert.match(expect("lockfile", repo(bundled), 1), /bundleDependencies: c/);
  const all = pkg((p) => Object.assign(p, { bundleDependencies: true }));
  assert.match(expect("lockfile", repo(all), 1), /bundleDependencies: all/);
});
test("an unknown check is a usage error", () => {
  assert.equal(run(["nothing"]).code, 2);
});
