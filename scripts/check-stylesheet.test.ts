// Tests for check-stylesheet.ts. The checks are pure functions of the stylesheet's text, so they are called directly;
// the step's exit codes are run once each through the script.
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyse, CANARIES } from "./check-stylesheet.ts";

const found = (css: string, id: string): string[] =>
  analyse(css)
    .findings.filter((f) => f.id === id)
    .map((f) => f.message);

for (const c of CANARIES.filter((x) => x.id === "THEME-12"))
  test(`THEME-12 row: ${c.row} is ${c.found ? "a finding" : "not a finding"}`, () => {
    assert.equal(found(c.css, "THEME-12").length > 0, c.found);
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
    analyse(".a, .b { color: inherit } .c { color: inherit }").reads.selectors,
    3,
  );
});
