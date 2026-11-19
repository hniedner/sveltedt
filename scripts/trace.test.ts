// Tests for trace.ts. The statement reader and the hash are pure, so they are called directly; the step itself is
// run through check-repo.ts on a fixture repository, as check-repo.test.ts does.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { parseSpec } from "./trace.ts";

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
