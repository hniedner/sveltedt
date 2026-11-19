// Tests for trace.ts. The statement reader and the hash are pure, so they are called directly; the step itself is
// run through check-repo.ts on a fixture repository, as check-repo.test.ts does.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { GATE_VARS } from "./gate-step.ts";
import {
  judgeMarkers,
  judgeResults,
  parseSpec,
  readMarkers,
  traceSources,
} from "./trace.ts";
import type { Marker, Statement } from "./trace.ts";

const sha8 = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);

/** One spec file with a statement; each part can be replaced to plant a change. */
function spec({
  statement = "A table MUST show rows.",
  example = "| a | 1 |",
  reason = "- Reason: so a reader sees them.",
  layer = "- Layer: component.",
  traces = "- Traces: PRD-A1.",
} = {}): string {
  return `# Spec\n\n**TST-01** ${statement}\n\n${example}\n\n${reason}\n${layer}\n${traces}\n`;
}
const hashOf = (text: string): string | null =>
  parseSpec("spec/a.md", text).statements[0]?.hash ?? null;

test("trace: the hash is the first 8 hex of sha256 over the statement, example and Layer line, white space collapsed", () => {
  assert.equal(
    hashOf(spec()),
    sha8("**TST-01** A table MUST show rows. | a | 1 | - Layer: component."),
  );
});
test("trace: a statement is read with its id, file and line", () => {
  const [s] = parseSpec("spec/a.md", spec()).statements;
  assert.deepEqual([s.id, s.file, s.line], ["TST-01", "spec/a.md", 3]);
});
test("trace: a changed example row changes the hash (the test is stale)", () => {
  assert.notEqual(hashOf(spec({ example: "| a | 2 |" })), hashOf(spec()));
});
test("trace: a changed Layer line changes the hash", () => {
  assert.notEqual(hashOf(spec({ layer: "- Layer: HTTP." })), hashOf(spec()));
});
test("trace: a changed Reason does not change the hash", () => {
  assert.equal(hashOf(spec({ reason: "- Reason: another." })), hashOf(spec()));
});
test("trace: a changed Traces line does not change the hash", () => {
  assert.equal(hashOf(spec({ traces: "- Traces: PRD-B2." })), hashOf(spec()));
});
test("trace: reflowed white space does not change the hash", () => {
  assert.equal(
    hashOf(
      spec({
        statement: "A table\n  MUST   show\nrows.",
        example: "|  a | 1 |",
      }),
    ),
    hashOf(spec()),
  );
});
test("trace: a statement without a Reason line is a problem naming it, and does not swallow the next statement", () => {
  const text = `${spec({ reason: "" })}\n**TST-02** Next MUST work.\n- Reason: r.\n- Layer: unit.\n`;
  const r = parseSpec("spec/a.md", text);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /spec\/a\.md:3: TST-01: no "- Reason:" line/);
  assert.equal(
    r.statements[1].hash,
    sha8("**TST-02** Next MUST work. - Layer: unit."),
  );
});
test("trace: a heading-like line inside a code fence does not end the statement, and a changed fence changes the hash", () => {
  const fenced = (code: string) =>
    spec({ example: `\`\`\`\n# ${code}\n\`\`\`` });
  assert.deepEqual(parseSpec("spec/a.md", fenced("one")).problems, []);
  assert.notEqual(hashOf(fenced("one")), hashOf(fenced("two")));
});
test("trace: an unclosed code fence is a problem", () => {
  const r = parseSpec("spec/a.md", spec({ example: "```\n# code" }));
  assert.match(r.problems.join("\n"), /spec\/a\.md:\d+: unclosed code fence/);
});
test("trace: a line shaped like a statement id that the reader does not take is a problem", () => {
  const r = parseSpec(
    "spec/a.md",
    `${spec()}\n**tst-02** Lower case MUST NOT pass.\n`,
  );
  assert.match(
    r.problems.join("\n"),
    /spec\/a\.md:\d+: .*looks like a statement id/,
  );
});
test("trace: an id with punctuation inside the bold is a problem, and bold words with a hyphen are not", () => {
  for (const line of ["**TST-04:** x", "**TST-01.** x"])
    assert.match(
      parseSpec("spec/a.md", `${spec()}\n${line}\n`).problems.join("\n"),
      /looks like a statement id/,
    );
  const prose = `${spec()}\n**Non-goal** a note.\n**Read-only** a note.\n`;
  assert.deepEqual(parseSpec("spec/a.md", prose).problems, []);
});
test("trace: a spec file with no statement is a problem", () => {
  const r = parseSpec("spec/a.md", "# Nothing here\n");
  assert.match(r.problems.join("\n"), /spec\/a\.md: no statement/);
});
test("trace: a statement without a Layer line is a problem naming it", () => {
  const r = parseSpec("spec/a.md", spec({ layer: "" }));
  assert.match(
    r.problems.join("\n"),
    /spec\/a\.md:3: TST-01: no "- Layer:" line/,
  );
});

