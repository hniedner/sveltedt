// Tests for check-theme-classes.ts (THEME-01). Each case builds a small git repository in a temporary folder, plants
// class literals in the component source and asserts the exit code and the word the last output line starts with.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-theme-classes.ts",
);
const GOOD = "bg-[var(--sdt-surface,Canvas)]";
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A repository whose src/lib holds the given files, staged so `git ls-files` lists them. */
function repo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "check-theme-classes-"));
  made.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  return root;
}
const component = (classes: string): string =>
  repo({ "src/lib/Table.svelte": `<div class="${classes}"></div>\n` });

/** Runs the scan and asserts its exit code and the word its last line starts with; returns the output. */
function expect(args: string[], code: number): string {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, code, out);
  const word = ["PASS", "FINDING", "USAGE", "COULD NOT CHECK"][code];
  assert.match(
    out.trim().split("\n").at(-1) ?? "",
    new RegExp(`^${word} check-theme-classes:`),
    out,
  );
  return out;
}

// @spec("THEME-01", "f592c1b4")
for (const cls of [
  "bg-blue-500",
  "bg-[var(--sdt-surface,#fff)]",
  "bg-[var(--sdt-surface)]",
  "bg-[var(--app-surface,Canvas)]",
]) {
  test(`THEME-01 row: ${cls} is a finding`, () => {
    assert.match(
      expect(["--root", component(`${GOOD} ${cls}`)], 1),
      new RegExp(`Table\\.svelte:1: ${cls.replace(/[[\]()]/g, "\\$&")}`),
    );
  });
}
test("THEME-01 row: a class built at run time is a finding", () => {
  const root = repo({
    "src/lib/Table.svelte": `<div class={\`${GOOD} bg-[\${tone}]\`}></div>\n`,
  });
  assert.match(expect(["--root", root], 1), /built at run time/);
});
test("THEME-01 row: a token class with a system-colour fallback passes and is counted", () => {
  assert.match(
    expect(["--root", component(`${GOOD} p-2`)], 0),
    /2 class literal\(s\) read, 1 colour-prefixed literal\(s\) checked in 1 file\(s\)/,
  );
});
// THEME-01's prefix list, each with a palette class: every one must be read as a colour class
for (const prefix of [
  "bg-",
  "text-",
  "border-",
  "outline-",
  "ring-",
  "divide-",
  "decoration-",
  "accent-",
  "caret-",
  "fill-",
  "stroke-",
  "from-",
  "via-",
  "to-",
  "shadow-",
  "inset-shadow-",
  "inset-ring-",
  "drop-shadow-",
  "text-shadow-",
])
  test(`THEME-01 prefix ${prefix}: a palette class is a finding`, () => {
    expect(["--root", component(`${GOOD} ${prefix}red-500`)], 1);
  });
test("a longer prefix is read before the shorter one it starts with", () => {
  const tokens = [
    "text-shadow-",
    "inset-ring-",
    "inset-shadow-",
    "drop-shadow-",
  ]
    .map((p) => `${p}[var(--sdt-a,CanvasText)]`)
    .join(" ");
  expect(["--root", component(`${GOOD} ${tokens}`)], 0);
});
test("a palette class behind an arbitrary-value variant is a finding", () => {
  for (const cls of [
    "aria-[sort=ascending]:bg-blue-500",
    "data-[selected]:text-red-500",
    "max-[600px]:border-red-500",
    "has-[input]:bg-white",
  ])
    expect(["--root", component(`${GOOD} ${cls}`)], 1);
});
test("ring-offset with a palette colour is a finding", () => {
  expect(["--root", component(`${GOOD} ring-offset-red-500`)], 1);
});
test("text-base and two-word background positions are not colours", () => {
  expect(
    ["--root", component(`${GOOD} text-base bg-left-top bg-right-bottom`)],
    0,
  );
});
test("transparent, current and inherit pass", () => {
  expect(
    ["--root", component(`${GOOD} bg-transparent text-current border-inherit`)],
    0,
  );
});
test("sizes, widths and style keywords are not colours", () => {
  expect(
    [
      "--root",
      component(
        `${GOOD} text-sm border-2 border-t divide-y outline-offset-2 ring-inset shadow-none`,
      ),
    ],
    0,
  );
});
test("a palette class behind a variant or a border side is a finding", () => {
  expect(["--root", component(`${GOOD} hover:bg-blue-500`)], 1);
  expect(["--root", component(`${GOOD} border-t-red-500`)], 1);
});
test("a class in a .ts file under src/lib is read", () => {
  expect(
    [
      "--root",
      repo({
        "src/lib/Table.svelte": `<div class="${GOOD}"></div>\n`,
        "src/lib/tone.ts": "export const tone = 'text-white';\n",
      }),
    ],
    1,
  );
});
test("a source without any colour-prefixed class literal cannot be checked", () => {
  expect(["--root", component("p-2")], 3);
});
test("a source without any class attribute cannot be checked, even with a colour literal in a .ts file", () => {
  expect(
    [
      "--root",
      repo({
        "src/lib/Table.svelte": "<div></div>\n",
        "src/lib/tone.ts": `export const tone = '${GOOD}';\n`,
      }),
    ],
    3,
  );
});
test("a repository with no tracked source file under src/lib cannot be checked", () => {
  const out = expect(["--root", repo({ "src/lib/Table.test.ts": "x\n" })], 3);
  assert.match(out, /no tracked source file under src\/lib/);
});
test("a folder that is not a git repository cannot be checked", () => {
  const root = mkdtempSync(join(tmpdir(), "check-theme-classes-"));
  made.push(root);
  expect(["--root", root], 3);
});
test("an unknown argument is a usage error", () => {
  expect(["--nope"], 2);
});
