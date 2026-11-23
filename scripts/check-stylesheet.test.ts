// Tests for check-stylesheet.ts. The checks are pure functions of the stylesheet's text, so they are called directly;
// the step's exit codes are run once each through the script.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { HERE } from "./gate-step.ts";
import {
  analyse,
  CANARIES,
  check,
  CANARY_SPECS,
  LAYOUT_CANARIES,
  layout,
  TOKEN_CANARIES,
  tokens,
} from "./check-stylesheet.ts";

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
test("THEME-12: :not takes the specificity of its argument", () => {
  assert.equal(
    found(":not(.sdt-a .sdt-b) { color: inherit }", "THEME-12").length,
    1,
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
test("THEME-13: the selectors of a vendor-prefixed keyframes block need no marker", () => {
  assert.deepEqual(
    found(
      '/* @spec("THEME-10") */ @-webkit-keyframes k { from { opacity: 0 } to { opacity: 1 } }',
      "THEME-13",
    ),
    [],
  );
});
test("THEME-13: a stylesheet with only an @charset has 0 rules read, which is could-not-check", () => {
  assert.equal(analyse('@charset "utf-8";', CANARY_SPECS).reads.rules, 0);
});

test("THEME-01: the finding names the property and the colour", () => {
  assert.deepEqual(found(".sdt-x { color: #333 }", "THEME-01"), [
    "color: #333 is not a --sdt-* property with a system-colour fallback",
  ]);
});
test("THEME-01: colour functions of CSS Color 4 and 5 are colours anywhere in a value", () => {
  for (const value of [
    "rgb(0 0 0 / 50%)",
    "oklch(60% 0.1 200)",
    "color-mix(in srgb, var(--sdt-a, Canvas), 20% white)",
    "1px solid hsl(0 0% 0%)",
  ])
    assert.equal(
      found(`.a { border-color: ${value} }`, "THEME-01").length,
      1,
      value,
    );
});
test("THEME-01: a var() in a property that takes no colour, with no colour in its fallback, is not judged", () => {
  assert.deepEqual(
    found(".a { padding: var(--sdt-pad, 0.5rem) }", "THEME-01"),
    [],
  );
  assert.equal(
    found(".a { padding: var(--sdt-pad, red) }", "THEME-01").length,
    1,
  );
});
test("THEME-01: a url() and a string are not read for colours", () => {
  assert.deepEqual(
    found('.a { background-image: url(red.png); content: "red" }', "THEME-01"),
    [],
  );
});
test("THEME-01: the declarations read are counted, those inside forced-colors included", () => {
  assert.equal(
    analyse(
      "@media (forced-colors: active) { .a { color: Canvas } } .b { color: inherit }",
      CANARY_SPECS,
    ).reads.declarations,
    2,
  );
});

for (const c of LAYOUT_CANARIES)
  test(`THEME-04 row: ${c.row} is ${c.found ? "a finding" : "not a finding"}`, () => {
    assert.equal(layout(c.files).length > 0, c.found);
  });
test("THEME-04: the findings say which stylesheets and which component", () => {
  assert.deepEqual(
    layout(LAYOUT_CANARIES[1].files).map((f) => f.message),
    ["2 stylesheets: src/lib/styles.css, src/lib/more.css"],
  );
  assert.deepEqual(
    layout(LAYOUT_CANARIES[3].files).map((f) => f.message),
    ["src/lib/A.svelte holds a <style> block"],
  );
});
test("THEME-04: a css file outside src/lib and a <style> element nested in markup are not this statement's", () => {
  assert.deepEqual(
    layout({
      "src/lib/styles.css": "",
      "site/app.css": "",
      "src/lib/A.svelte": "<svelte:head><style>.x{}</style></svelte:head>",
    }),
    [],
  );
});

for (const c of TOKEN_CANARIES)
  test(`THEME-02 row: ${c.row}`, () => {
    const got = tokens(c.read, c.guide);
    if (c.expect === "cannot") assert.equal(typeof got, "string");
    else
      assert.deepEqual(
        got,
        c.expect === "pass" ? [] : [{ id: "THEME-02", message: c.expect }],
      );
  });
test("THEME-02: the names a stylesheet reads are collected from every var(), once each, fallbacks included", () => {
  assert.deepEqual(
    analyse(
      ".a { color: var(--sdt-a, Canvas); border-color: var(--sdt-b, var(--sdt-a, Canvas)); padding: var(--app-x, 1px) }",
      CANARY_SPECS,
    ).reads.tokens,
    ["--sdt-a", "--sdt-b"],
  );
});

// ---- the step over a repository: a fixture is a git repository holding the files the step reads
const SPEC_TEXT = `# Spec

**THEME-10** A real-browser statement.
- Reason: r.
- Layer: real browser (Chromium, Firefox, WebKit).

**THEME-12** A static statement.
- Reason: r.
- Layer: static check.
`;
const GUIDE =
  "## Tokens\n\n| Token | Paints | Fallback |\n|---|---|---|\n| `--sdt-border` | x | `GrayText` |\n";
const GOOD_SHEET =
  '/* @spec("THEME-10") */\n.sdt-x { border-color: var(--sdt-border, GrayText) }\n';
const tmp = mkdtempSync(join(tmpdir(), "check-stylesheet-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
function fixture(files: Record<string, string>): string {
  const root = join(tmp, `repo${n++}`);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}
const GOOD = {
  "src/lib/styles.css": GOOD_SHEET,
  "spec/table.md": SPEC_TEXT,
  "docs/styling.md": GUIDE,
};
const run = (root: string): { status: number | null; out: string } => {
  const r = spawnSync(
    process.execPath,
    [join(HERE, "check-stylesheet.ts"), "--root", root],
    { encoding: "utf8" },
  );
  return { status: r.status, out: r.stdout };
};

test("the step passes on a stylesheet that every statement accepts, exit 0, and says what it read", () => {
  const r = run(fixture(GOOD));
  assert.equal(r.status, 0, r.out);
  assert.match(
    r.out,
    /PASS check-stylesheet: 1 declaration\(s\), 1 selector\(s\), 1 rule\(s\), 1 token name\(s\) read; canaries found/,
  );
});
test("the step exits 1 with each finding listed when a statement finds one", () => {
  const r = run(
    fixture({
      ...GOOD,
      "src/lib/styles.css": `${GOOD_SHEET}.sdt-y { color: #333 }\n`,
    }),
  );
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /THEME-01 .*color: #333/);
  assert.match(r.out, /THEME-13 .*\.sdt-y: no marker comment/);
});
test("the step exits 3 when the token table cannot be read", () => {
  const files: Record<string, string> = { ...GOOD };
  delete files["docs/styling.md"];
  const r = run(fixture(files));
  assert.equal(r.status, 3, r.out);
  assert.match(r.out, /COULD NOT CHECK check-stylesheet: .*docs\/styling\.md/);
});
test("a marker names a statement the tracked specs hold, and only a real-browser one passes", () => {
  const sheet = (id: string): string =>
    `/* @spec("${id}") */\n.sdt-x { color: inherit }\n`;
  for (const [id, part] of [
    ["THEME-12", "THEME-12 is not a real-browser statement"],
    ["THEME-99", "no spec holds THEME-99"],
  ])
    assert.match(
      check(fixture({ ...GOOD, "src/lib/styles.css": sheet(id) })).details.join(
        "\n",
      ),
      new RegExp(part),
    );
});
test("no stylesheet under src/lib is a finding of THEME-04", () => {
  const files: Record<string, string> = { ...GOOD };
  delete files["src/lib/styles.css"];
  const r = check(fixture(files));
  assert.equal(r.code, 1);
  assert.match(r.details.join("\n"), /THEME-04 no stylesheet under src\/lib/);
});
test("no spec file tracked cannot be checked", () => {
  const files: Record<string, string> = { ...GOOD };
  delete files["spec/table.md"];
  assert.equal(check(fixture(files)).code, 3);
});
test("a stylesheet with 0 declarations or 0 rules cannot be checked", () => {
  const r = check(
    fixture({ ...GOOD, "src/lib/styles.css": '@charset "utf-8";\n' }),
  );
  assert.equal(r.code, 3);
  assert.match(r.summary, /^0 declaration\(s\) read/);
});
test("a folder that is not a git repository cannot be checked", () => {
  assert.equal(check(join(tmp, "not-a-repository")).code, 3);
});
test("an unknown argument is a usage error, exit 2", () => {
  const r = spawnSync(
    process.execPath,
    [join(HERE, "check-stylesheet.ts"), "--nope"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 2);
});
test("THEME-01: only a plain (forced-colors: active) query exempts its rules, not a negated or an or-ed one", () => {
  for (const query of [
    "not (forced-colors: active)",
    "(min-width: 1px), (forced-colors: active)",
  ])
    assert.equal(
      found(`@media ${query} { .a { color: red } }`, "THEME-01").length,
      1,
      query,
    );
});