const MARK = '// @spec("TST-01", "aaaaaaaa")';
const markers = (source: string) => readMarkers("src/a.test.ts", source);

test("trace: a marker names the statement after it, with its first and last line", () => {
  const source = `${MARK}\ndescribe("rows", () => {\n  it("a", () => {});\n});\n`;
  const [m] = markers(source).markers;
  assert.deepEqual(
    [m.id, m.hash, m.file, m.line, m.from, m.to],
    ["TST-01", "aaaaaaaa", "src/a.test.ts", 1, 2, 4],
  );
});
test("trace: a marker inside a block names only the statement after it", () => {
  const source = `describe("rows", () => {\n  ${MARK}\n  it("a", () => {\n    expect(1).toBe(1);\n  });\n  it("b", () => {});\n});\n`;
  const [m] = markers(source).markers;
  assert.deepEqual([m.line, m.from, m.to], [2, 3, 5]);
});
test("trace: a marker above a for loop names the whole loop, so every generated test counts", () => {
  const source = `${MARK}\nfor (const row of rows) {\n  it(row, () => {});\n}\nit("other", () => {});\n`;
  const [m] = markers(source).markers;
  assert.deepEqual([m.from, m.to], [2, 4]);
});
test("trace: a marker with no statement after it in its block is a problem", () => {
  for (const source of [
    `it("a", () => {});\n${MARK}\n`,
    `describe("x", () => {\n  it("a", () => {});\n  ${MARK}\n});\nit("b", () => {});\n`,
  ]) {
    const r = markers(source);
    assert.deepEqual(r.markers, []);
    assert.match(
      r.problems.join("\n"),
      /src\/a\.test\.ts:\d: TST-01: names no statement/,
    );
  }
});
test("trace: marker text inside a string is not a marker", () => {
  const source = `const fixture = \`\n${MARK}\nit("a", () => {});\n\`;\n`;
  assert.deepEqual(markers(source), { markers: [], problems: [] });
});
test("trace: a comment that mentions @spec( and is not a marker is a problem", () => {
  const r = markers('// @spec("TST-01")\nit("a", () => {});\n');
  assert.match(
    r.problems.join("\n"),
    /src\/a\.test\.ts:1: malformed @spec marker/,
  );
});
for (const [name, source, why] of [
  [
    "a trailing marker",
    `it("a", () => {}); ${MARK}\n`,
    /outside the one recognised position/,
  ],
  [
    "a marker in an array table",
    `const rows = [\n  ${MARK}\n  1,\n];\n`,
    /outside the one recognised position/,
  ],
  [
    "a marker in a class body",
    `class A {\n  ${MARK}\n  m() {}\n}\n`,
    /outside the one recognised position/,
  ],
  [
    "a marker with a space before the bracket",
    '// @spec ("TST-01", "aaaaaaaa")\nit("a", () => {});\n',
    /malformed/,
  ],
  [
    "a marker with another case",
    '// @Spec("TST-01", "aaaaaaaa")\nit("a", () => {});\n',
    /malformed/,
  ],
  [
    "a trailing marker after a string holding //",
    `const u = "http://x"; ${MARK}\nit("a", () => {});\n`,
    /outside the one recognised position/,
  ],
  [
    "a misplaced marker after a glob string holding /**",
    `const g = "src/**";\nit("a", () => {}); ${MARK}\nconst h = "**/*.ts";\n`,
    /outside the one recognised position/,
  ],
  [
    "a marker in a block comment",
    '/* @spec("TST-01", "aaaaaaaa") */\nit("a", () => {});\n',
    /malformed/,
  ],
] as const) {
  test(`trace: ${name} is a problem naming its line, never silently unread`, () => {
    assert.match(markers(source).problems.join("\n"), why);
    assert.match(markers(source).problems.join("\n"), /src\/a\.test\.ts:\d+:/);
  });
}
test("trace: two markers on one statement are a problem, and only the first counts", () => {
  const r = markers(`${MARK}\n${MARK}\nit("a", () => {});\n`);
  assert.equal(r.markers.length, 1);
  assert.match(
    r.problems.join("\n"),
    /src\/a\.test\.ts:2: .*two markers on one statement/,
  );
});
for (const [name, body, modifier] of [
  ["only", 'it.only("a", () => {});', ".only"],
  ["skip", 'it.skip("a", () => {});', ".skip"],
  ["todo", 'it.todo("a");', ".todo"],
  ["fails", 'it.fails("a", () => {});', ".fails"],
  ["a skip option", 'it("a", { skip: true }, () => {});', "{ skip: true }"],
  ["a todo option", 'it("a", { todo: true }, () => {});', "{ todo: true }"],
  [
    "a modifier inside a loop",
    "for (const r of rows) { it.only(r, () => {}); }",
    ".only",
  ],
] as const) {
  test(`trace: ${name} under a marked statement is reported as ${modifier}`, () => {
    const [m] = markers(`${MARK}\n${body}\n`).markers;
    assert.deepEqual(m.modifiers, [modifier]);
  });
}
test("trace: a skip or only in test data, and { skip: false }, carry no modifier; a skip reason does", () => {
  const data = `${MARK}\ndescribe("x", () => {\n  const row = { skip: 20, todo: "t" };\n  it("a", () => {\n    expect(row.only).toBe(1);\n  });\n});\n`;
  assert.deepEqual(markers(data).markers[0].modifiers, []);
  const reason = markers(`${MARK}\nit("a", { skip: "why" }, () => {});\n`);
  assert.deepEqual(reason.markers[0].modifiers, ['{ skip: "why" }']);
});
test("trace: { skip: false } and an ordinary test carry no modifier", () => {
  const [m] = markers(`${MARK}\nit("a", { skip: false }, () => {});\n`).markers;
  assert.deepEqual(m.modifiers, []);
});

