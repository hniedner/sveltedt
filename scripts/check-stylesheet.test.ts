// Tests for check-stylesheet.ts. The checks are pure functions of the stylesheet's text, so they are called directly;
// the step's exit codes are run once each through the script.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, CANARIES, CANARY_SPECS } from "./check-stylesheet.ts";

const found = (css: string, id: string): string[] =>
  analyse(css, CANARY_SPECS)
    .findings.filter((f) => f.id === id)
    .map((f) => f.message);

for (const c of CANARIES)
  test(`${c.id} row: ${c.row} is ${c.found ? "a finding" : "not a finding"}`, () => {
    assert.equal(found(c.css, c.id).length > 0, c.found);
  });

test("THEME-12: the finding names the selector and its specificity", () => {
  assert.deepEqual(found(".sdt-a .sdt-b { color: inherit }", "THEME-12"), [
    ".sdt-a .sdt-b has the specificity (0,2,0), above (0,1,0)",
  ]);
});
test("THEME-12: one element is (0,0,1) and passes; a class with an element is (0,1,1) and is a finding", () => {
  assert.deepEqual(found("tr { color: inherit }", "THEME-12"), []);
  assert.equal(found(".sdt-a td { color: inherit }", "THEME-12").length, 1);
});
test("THEME-12: a nested rule counts with its parent, with or without the ampersand", () => {
  assert.equal(found(".a { .b { color: inherit } }", "THEME-12").length, 1);
  assert.equal(
    found(".a { &:hover { color: inherit } }", "THEME-12").length,
    1,
  );
  assert.equal(
    found(":where(.a) { .b { color: inherit } }", "THEME-12").length,
    0,
  );
});
test("THEME-12: the selectors read are counted", () => {
  assert.equal(
    analyse(".a, .b { color: inherit } .c { color: inherit }", CANARY_SPECS)
      .reads.selectors,
    3,
  );
});

test("THEME-13: the finding names the rule and what is wrong", () => {
  assert.deepEqual(found(".sdt-x { color: inherit }", "THEME-13"), [
    ".sdt-x: no marker comment directly before it",
  ]);
  assert.deepEqual(
    found('/* @spec("THEME-12") */ .sdt-x { color: inherit }', "THEME-13"),
    [".sdt-x: THEME-12 is not a real-browser statement"],
  );
});
test("THEME-13: a @property rule needs a marker; keyframe selectors do not", () => {
  assert.equal(
    found('@property --sdt-a { syntax: "*"; inherits: true }', "THEME-13")
      .length,
    1,
  );
  assert.equal(
    analyse(
      '/* @spec("THEME-10") */ @keyframes k { from { opacity: 0 } }',
      CANARY_SPECS,
    ).reads.rules,
    1,
  );
});
test("THEME-13: a stylesheet with only an @charset has 0 rules read, which is could-not-check", () => {
  assert.equal(analyse('@charset "utf-8";', CANARY_SPECS).reads.rules, 0);
});
