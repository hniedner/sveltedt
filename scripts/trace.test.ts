// Tests for trace.ts. The statement reader and the hash are pure, so they are called directly; the step itself is
// run through check-repo.ts on a fixture repository, as check-repo.test.ts does.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { judgeMarkers, parseSpec, readMarkers, traceSources } from "./trace.ts";
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