test("trace: test sources exclude canary fixtures, which are inputs and never counted", () => {
  const r = traceSources(
    new Set(["src/a.test.ts", "scripts/canaries/test/canary.test.ts"]),
  );
  assert.deepEqual(r, { read: ["src/a.test.ts"], scripts: [], stray: [] });
});
test("trace: a test source under scripts/ is set apart, and one outside the covered folders is stray", () => {
  const r = traceSources(
    new Set([
      "scripts/x.test.ts",
      "site/s.test.ts",
      "test/t.spec.ts",
      "other/o.test.ts",
      "src/lib/a.svelte",
    ]),
  );
  assert.deepEqual(r, {
    read: ["site/s.test.ts", "test/t.spec.ts"],
    scripts: ["scripts/x.test.ts"],
    stray: ["other/o.test.ts"],
  });
});

const STATEMENT_A: Statement = {
  id: "TST-01",
  file: "spec/a.md",
  line: 3,
  hash: "aaaaaaaa",
};
const marker = (id: string, hash: string): Marker => ({
  id,
  hash,
  file: "src/a.test.ts",
  line: 7,
  from: 8,
  to: 9,
  modifiers: [],
});
test("trace: a marker whose id no spec holds is a problem", () => {
  assert.deepEqual(
    judgeMarkers([marker("TST-09", "aaaaaaaa")], [STATEMENT_A]),
    ["src/a.test.ts:7: TST-09: no spec holds this statement"],
  );
});
test("trace: a marker whose hash is not the statement's is stale", () => {
  assert.deepEqual(
    judgeMarkers([marker("TST-01", "bbbbbbbb")], [STATEMENT_A]),
    ["src/a.test.ts:7: TST-01: stale (marker bbbbbbbb, statement aaaaaaaa)"],
  );
});
test("trace: a marker with the statement's hash has no problem", () => {
  assert.deepEqual(
    judgeMarkers([marker("TST-01", "aaaaaaaa")], [STATEMENT_A]),
    [],
  );
});

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "check-repo.ts");
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "trace-"));
  made.push(d);
  return d;
};
const put = (root: string, path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
/** This process's environment without git's variables and the gate's own (GATE_VARS): the fixture sets what it needs. */
const cleanEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
  );
  for (const k of GATE_VARS) delete env[k];
  return { ...env, ...extra };
};
const git = (root: string, ...args: string[]): string =>
  execFileSync(
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
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    { env: cleanEnv(), encoding: "utf8" },
  );

const SPEC_TEXT = `# Spec

**TST-01** A table MUST show rows.

- Reason: a reader sees them.
- Layer: unit.
- Traces: PRD-A1.

**TST-02** A table MUST sort rows.

- Reason: a reader finds one.
- Layer: unit.
- Traces: PRD-A1.
`;
const HASH = Object.fromEntries(
  parseSpec("spec/a.md", SPEC_TEXT).statements.map((s) => [s.id, s.hash]),
);
const mark = (id: string, hash = HASH[id] ?? "aaaaaaaa"): string =>
  `// @spec("${id}", "${hash}")`;
const vitestFile = (body: string): string =>
  `import { expect, test } from "vitest";\n${body}`;
const ONE = (id = "TST-01"): string =>
  vitestFile(`${mark(id)}\ntest("one", () => {\n  expect(1).toBe(1);\n});\n`);

/** A committed repository holding the spec, a Vitest config for src/, and `files`; the real node_modules is linked. */
function fixture(files: Record<string, string> = {}): string {
  const root = tempDir();
  const all: Record<string, string> = {
    "spec/a.md": SPEC_TEXT,
    "vitest.config.ts":
      'export default { test: { include: ["src/**/*.test.ts"] } };\n',
    ".gitignore": "/node_modules\n/reports/\n",
    ...files,
  };
  for (const [path, text] of Object.entries(all)) put(root, path, text);
  symlinkSync(join(here, "..", "node_modules"), join(root, "node_modules"));
  execFileSync("git", ["init", "-q", root], { env: cleanEnv() });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "chore: the fixture's first commit");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  return root;
}

const WORD = ["PASS", "FINDING", "", "COULD NOT CHECK"];
/** Runs the trace step on `root` and asserts its exit code and the word its last line starts with. */
function expectTrace(
  root: string,
  code: number,
  env: Record<string, string> = {},
): string {
  const r = spawnSync(process.execPath, [CLI, "trace", "--root", root], {
    encoding: "utf8",
    env: cleanEnv(env),
  });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, code, out);
  assert.match(
    out.trim().split("\n").at(-1)!,
    new RegExp(`^${WORD[code]} trace\\b`),
    out,
  );
  return out;
}

test("trace: a marked test that ran and passed is tested, and the PASS line counts what was read", () => {
  const out = expectTrace(fixture({ "src/a.test.ts": ONE() }), 0);
  assert.match(
    out,
    /PASS trace: 1 spec file\(s\), 2 statement\(s\), 1 marker\(s\), 1 result\(s\) read; 1 tested/,
  );
});
test("trace: a statement no marker names exits 0 under `not yet tested`, and not in the PASS line", () => {
  const out = expectTrace(fixture({ "src/a.test.ts": ONE() }), 0);
  assert.match(out, /^ {2}not yet tested \(1\):\n {4}TST-02$/m);
  assert.doesNotMatch(out.trim().split("\n").at(-1)!, /TST-02/);
});
test("trace: a spec that no test names lists every statement", () => {
  const out = expectTrace(fixture(), 0);
  assert.match(out, /not yet tested \(2\):\n {4}TST-01\n {4}TST-02/);
});

/** A marked test written as `body` in its own file, so a `.only` in one case cannot touch another. */
const planted = (name: string, body: string) => ({
  [`src/${name}.test.ts`]: vitestFile(`${mark("TST-01")}\n${body}\n`),
});
for (const [name, body, why] of [
  ["skip", 'test.skip("a", () => {});', /\.skip/],
  ["only", 'test.only("a", () => {\n  expect(1).toBe(1);\n});', /\.only/],
  ["todo", 'test.todo("a");', /\.todo/],
  ["fails", 'test.fails("a", () => {\n  expect(1).toBe(2);\n});', /\.fails/],
  ["a skip option", 'test("a", { skip: true }, () => {});', /\{ skip: true \}/],
  ["a todo option", 'test("a", { todo: true }, () => {});', /\{ todo: true \}/],
  [
    "a run-time ctx.skip(), read from the results",
    'test("a", (ctx) => {\n  expect(1).toBe(1);\n  ctx.skip();\n});',
    /skipped: a/,
  ],
  ["skipIf", 'test.skipIf(true)("a", () => {});', /skipped: a/],
] as const) {
  test(`trace: a marked test with ${name} is a finding`, () => {
    assert.match(expectTrace(fixture(planted("p", body)), 1), why);
  });
}
test("trace: a marked test that fails is a finding naming it", () => {
  const out = expectTrace(
    fixture(planted("p", 'test("a", () => {\n  expect(1).toBe(2);\n});')),
    1,
  );
  assert.match(out, /src\/p\.test\.ts:\d: TST-01: failed: a/);
});
test("trace: a marked test missing from the results cannot be checked", () => {
  // the fixture's config runs src/ only, so site/ never runs
  const out = expectTrace(
    fixture({ "site/a.test.ts": ONE(), "src/b.test.ts": ONE("TST-02") }),
    3,
  );
  assert.match(
    out,
    /site\/a\.test\.ts:\d: TST-01: the test file is not in the results/,
  );
});
const LOOP = (rows: string): string =>
  vitestFile(
    `${mark("TST-01")}\nfor (const row of ${rows}) {\n  test(row, () => {\n    expect(row).toBe(row);\n  });\n}\ntest("other", () => {\n  expect(1).toBe(1);\n});\n`,
  );
test("trace: a marker above a loop is tested when its generated tests passed", () => {
  expectTrace(fixture({ "src/a.test.ts": LOOP('["a", "b"]') }), 0);
});
test("trace: a marker above a loop that generated no test, in a file that ran, is a finding", () => {
  assert.match(
    expectTrace(fixture({ "src/a.test.ts": LOOP("[]") }), 1),
    /TST-01: no test ran under the marker/,
  );
});
test("trace: a statement with no Reason line is a finding", () => {
  const spec = SPEC_TEXT.replace("- Reason: a reader sees them.\n", "");
  assert.match(
    expectTrace(fixture({ "spec/a.md": spec }), 1),
    /TST-01: no "- Reason:" line/,
  );
});
test("trace: a statement with no Layer line is a finding", () => {
  const spec = SPEC_TEXT.replace("- Layer: unit.\n", "");
  assert.match(
    expectTrace(fixture({ "spec/a.md": spec }), 1),
    /no "- Layer:" line/,
  );
});
test("trace: a stale marker is a finding even though its test passed", () => {
  const out = expectTrace(
    fixture({ "src/a.test.ts": ONE().replace(HASH["TST-01"]!, "00000000") }),
    1,
  );
  assert.match(out, /TST-01: stale/);
});
test("trace: a marker whose id no spec holds is a finding", () => {
  assert.match(
    expectTrace(fixture({ "src/a.test.ts": ONE("TST-99") }), 1),
    /TST-99: no spec holds/,
  );
});
test("trace: a marker attached to nothing is a finding", () => {
  const out = expectTrace(
    fixture({ "src/a.test.ts": `${ONE()}${mark("TST-02")}\n` }),
    1,
  );
  assert.match(out, /TST-02: names no statement/);
});
test("trace: a marker under scripts/canaries/ is not read", () => {
  const out = expectTrace(
    fixture({ "scripts/canaries/x/c.test.ts": ONE("TST-99") }),
    0,
  );
  assert.doesNotMatch(out, /TST-99/);
});
test("trace: a marker in a test under scripts/ cannot be checked: its node:test results are not read yet", () => {
  const out = expectTrace(
    fixture({
      "scripts/x.test.ts": `${mark("TST-01")}\ntest("x", () => {});\n`,
    }),
    3,
  );
  assert.match(
    out,
    /scripts\/x\.test\.ts:1: TST-01: node:test results are not read yet/,
  );
});
test("trace: an unmarked test under scripts/ is outside the trace", () => {
  expectTrace(fixture({ "scripts/x.test.ts": 'test("x", () => {});\n' }), 0);
});
test("trace: a test file outside the covered folders and scripts/ cannot be checked", () => {
  assert.match(
    expectTrace(fixture({ "other/o.test.ts": ONE() }), 3),
    /other\/o\.test\.ts/,
  );
});

/** The canaries folder with the planted skip replaced by a passing test, as a step that could not see skips would meet it. */
function canaryThatPasses(): string {
  const dir = tempDir();
  cpSync(join(here, "canaries"), dir, { recursive: true });
  const file = join(dir, "trace", "canary.test.ts");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace("test.skipIf(true)", "test"),
  );
  return dir;
}
test("trace: a canary run that does not report the planted skipped test cannot be checked", () => {
  const out = expectTrace(fixture({ "src/a.test.ts": ONE() }), 3, {
    CANARY_DIR: canaryThatPasses(),
  });
  assert.match(out, /the planted skipped, marked test was not reported/);
});
test("trace: a canary run of the trace and test steps writes no file under the canaries folder", () => {
  const dir = canaryThatPasses();
  const listing = () => readdirSync(dir, { recursive: true }).sort();
  const before = listing();
  const pin = (
    JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      devDependencies: { vitest: string };
    }
  ).devDependencies.vitest;
  const root = fixture({
    "src/a.test.ts": ONE(),
    "package.json": JSON.stringify({ devDependencies: { vitest: pin } }),
  });
  expectTrace(root, 3, { CANARY_DIR: dir });
  const r = spawnSync(process.execPath, [CLI, "test", "--root", root], {
    encoding: "utf8",
    env: cleanEnv({ CANARY_DIR: dir }),
  });
  assert.match(r.stdout, /^PASS test: /m);
  assert.deepEqual(listing(), before);
});

test("trace: every variable that changes a step's context is in GATE_VARS and is stripped from a child", () => {
  assert.deepEqual([...GATE_VARS].sort(), [
    "CANARY_DIR",
    "GATE_BASE",
    "GATE_EVENT",
    "GATE_HEAD",
    "GITHUB_ACTIONS",
  ]);
  const probe = `import { childEnv } from "${join(here, "gate-step.ts")}"; console.log(JSON.stringify(Object.keys(childEnv())));`;
  const env = {
    ...process.env,
    ...Object.fromEntries(GATE_VARS.map((k) => [k, "x"])),
  };
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    encoding: "utf8",
    env,
  });
  const seen = (JSON.parse(r.stdout) as string[]).filter((k) =>
    GATE_VARS.includes(k),
  );
  assert.deepEqual(seen, []);
});
test("trace: `needs` still runs in a copy of the scripts with no node_modules", () => {
  const dir = tempDir();
  cpSync(here, join(dir, "scripts"), {
    recursive: true,
    filter: (f) => !f.includes("canaries"),
  });
  put(dir, "package.json", "{}\n");
  const r = spawnSync(
    process.execPath,
    [
      join(dir, "scripts", "check-repo.ts"),
      "needs",
      '{"static":{"result":"success"}}',
    ],
    {
      encoding: "utf8",
      env: cleanEnv(),
    },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("trace: a statement id defined twice is a finding naming both places", () => {
  const out = expectTrace(fixture({ "spec/b.md": SPEC_TEXT }), 1);
  assert.match(out, /spec\/b\.md:3: TST-01: also defined at spec\/a\.md:3/);
});
test("trace: a tracked file under spec/ that is not a top-level .md cannot be checked", () => {
  const out = expectTrace(fixture({ "spec/sub/b.md": "# x\n" }), 3);
  assert.match(out, /spec\/sub\/b\.md: under spec\/ but not a top-level \.md/);
});

test("trace: a run that exits non-zero with no failed test (an unhandled error) is COULD NOT CHECK", () => {
  const late = `${mark("TST-01")}\ntest("p", () => {\n  void Promise.reject(new Error("late failure"));\n  expect(1).toBe(1);\n});\n`;
  const out = expectTrace(fixture({ "src/a.test.ts": vitestFile(late) }), 3);
  assert.match(out, /vitest exited 1 though no test failed/);
});
test("trace: a vitest that cannot be started is COULD NOT CHECK and says why", () => {
  const out = expectTrace(fixture({ "src/a.test.ts": ONE() }), 3, {
    VITEST_BIN: join(tempDir(), "no-vitest"),
  });
  assert.match(out, /cannot run .*no-vitest: ENOENT/);
});
test("trace: a pending or disabled result is reported as skipped", () => {
  const m = {
    id: "TST-01",
    hash: "aaaaaaaa",
    file: "src/a.test.ts",
    line: 7,
    from: 8,
    to: 9,
    modifiers: [],
  };
  for (const status of ["pending", "disabled"]) {
    const r = judgeResults(
      [m],
      new Map([["src/a.test.ts", [{ line: 8, name: "a", status }]]]),
    );
    assert.match(r.findings.join("\n"), /skipped: a/);
  }
});
