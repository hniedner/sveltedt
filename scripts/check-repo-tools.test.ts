// Tests for check-repo.ts: the tool steps (lint, format, types, svelte). Fixtures in check-repo.fixture.ts.

import assert from "node:assert/strict";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  COMPONENT,
  FIXTURE_TSCONFIG,
  PASSING_VITEST,
  PINS,
  SCRIPTS_TSCONFIG,
  SUPPRESSIONS,
  TOOL,
  canaryDir,
  component,
  edit,
  expect,
  here,
  nested,
  pkg,
  put,
  remove,
  repo,
  run,
  script,
  tempDir,
} from "./check-repo.fixture.ts";

test("format: the owner-approved requirements are never reformatted", () => {
  // The PRD changes only through its owner; the text step checks it instead.
  const unformatted = (root: string) =>
    put(root, "docs/PRD.md", "#   Requirements\n");
  expect("format", repo(unformatted), 0);
});
test("format: a spec file is never reformatted, and text still checks it", () => {
  expect(
    "format",
    repo((root) => put(root, "spec/x/a.md", "#   Spec\n")),
    0,
  );
  expect(
    "format",
    repo((root) => put(root, "docs/spec/a.md", "#   Spec\n")),
    1,
  );
  expect(
    "text",
    repo((root) => put(root, "spec/a.md", "# Spec \n")),
    1,
  );
});

// A tool that fails, on the canaries or on the repository, cannot have checked: the step says so and stops.
// Prettier fails on a package.json whose `prettier` key names a shared config that does not exist.
const BROKEN_PRETTIER = '{ "prettier": "./absent-config.json" }\n';
test("format: a Prettier that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("format", {
    "canary.md": "#   Unformatted\n",
    "package.json": BROKEN_PRETTIER,
  });
  assert.match(
    expect("format", repo(), 3, { canaries: dir }),
    /prettier probe failed/,
  );
});
test("format: a Prettier that fails on the repository cannot be checked", () => {
  const broken = pkg((p) => Object.assign(p, JSON.parse(BROKEN_PRETTIER)));
  assert.match(expect("format", repo(broken), 3), /prettier probe failed/);
});
// ESLint throws when a name it is given matches no file: an empty folder, or a link to a file that is gone.
test("lint: an ESLint that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("lint", { "canary.mjs": "x\n" });
  mkdirSync(join(dir, "lint", "empty"));
  assert.match(
    expect("lint", repo(), 3, { canaries: dir }),
    /eslint probe failed/,
  );
});
test("lint: an ESLint that fails on the repository cannot be checked", () => {
  const broken = (root: string) =>
    symlinkSync("gone.mjs", join(root, "scripts", "link.mjs"));
  assert.match(expect("lint", repo(broken), 3), /eslint probe failed/);
});
// Prettier and ESLint skip a file under a node_modules folder; only the root one is git-ignored, so one can be tracked.
const UNDER_NODE_MODULES = "docs/node_modules/note";
test("format: a file Prettier leaves out cannot be checked", () => {
  const out = expect(
    "format",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.md`, "# Note\n")),
    3,
  );
  assert.match(out, /Prettier did not check 1 file/);
});
test("lint: a file ESLint leaves out cannot be checked", () => {
  const out = expect(
    "lint",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.mjs`, TOOL)),
    3,
  );
  assert.match(out, /ESLint did not lint every file/);
});
test("format: passes when Prettier finds its canaries and every file of its class is formatted", () => {
  expect("format", repo(), 0);
});
test("format: an unformatted Markdown file is a finding that names it", () => {
  const bad = edit("CONTRIBUTING.md", "# Contributing\n", "#   Contributing\n");
  assert.match(expect("format", repo(bad), 1), /CONTRIBUTING\.md/);
});
test("format: an unformatted site public script is a finding that names it", () => {
  const bad = (root: string) => put(root, "site/public/x.js", "window.a=1\n");
  assert.match(expect("format", repo(bad), 1), /site\/public\/x\.js/);
});
test("format: an unformatted JSON file is a finding", () => {
  expect(
    "format",
    repo((root) => put(root, "data.json", '{"a":1}\n')),
    1,
  );
});
test("format: a nested Prettier config does not make an unformatted file pass", () => {
  expect("format", repo(nested('{\n    "a": 1\n}\n')), 1);
});
test("format: a nested Prettier config does not make a formatted file fail", () => {
  expect("format", repo(nested('{\n  "a": 1\n}\n')), 0);
});
test("format: a YAML file Prettier cannot parse is a finding", () => {
  const broken = "on: [pull_request\n";
  expect(
    "format",
    repo((root) => put(root, ".github/workflows/scorecard.yml", broken)),
    1,
  );
});
test("format: the owner-approved method text is not reformatted", () => {
  expect(
    "format",
    repo(edit("docs/engineering/gates.md", "# Gates\n", "#   Gates\n")),
    0,
  );
});
test("format: a tracked file of no known class cannot be checked", () => {
  expect(
    "format",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
test("format: another Prettier version than the pin cannot be checked", () => {
  expect("format", repo(pkg((p) => (p.devDependencies.prettier = "3.0.0"))), 3);
});
test("format: a canary that Prettier accepts cannot be checked", () => {
  const formatted = canaryDir("format", { "canary.md": "# Formatted\n" });
  const out = expect("format", repo(), 3, { canaries: formatted });
  assert.match(out, /Prettier passed a planted canary/);
});
test("format: a missing canary folder cannot be checked", () => {
  expect("format", repo(), 3, { canaries: join(tempDir(), "absent") });
});
const BRANCHES = Array.from(
  { length: 21 },
  (_, i) => `  if (a === ${i}) return ${i};`,
).join("\n");

test("lint: passes when ESLint fails its canaries and accepts every script", () => {
  const out = expect("lint", repo(script("export const one = 1;\n")), 0);
  assert.match(out, /\.svelte 0$/m);
});
test("lint and format: the Svelte config, the one .js file, is linted and formatted like a script", () => {
  const config = (text: string) => (root: string) =>
    put(root, "svelte.config.js", text);
  expect(
    "lint",
    repo(config('export const a = eval("1");\nexport default {};\n')),
    1,
  );
  expect("format", repo(config("export default {}\n")), 1);
});
test("format: an .html or a .css file is formatted", () => {
  expect(
    "format",
    repo((root) => put(root, "site/a.html", "<p>a</p>\n")),
    0,
  );
  expect(
    "format",
    repo((root) => put(root, "site/a.html", "<p >a</p>\n")),
    1,
  );
  expect(
    "format",
    repo((root) => put(root, "site/a.css", "a{color:red}\n")),
    1,
  );
});
test("lint: eval is a finding that names the rule", () => {
  assert.match(
    expect("lint", repo(script('export const x = eval("1");\n')), 1),
    /no-eval/,
  );
});
test("lint: an undefined global is a finding", () => {
  assert.match(
    expect("lint", repo(script("export const x = nope;\n")), 1),
    /no-undef/,
  );
});
test("lint: a function over the complexity limit is a finding", () => {
  const body = `export function f(a) {\n${BRANCHES}\n  return -1;\n}\n`;
  assert.match(expect("lint", repo(script(body)), 1), /complexity/);
});
test("lint: an unused disable directive is a finding", () => {
  expect(
    "lint",
    repo(
      script("// eslint-disable-next-line no-eval\nexport const one = 1;\n"),
    ),
    1,
  );
});
test("lint: another ESLint version than the pin cannot be checked", () => {
  expect("lint", repo(pkg((p) => (p.devDependencies.eslint = "9.0.0"))), 3);
});
test("lint: a canary that ESLint accepts cannot be checked", () => {
  const clean = canaryDir("lint", {
    "canary.mjs": "export const one = 1;\n",
    "canary.ts": "export const one = 1;\n",
  });
  const out = expect("lint", repo(), 3, { canaries: clean });
  assert.match(out, /ESLint missed planted canaries/);
});
test("lint: a tracked file of no known class cannot be checked", () => {
  expect(
    "lint",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
const tsScript =
  (body: string) =>
  (root: string): void =>
    put(root, "scripts/y.ts", body);
test("lint: an explicit any in a TypeScript script is a finding that names the rule", () => {
  const out = expect("lint", repo(tsScript("export const v: any = 1;\n")), 1);
  assert.match(out, /@typescript-eslint\/no-explicit-any/);
});
test("lint: a floating promise in a TypeScript script is a finding (type-aware)", () => {
  const body =
    "export async function f(): Promise<void> {\n  Promise.resolve(1);\n}\n";
  assert.match(expect("lint", repo(tsScript(body)), 1), /no-floating-promises/);
});
test("lint: a Vitest test without an assertion is a finding that names the rule", () => {
  const out = expect(
    "lint",
    repo((root) =>
      put(
        root,
        "scripts/a.test.ts",
        'import { test } from "vitest";\ntest("nothing", () => {});\n',
      ),
    ),
    1,
  );
  assert.match(out, /vitest\/expect-expect/);
});
test("lint: eval in a TypeScript script is a finding", () => {
  expect("lint", repo(tsScript('export const x: unknown = eval("1");\n')), 1);
});
test("lint: a canary folder without a TypeScript canary cannot be checked", () => {
  const onlyMjs = canaryDir("lint", {
    "canary.mjs": readFileSync(
      join(here, "canaries", "lint", "canary.mjs"),
      "utf8",
    ),
  });
  const out = expect("lint", repo(), 3, { canaries: onlyMjs });
  assert.match(out, /no canary for \.ts/);
});

test("types: passes when tsc fails its canary and the scripts type-check", () => {
  expect("types", repo(), 0);
});
test("types: a type error in a script is a finding that names the file", () => {
  const bad = (root: string): void =>
    put(root, "scripts/y.ts", 'export const n: number = "one";\n');
  assert.match(expect("types", repo(bad), 1), /scripts\/y\.ts/);
});
test("svelte: with no Svelte file tracked the step is not applicable, after svelte-check failed its canary", () => {
  const r = run(["svelte", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1) ?? "",
    /^NOT APPLICABLE svelte: svelte-check \S+ failed the canary; no component and no TypeScript outside scripts\/ is tracked$/,
    r.out,
  );
});
test("svelte: passes when svelte-check fails its canary and accepts every tracked component", () => {
  expect("svelte", repo(component(COMPONENT)), 0);
});
test("svelte: a type error in a component is a finding that names the file and the code", () => {
  const out = expect(
    "svelte",
    repo(
      component(
        COMPONENT.replace("<p>{count}</p>", "<p>{count.toUpperCase()}</p>"),
      ),
    ),
    1,
  );
  assert.match(out, /src\/Count\.svelte:\d+ 2339 /);
});
test("svelte: a component outside tsconfig.json's include cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      put(root, "lib/Other.svelte", COMPONENT);
    }),
    3,
  );
  assert.match(out, /lib\/Other\.svelte/);
});
test("svelte: a component in a folder tsconfig.json excludes cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      put(root, "src/legacy/Old.svelte", COMPONENT);
      edit(
        "tsconfig.json",
        '"include"',
        '"exclude": ["src/legacy"],\n  "include"',
      )(root);
    }),
    3,
  );
  assert.match(out, /src\/legacy\/Old\.svelte/);
});
test("svelte: tsconfig.json is read as TypeScript reads it: comments, a ./ include and an inherited exclude", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      put(root, "src/Count.svelte", COMPONENT);
      put(root, "src/legacy/Old.svelte", COMPONENT);
      put(root, "tsconfig.base.json", '{ "exclude": ["src/legacy"] }\n');
      const options = JSON.stringify(
        (JSON.parse(FIXTURE_TSCONFIG) as { compilerOptions: object })
          .compilerOptions,
      );
      put(
        root,
        "tsconfig.json",
        `{\n  // as generated configs are written\n  "extends": "./tsconfig.base.json",\n  "compilerOptions": ${options},\n  "include": ["./src/**/*.svelte"],\n}\n`,
      );
    }),
    3,
  );
  assert.match(out, /src\/legacy\/Old\.svelte/);
  assert.doesNotMatch(out, /src\/Count\.svelte/);
});
const TABLE = `<script lang="ts" generics="T extends { id: number }">\n  const { rows }: { rows: T[] } = $props();\n</script>\n\n<p>{rows.length}</p>\n`;
const MOUNT = (row: string) =>
  `import { mount } from "svelte";\nimport Table from "./Table.svelte";\ninterface Item {\n  id: number;\n  name: string;\n}\nexport const show = (target: HTMLElement) =>\n  mount(Table<Item>, { target, props: { rows: [${row}] } });\n`;
test("svelte: TypeScript that mounts a generic component is checked against its real type", () => {
  // tsc would refuse Table<Item> (TS2635: it sees only svelte's ambient module); svelte-check knows the component.
  const project = (row: string) => (root: string) => {
    put(root, "src/Table.svelte", TABLE);
    put(root, "src/show.ts", MOUNT(row));
  };
  const ok = expect("svelte", repo(project('{ id: 1, name: "a" }')), 0);
  assert.match(ok, /accepted 2 file\(s\)/);
  // Measured: tsc refuses Table<Item> (TS2635); here Item's own field is missing, which only the explicit Item can
  // say (TS2741).
  const out = expect("svelte", repo(project("{ id: 1 }")), 1);
  assert.match(out, /src\/show\.ts:\d+ 2741 /);
});
test("svelte: TypeScript in neither program cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => put(root, "tools/z.ts", "export const one = 1;\n")),
    3,
  );
  assert.match(out, /leaves out/);
  assert.match(out, /tools\/z\.ts/);
});
test("svelte: a script in the component program as well as in tsc's cannot be checked, and is named", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      edit(
        "tsconfig.json",
        '"include": ["src"',
        '"include": ["scripts", "src"',
      )(root);
    }),
    3,
  );
  assert.match(out, /scripts\/scan-secrets\.ts/);
});
test("svelte: a test and a rune module beside the components are svelte-check's, their errors found", () => {
  const COUNTER =
    "export function counter() {\n  let n = $state(0);\n  return { get: () => n, add: () => n++ };\n}\n";
  const beside = (file: string, text: string) => (r: string) => {
    component(COMPONENT)(r);
    put(r, file, text);
  };
  expect("svelte", repo(beside("src/count.svelte.ts", COUNTER)), 0);
  for (const [file, text, code] of [
    ["test/x.test.ts", 'export const n: number = "one";\n', 2322],
    [
      "src/count.svelte.ts",
      COUNTER.replace("$state(0)", '$state<number>("zero")'),
      2345,
    ],
  ] as const) {
    const out = expect("svelte", repo(beside(file, text)), 1);
    assert.match(out, new RegExp(`${file.replace(".", "\\.")}:\\d+ ${code} `));
  }
});
test("svelte: a component Svelte cannot parse is a finding with Svelte's own message and line", () => {
  // Measured with svelte-check 4.7.8: it drops a Svelte parse error that says "expected" when the config has no
  // preprocess and the component has any lang attribute, so a style Svelte rejects (p:is()) would hide an untyped
  // script. The step reports the parse error itself, with Svelte's line and message (measured with svelte 5.57.3's
  // parse).
  for (const [body, line] of [
    [
      '<script lang="ts">\n  const n = ;\n</script>\n\n<p>{n}</p>\n',
      "2: Unexpected token",
    ],
    [
      '<script lang="js">\n  const a = 1;\n</script>\n\n<p>{a}</p>\n\n<style>\n  p:is() {\n    color: red;\n  }\n</style>\n',
      "8: \\S",
    ],
    [
      '<p>{1}</p>\n\n<style lang="css">\n  p:is() {\n    color: red;\n  }\n</style>\n',
      "4: \\S",
    ],
  ]) {
    const out = expect("svelte", repo(component(body)), 1);
    // Each row pins Svelte's line; row 1 also its message's text, rows 2-3 only that some text follows. The message is
    // its first line only (the second is a link).
    assert.match(
      out,
      new RegExp(`src/Count\\.svelte: Svelte cannot parse it at line ${line}`),
      body,
    );
    assert.doesNotMatch(out, /svelte\.dev\/e\//, body);
  }
});
test("svelte: TypeScript outside scripts/ with no component cannot be checked: svelte-check needs one", () => {
  // Measured: svelte-check reports error 100001, no Svelte input, on a program of TypeScript alone.
  const out = expect(
    "svelte",
    repo((r) => put(r, "src/index.ts", "export const one = 1;\n")),
    3,
  );
  assert.match(out, /no component is tracked/);
  assert.match(out, /src\/index\.ts/);
});
test("svelte: a component without a TypeScript script is a finding: svelte-check would check none of it", () => {
  // Measured: svelte-check reports no error in the markup of a component without a script, nor in a script without
  // lang="ts"; only a TypeScript file that imports one gets TS7016.
  for (const body of [
    "<p>{1}</p>\n",
    "<script>\n  const n = 1;\n</script>\n\n<p>{n}</p>\n",
    '<script lang="js">\n  const n = 1;\n</script>\n\n<p>{n}</p>\n',
    `<script module>\n  export const k = 1;\n</script>\n\n${COMPONENT}`,
    '<!-- <script lang="ts"></script> -->\n<p>{1}</p>\n',
  ]) {
    const out = expect("svelte", repo(component(body)), 1);
    assert.match(
      out,
      /src\/Count\.svelte: a script that is not lang="ts", or none/,
      body,
    );
  }
});
test("svelte: a canary that svelte-check accepts cannot be checked", () => {
  const dir = canaryDir("svelte", {
    "tsconfig.json": `${JSON.stringify({
      ...(JSON.parse(FIXTURE_TSCONFIG) as object),
      include: ["canary.svelte"],
    })}\n`,
    "canary.svelte": COMPONENT,
  });
  // svelte-check must be able to accept it: the folder finds svelte's types as a real canary folder does.
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "svelte", "node_modules"),
  );
  const out = expect("svelte", repo(), 3, { canaries: dir });
  assert.match(out, /did not report the planted type errors/);
});
test("svelte: without a tracked svelte.config.js the step cannot be checked", () => {
  const out = expect("svelte", repo(remove("svelte.config.js")), 3);
  assert.match(out, /svelte\.config\.js is not tracked/);
});
test("svelte: no Svelte config below the root is imported, only the root's", () => {
  // svelte-check searches above the root and imports vite.config.* only while no root config exists (measured with
  // svelte-check 4.7.8, 2026-11-17); the step refuses to run without one, so the nested case is the one a run can meet.
  const root = repo(component(COMPONENT));
  const marker = join(root, "MARKER-nested");
  put(
    root,
    "docs/deep/svelte.config.js",
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\nexport default {};\n`,
  );
  expect("svelte", root, 0);
  assert.ok(!existsSync(marker), "the nested svelte.config.js was imported");
});
test("format: a formatted Svelte component passes through Prettier's Svelte plugin", () => {
  expect("format", repo(component(COMPONENT)), 0);
});
test("format: an unformatted Svelte component is a finding that names it", () => {
  const out = expect(
    "format",
    repo(component(COMPONENT.replace("<p>{count}</p>", "<p>{ count }</p>"))),
    1,
  );
  assert.match(out, /src\/Count\.svelte/);
});
test("format: the Svelte canary is checked only while Prettier's config loads the Svelte plugin", () => {
  // Prettier infers a file's parser from the config it finds above the file, so the canary folder gets its own.
  const canaries = (prettier: object) => {
    const dir = canaryDir("format", {
      "canary.svelte": readFileSync(
        join(here, "canaries", "format", "canary.svelte"),
        "utf8",
      ),
    });
    put(dir, "package.json", `${JSON.stringify(prettier)}\n`);
    symlinkSync(join(here, "..", "node_modules"), join(dir, "node_modules"));
    return dir;
  };
  const plugin = { prettier: { plugins: ["prettier-plugin-svelte"] } };
  expect("format", repo(), 0, { canaries: canaries(plugin) });
  const out = expect("format", repo(), 3, { canaries: canaries({}) });
  assert.match(out, /canary\.svelte/);
});
test("lint: a component in allowed markup passes, and the summary counts it per extension", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  let el: HTMLElement | undefined = $state();\n</script>",
        ).replace(
          "<p>{count}</p>",
          "<p bind:this={el} class={count > 1 ? 'many' : 'one'}>{count}</p>",
        ),
      ),
    ),
    0,
  );
  assert.match(out, /\.svelte 1$/m);
});
test("lint: a class: directive in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          "<p class:many={count > 1}>{count}</p>",
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax class: directive/);
});
test("lint: a <style> block in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        `${COMPONENT}\n<style>\n  p {\n    margin: 0;\n  }\n</style>\n`,
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax <style> block/);
});
test("lint: markup and code beside the injection bans pass in a component (setAttribute once would not: on plus letters, like any handler)", () => {
  // Near misses: another element through svelte:element, literal or computed; an iframe without srcdoc; reading
  // innerHTML; a string holding its name; setAttribute and createElement of other names; a write that is not a
  // document's; a name that only contains a sink's name; a local parseHTML or addRule; a bracketed name that is no
  // sink's; setAttribute of open or only-x (not handlers); execCommand of another command.
  expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          '  const { innerHTML } = document.body;\n  const log = { write: (s: string): string => s };\n  const sink = "innerHTML";\n' +
            '  const tag = "p";\n  const text = document.body.innerHTML;\n  const box = document.createElement("div");\n' +
            '  box.setAttribute("title", text);\n  box.setAttribute("open", "");\n  box.setAttribute("only-x", "");\n  box.append(document.createElementNS("http://www.w3.org/2000/svg", "circle"));\n  box["title"] = text;\n  const csvDocument = log;\n  const myDOMParserName = csvDocument.write(sink);\n' +
            '  const parseHTML = (s: string): string => s;\n  const addRule = (s: string): string => s;\n  document.execCommand("copy", false, addRule(parseHTML(text)));\n</script>',
        ).replace(
          "<p>{count}</p>",
          '<svelte:element this="p">{count}{log.write(innerHTML)}{sink}</svelte:element>\n<iframe title="frame" src="about:blank"></iframe>\n' +
            "<svelte:element this={tag}>{myDOMParserName}{box.title}</svelte:element>",
        ),
      ),
    ),
    0,
  );
});
// RND-04 (spec/table.md): with the per-name test below, every raw-HTML form its example names is a finding: {@html
// and srcdoc in a component, the
// script forms in a script (the script bans run in components too: canary.svelte plants setAttribute style and
// innerHTML).
const SINK = (body: string) =>
  `export function sink(el: HTMLElement, html: string): unknown {\n  ${body}\n  return el;\n}\n`;
test("lint: the raw-HTML forms of RND-04 are findings that name their ban", () => {
  for (const [form, change, ban] of [
    [
      "{@html",
      component(`${COMPONENT}{@html String(count)}\n`),
      "svelte/no-at-html-tags",
    ],
    [
      "innerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.innerHTML = html;")),
      "no-restricted-syntax assigning innerHTML",
    ],
    [
      "outerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.outerHTML = html;")),
      "no-restricted-syntax assigning innerHTML, outerHTML",
    ],
    [
      "insertAdjacentHTML",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('el.insertAdjacentHTML("beforeend", html);'),
        ),
      "no-restricted-syntax insertAdjacentHTML",
    ],
    [
      "document.write",
      (r: string) => put(r, "scripts/x.ts", SINK("document.write(html);")),
      "no-restricted-syntax document.write",
    ],
    [
      "createContextualFragment",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK("document.createRange().createContextualFragment(html);"),
        ),
      "no-restricted-syntax setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
    [
      "DOMParser",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('new DOMParser().parseFromString(html, "text/html");'),
        ),
      "no-restricted-syntax DOMParser",
    ],
    [
      "srcdoc",
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<iframe title="t" srcdoc={String(count)}></iframe>',
        ),
      ),
      "no-restricted-syntax srcdoc attribute",
    ],
  ] as const) {
    const out = expect("lint", repo(change), 1);
    assert.ok(out.includes(ban), `${form}: ${out}`);
  }
});
test("lint: every name a ban lists is a finding of that ban", () => {
  const scripts = [
    ['document.createElement("style");', "createElement of style"],
    ['document.createElement("link");', "createElement of style"],
    ['document.createElement("script");', "createElement of style"],
    ['el.setAttribute("SRCDOC", html);', "setAttribute srcdoc"],
    [
      'el.setAttribute("onclick", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    ["el.setHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["Document.parseHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["el.setHTML(html);", "setHTML or createRawSnippet"],
    ["void createRawSnippet;", "setHTML or createRawSnippet"],
    [
      "(el as HTMLIFrameElement).srcdoc = html;",
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    ['el["innerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      'Object.assign(el, { "outerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "Object.assign(el, { srcdoc: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    ["document.writeln(html);", "document.write"],
    ["window.document.write(html);", "document.write"],
    ["el.ownerDocument.write(html);", "document.write"],
    ["void new CSSStyleSheet();", "constructed or inserted style sheet"],
    [
      "void document.adoptedStyleSheets;",
      "constructed or inserted style sheet",
    ],
    [
      'document.styleSheets[0]?.insertRule("p {}");',
      "a rule inserted into a style sheet",
    ],
    [
      'document.styleSheets[0]?.addRule("p", "margin: 0");',
      "a rule inserted into a style sheet",
    ],
    [
      "(el as HTMLIFrameElement).contentDocument?.write(html);",
      "document.write",
    ],
    ["window.Document.parseHTML(html);", "Document.parseHTML"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "style");',
      "createElementNS of style",
    ],
    ['el["insertAdjacentHTML"]("beforeend", html);', "a sink name in brackets"],
    ['document["write"](html);', "a sink name in brackets"],
    ['el["setAttribute"]("style", "");', "a sink name in brackets"],
    [
      'document.execCommand("INSERTHTML", false, html);',
      "execCommand insertHTML",
    ],
    ["Document.parseHTML(html);", "Document.parseHTML"],
    ['document.createElement("SCRIPT");', "createElement of style"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "script");',
      "createElementNS of style",
    ],
    [
      'document.createElementNS("http://www.w3.org/1999/xhtml", "link");',
      "createElementNS of style",
    ],
    ['el["outerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      '(el as HTMLIFrameElement)["srcdoc"] = html;',
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    [
      "Object.assign(el, { outerHTML: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "innerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "srcdoc": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "const { ownerDocument } = el;\n  ownerDocument.write(html);",
      "document.write",
    ],
    [
      "const { contentDocument } = el as HTMLIFrameElement;\n  contentDocument?.write(html);",
      "document.write",
    ],
    ["el.innerHTML += html;", "assigning innerHTML, outerHTML or srcdoc"],
    [
      'el.setAttribute("ONCLICK", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    // Every name the bracket ban lists, in brackets: a name dropped from its list cannot stay green.
    ...[
      "insertAdjacentHTML",
      "setHTML",
      "setHTMLUnsafe",
      "parseHTML",
      "parseHTMLUnsafe",
      "createContextualFragment",
      "createRawSnippet",
      "DOMParser",
      "write",
      "writeln",
      "execCommand",
      "setAttribute",
      "createElement",
      "createElementNS",
      "CSSStyleSheet",
      "adoptedStyleSheets",
      "insertRule",
      "addRule",
    ].map((name) => [`void el["${name}"];`, "a sink name in brackets"]),
  ].map(([body, ban], i) => [`scripts/s${i}.ts`, SINK(body), ban]);
  const markup = [
    ['<iframe SRCDOC="<p>x</p>" title="t"></iframe>', "srcdoc attribute"],
    [
      '<svelte:element this={"STYLE"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ["<x-raw {outerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
    ['<link rel="stylesheet" href="x.css" />', "style, link or script element"],
    ["<div><script>alert(1)</script></div>", "style, link or script element"],
    ["<div><style></style></div>", "style, link or script element"],
    ["<div><sCRIPT>alert(1)</sCRIPT></div>", "style, link or script element"],
    [
      '<svelte:element this="script"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="link"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="SCRIPT"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this={"style"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    [
      '<svelte:element this={"link"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ['<iframe {srcdoc} title="t"></iframe>', "srcdoc attribute"],
    ["<x-raw outerHTML={srcdoc}></x-raw>", "innerHTML or outerHTML attribute"],
    ["<x-raw {innerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
  ].map(([tag, ban], i) => [
    `src/C${i}.svelte`,
    COMPONENT.replace(
      "$props();",
      '$props();\n  const srcdoc = "";\n  const innerHTML = "";\n  const outerHTML = "";',
    ).replace(
      "<p>{count}</p>",
      `<p>{count}{srcdoc}{innerHTML}{outerHTML}</p>\n${tag}`,
    ),
    ban,
  ]);
  const out = expect(
    "lint",
    repo((root) => {
      component(COMPONENT)(root);
      for (const [file, text] of [...scripts, ...markup]) put(root, file, text);
    }),
    1,
  );
  const lines = out.split("\n").map((l) => l.trim());
  for (const [file, , ban] of [...scripts, ...markup])
    assert.ok(
      lines.some(
        (l) =>
          l.startsWith(`${file}:`) && l.includes(`no-restricted-syntax ${ban}`),
      ),
      `${file} ${ban}: ${out}`,
    );
});
test("lint: a raw-HTML sink named without being called or assigned is a finding", () => {
  for (const [body, ban] of [
    ["const Parser = DOMParser;\n  void new Parser();", "DOMParser"],
    [
      "const write = document.write.bind(document);\n  write(html);",
      "document.write",
    ],
    [
      "const fragment = document.createRange().createContextualFragment;\n  void fragment;",
      "setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
  ]) {
    const out = expect(
      "lint",
      repo((r) => put(r, "scripts/x.ts", SINK(body))),
      1,
    );
    assert.ok(out.includes(`no-restricted-syntax ${ban}`), `${body}: ${out}`);
  }
});
test("lint: a raw-HTML sink in a .js or .mjs file is a finding", () => {
  for (const file of [
    "svelte.config.js",
    "scripts/x.mjs",
    "site/public/x.js",
  ]) {
    const out = expect(
      "lint",
      repo((r) =>
        put(
          r,
          file,
          "export function sink(el, html) {\n  el.innerHTML = html;\n}\n",
        ),
      ),
      1,
    );
    assert.ok(
      out.includes("no-restricted-syntax assigning innerHTML"),
      `${file}: ${out}`,
    );
  }
});
test("lint: a browser API above the support floor in a component is a finding that names the rule", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  const share = new PaymentRequest([], { total: { label: 'x', amount: { currency: 'EUR', value: '1' } } });\n</script>",
        ).replace("{count}</p>", "{count}{String(share)}</p>"),
      ),
    ),
    1,
  );
  assert.match(out, /compat\/compat/);
});
test("lint: an HTML disable comment does not switch a rule off in a component", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<!-- eslint-disable -->\n<p style="color: red">{count}</p>',
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax style attribute/);
});
test("lint: a config block that changes a proven rule for the component's folders cannot be checked", () => {
  // Measured: a later block that sets no-restricted-syntax for some files replaces the list for them, while every
  // canary still passes. Each rule the canaries prove must be configured for src/lib and site/src as for its canary.
  const real = join(here, "..", "eslint.config.mjs");
  for (const [block, named, file = ""] of [
    [
      '{ files: ["src/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte: no-restricted-syntax\n",
    ],
    // A block narrower than the probes: the file it reaches is compared too.
    [
      '{ files: ["src/lib/components/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/components/Grid.svelte: no-restricted-syntax\n",
      "src/lib/components/Grid.svelte",
    ],
    [
      '{ files: ["**/DataTable.svelte"], rules: { "svelte/no-at-html-tags": "off" } }',
      "src/lib/DataTable.svelte: svelte/no-at-html-tags",
      "src/lib/DataTable.svelte",
    ],
    [
      '{ files: ["src/**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte.ts: no-restricted-syntax\n",
    ],
    [
      '{ files: ["src/**"], linterOptions: { noInlineConfig: false } }',
      "src/lib/probe.svelte: linterOptions",
    ],
    [
      '{ files: ["site/**"], rules: { "svelte/no-at-html-tags": "off" } }',
      "site/src/probe.svelte: svelte/no-at-html-tags",
    ],
    [
      '{ files: ["src/**/*.ts"], rules: { "@typescript-eslint/ban-ts-comment": "off" } }',
      "src/lib/probe.ts: @typescript-eslint/ban-ts-comment",
    ],
    [
      '{ files: ["site/**"], settings: { browsers: ["chrome 140"] } }',
      "site/src/probe.ts: settings",
    ],
    // Each Vitest rule, off for the component's tests only: the tracked test file is compared.
    ...[
      "expect-expect",
      "no-focused-tests",
      "no-disabled-tests",
      "valid-expect",
    ].map((rule) => [
      `{ files: ["src/**/*.test.ts"], rules: { "vitest/${rule}": "off" } }`,
      `src/lib/x.test.ts: vitest/${rule}`,
      "src/lib/x.test.ts",
    ]),
  ]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect(
      "lint",
      repo(
        file.endsWith(".test.ts")
          ? (root) =>
              put(
                root,
                file,
                `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
              )
          : file
            ? component(COMPONENT, file)
            : () => {},
      ),
      3,
      { extraEnv: { ESLINT_CONFIG: config } },
    );
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
  // Adding a block that leaves the proven rules alone is not a finding.
  const config = join(tempDir(), "eslint.config.mjs");
  writeFileSync(
    config,
    `import base from ${JSON.stringify(real)};\nexport default [...base, { files: ["src/**"], rules: { "no-console": "error" } }];\n`,
  );
  expect("lint", repo(), 0, { extraEnv: { ESLINT_CONFIG: config } });
});
test("lint: a block that weakens the bans for a whole extension, its canary too, cannot be checked", () => {
  // Measured (security review of 4528469): a block for **/*.svelte.ts keeping the one ban its canary plants, or a no-op
  // processor for components, changed canary and file alike, and the step passed with the sink in the file.
  const real = join(here, "..", "eslint.config.mjs");
  const RUNE =
    'export const doc = new DOMParser().parseFromString("<p></p>", "text/html");\nexport const s = document.createElement("style");\n';
  const RAW =
    '<script lang="ts">\n  const { html }: { html: string } = $props();\n</script>\n\n{@html html}\n';
  const allBut = (files: string[]) =>
    `{ files: ${JSON.stringify(files)}, rules: { "no-restricted-syntax": ["error", ...base.flatMap((b) => b.files?.includes("**/*.svelte.ts") ? (b.rules?.["no-restricted-syntax"] ?? []).slice(1) : []).filter((e) => !/DOMParser/.test(e.message))] } }`;
  for (const [block, named, change] of [
    [
      `{ files: ["**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "assigning innerHTML (PRD-S2)" }] } }`,
      "scripts/rune.svelte.ts: no-restricted-syntax without each ban of the .ts canary",
      (root: string) => put(root, "scripts/rune.svelte.ts", RUNE),
    ],
    [
      allBut(["**/*.svelte"]),
      "src/lib/probe.svelte: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      allBut(["**/*.mjs", "**/*.js"]),
      "src/lib/probe.mjs: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      '{ files: ["src/lib/**/*.svelte"], processor: { preprocess: () => [], postprocess: () => [] } }',
      "src/lib/Raw.svelte: processor",
      component(RAW, "src/lib/Raw.svelte"),
    ],
    [
      '{ files: ["src/lib/**/*.ts"], languageOptions: { parser: { meta: { name: "other", version: "1.0.0" }, parse: () => { throw new Error("unused"); } } } }',
      "src/lib/probe.ts: parser",
      () => {},
    ],
  ] as [string, string, (root: string) => void][]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect("lint", repo(change), 3, {
      extraEnv: { ESLINT_CONFIG: config },
    });
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
});
test("lint: no PostCSS config is loaded for a component, not even one above the root", () => {
  const parent = tempDir();
  const root = join(parent, "root");
  // An ignore comment (SUPPRESSIONS[0]) makes the plugin compile the component, the path that loads PostCSS (measured).
  const styled = COMPONENT.replace(
    "<p>{count}</p>",
    `<!-- ${SUPPRESSIONS[0]} a11y_missing_attribute -->\n<p class="n">{count}</p>\n\n<style lang="postcss">\n  .n {\n    color: red;\n  }\n</style>`,
  );
  cpSync(repo(component(styled)), root, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const marker = join(parent, "MARKER-postcss");
  put(
    parent,
    "postcss.config.cjs",
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nmodule.exports = {};\n`,
  );
  const out = expect("lint", root, 1);
  assert.match(out, /no-restricted-syntax <style> block/);
  assert.ok(
    !existsSync(marker),
    "the PostCSS config above the root was loaded",
  );
});
test("svelte: a warning is a finding that names its code", () => {
  const out = expect(
    "svelte",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<p>{count}</p>\n<img src="count.png" />',
        ),
      ),
    ),
    1,
  );
  assert.match(out, /src\/Count\.svelte:\d+ a11y_missing_attribute /);
});
test("svelte: a canary that reports only the wrong type, as a non-strict config would, cannot be checked", () => {
  const options = (JSON.parse(FIXTURE_TSCONFIG) as { compilerOptions: object })
    .compilerOptions;
  const dir = canaryDir("svelte", {
    "tsconfig.json": `${JSON.stringify({ compilerOptions: { ...options, strict: false }, include: ["canary.svelte"] })}\n`,
    "canary.svelte": readFileSync(
      join(here, "canaries", "svelte", "canary.svelte"),
      "utf8",
    ),
  });
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "svelte", "node_modules"),
  );
  const out = expect("svelte", repo(), 3, { canaries: dir });
  assert.match(out, /did not report the planted type errors/);
});
/** A stand-in for svelte-check: the canary folder (.../svelte) prints `canary`, the repository `rest`, each line a
 * machine-verbose line; the canary run exits 1, the repository run `status`. */
function fakeSvelteCheck(canary: string[], rest: string[], status = 1): string {
  const bin = join(tempDir(), "svelte-check");
  const say = (lines: string[]) =>
    lines.map((l) => `echo '1 ${l}'`).join("; ") || ":";
  writeFileSync(
    bin,
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "svelte-check, ${PINS["svelte-check"]}"; exit 0; fi\ncase "$(pwd)" in\n  */svelte) ${say(canary)};;\n  *) ${say(rest)}; exit ${status};;\nesac\nexit 1\n`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
/** One diagnostic line as svelte-check prints it. */
const diagnostic = (code: number, type = "ERROR", filename = "canary.svelte") =>
  JSON.stringify({
    type,
    filename,
    start: { line: 1 },
    code,
    message: "planted",
  });
const PLANTED = [
  diagnostic(2322),
  diagnostic(7006),
  diagnostic(2322, "ERROR", "canary.ts"),
];
test("svelte: output that is not svelte-check's diagnostics cannot be checked, from the canary run or the real one", () => {
  for (const [canary, rest] of [
    [['{"type":"ERROR","filename'], []],
    [PLANTED, ['{"type":"ERROR","filename']],
    [PLANTED, ['{"type":"ERROR"}']],
  ]) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: { SVELTE_CHECK_BIN: fakeSvelteCheck(canary, rest) },
    });
    assert.match(out, /not its diagnostics/);
  }
});
test("svelte: a canary run missing a planted error, reporting it as a warning or on another file cannot be checked", () => {
  for (const canary of [
    [diagnostic(7006)],
    [diagnostic(2322), diagnostic(7006, "WARNING")],
    [diagnostic(2322), diagnostic(7006, "ERROR", "other.svelte")],
    [diagnostic(2322), diagnostic(7006)],
  ]) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: { SVELTE_CHECK_BIN: fakeSvelteCheck(canary, []) },
    });
    assert.match(out, /did not report the planted type errors/);
  }
});
test("svelte: a status and output other than exit 0 clean or exit 1 with diagnostics cannot be checked, and is named", () => {
  const found = [diagnostic(2322, "ERROR", "src/Count.svelte")];
  for (const [rest, status] of [
    [[], 1],
    [found, 0],
    [found, 2],
  ] as const) {
    const out = expect("svelte", repo(component(COMPONENT)), 3, {
      extraEnv: {
        SVELTE_CHECK_BIN: fakeSvelteCheck(PLANTED, [...rest], status),
      },
    });
    assert.match(out, new RegExp(`svelte-check exited ${status}$`, "m"));
  }
});
test("svelte: a tsconfig.json TypeScript cannot read cannot be checked, and says why", () => {
  const out = expect(
    "svelte",
    repo((root) => {
      component(COMPONENT)(root);
      edit("tsconfig.json", "{", '{\n  "extends": "./nope.json",')(root);
    }),
    3,
  );
  assert.match(out, /TypeScript cannot read tsconfig\.json/);
});
test("svelte: another svelte-check version than the pin cannot be checked", () => {
  expect(
    "svelte",
    repo(pkg((p) => (p.devDependencies["svelte-check"] = "0.0.1"))),
    3,
  );
});
test("types: scripts/ name their own types: the component side's ambient types are not theirs", () => {
  // The root tsconfig.json declares the component side's types (svelte here; Vite's client in a component project);
  // scripts/tsconfig.json names its own, so a rune, which only Svelte's types declare, is a type error in a script.
  const root = repo((r) => {
    for (const f of ["tsconfig.json", "scripts/tsconfig.json"])
      put(r, f, readFileSync(join(here, "..", f)));
    put(r, "scripts/count.ts", "export const n: number = $state(0);\n");
  });
  const out = expect("types", root, 1);
  assert.match(out, /scripts\/count\.ts.*TS2304/);
});
test("types: a script scripts/tsconfig.json leaves out cannot be checked", () => {
  const outside = (root: string): void => {
    put(root, "scripts/z.ts", "export const one = 1;\n");
    put(
      root,
      "scripts/tsconfig.json",
      SCRIPTS_TSCONFIG.replace('"canaries/**"]', '"canaries/**", "z.ts"]'),
    );
  };
  assert.match(expect("types", repo(outside), 3), /scripts\/z\.ts/);
});
test("types: a repository without scripts/tsconfig.json cannot be checked", () => {
  const out = expect("types", repo(remove("scripts/tsconfig.json")), 3);
  assert.match(out, /tsc could not read/);
});
test("types: a scripts/tsconfig.json that turns checking off cannot be checked: the canary runs under it", () => {
  const root = repo((r) => {
    put(
      r,
      "scripts/tsconfig.json",
      SCRIPTS_TSCONFIG.replace(
        "{\n",
        '{\n  "compilerOptions": { "noCheck": true },\n',
      ),
    );
    for (const f of ["canary.ts", "tsconfig.json"])
      put(
        r,
        `scripts/canaries/types/${f}`,
        readFileSync(join(here, "canaries", "types", f), "utf8"),
      );
  });
  const out = expect("types", root, 3, {
    canaries: join(root, "scripts", "canaries"),
  });
  assert.match(out, /tsc did not report the planted type errors/);
});
test("types: a declaration file, or a .js file other than svelte.config.js and site/public/*.js, has no class", () => {
  // TypeScript reads any name with ".d." as a declaration file (ts.isDeclarationFileName), and skipLibCheck skips it.
  for (const file of [
    "src/app.d.ts",
    "scripts/x.d.ts",
    "src/x.d.css.ts",
    "src/x.d.test.ts",
    "scripts/x.d.test.ts",
    "scripts/a.d.svelte.ts",
    "src/x.js",
    "vite.config.js",
    "docs/svelte.config.js",
    // Only a script directly in site/public has a class
    "site/public/deep/x.js",
  ]) {
    const out = expect(
      "types",
      repo((r) => put(r, file, "export {};\n")),
      3,
    );
    assert.ok(out.includes(file), `${file}: ${out}`);
  }
});
test("types: a name with .d inside a word keeps its class: only .d. marks a declaration", () => {
  // tsc must check it: an error in it is a finding.
  const out = expect(
    "types",
    repo((r) =>
      put(r, "scripts/x.dom.ts", 'export const n: number = "one";\n'),
    ),
    1,
  );
  assert.match(out, /scripts\/x\.dom\.ts/);
  // ... and it stays tsc's alone: the svelte step has nothing of its own.
  const svelte = run([
    "svelte",
    "--root",
    repo((r) => put(r, "scripts/x.dom.ts", "export const one = 1;\n")),
  ]);
  assert.equal(svelte.code, 0, svelte.out);
  assert.match(svelte.out, /^NOT APPLICABLE svelte/m);
});

test("types: TypeScript outside scripts/ is not tsc's: an error there is svelte-check's to find", () => {
  // tsc sees a component only through svelte's ambient module, so it is not asked about the component side.
  const out = expect(
    "types",
    repo((root) =>
      put(root, "src/bad.ts", 'export const n: number = "one";\n'),
    ),
    0,
  );
  assert.doesNotMatch(out, /src\/bad\.ts/);
});
test("types: another TypeScript version than the pin cannot be checked", () => {
  expect(
    "types",
    repo(pkg((p) => (p.devDependencies.typescript = "5.0.0"))),
    3,
  );
});
test("types: a canary that tsc accepts cannot be checked", () => {
  const clean = canaryDir("types", {
    "canary.ts": "export const one = 1;\n",
    "tsconfig.json":
      '{ "compilerOptions": { "strict": true, "noEmit": true } }\n',
  });
  const out = expect("types", repo(), 3, { canaries: clean });
  assert.match(out, /tsc did not report the planted type error/);
});
test("types: a canary project that is not strict cannot be checked", () => {
  const loose = canaryDir("types", {
    "canary.ts":
      'export const n: number = "one";\nexport function same(x) {\n  return x;\n}\n',
    "tsconfig.json":
      '{ "compilerOptions": { "strict": false, "noEmit": true } }\n',
  });
  const out = expect("types", repo(), 3, { canaries: loose });
  assert.match(out, /TS7006/);
});
test("types: a canary tsc fails for another reason cannot be checked", () => {
  // A canary config listing no file makes tsc exit non-zero without ever reading the planted error.
  const broken = canaryDir("types", {
    "canary.ts": 'export const n: number = "one";\n',
    "tsconfig.json": '{ "files": [] }\n',
  });
  const out = expect("types", repo(), 3, { canaries: broken });
  assert.match(out, /tsc did not report the planted type error/);
});
test("types: a canary whose wrong type tsc does not report cannot be checked", () => {
  const strictOnly = canaryDir("types", {
    "canary.ts": "export function same(x) {\n  return x;\n}\n",
    "tsconfig.json":
      '{ "compilerOptions": { "strict": true, "noEmit": true } }\n',
  });
  expect("types", repo(), 3, { canaries: strictOnly });
});

// The site's test files read the site's own build with DOMParser (the one named exception to its ban)
const PARSES = `import { expect, test } from "vitest";
test("parses", () => {
  expect(new DOMParser().parseFromString("<p></p>", "text/html").body).toBeTruthy();
});
`;
test("lint: DOMParser passes in a site test file and still fires in site/src and in a src/lib test file", () => {
  expect(
    "lint",
    repo((r) => put(r, "site/a.test.ts", PARSES)),
    0,
  );
  for (const file of ["site/src/x.ts", "src/lib/x.test.ts"]) {
    const out = expect(
      "lint",
      repo((r) => put(r, file, PARSES)),
      1,
    );
    assert.ok(out.includes("DOMParser (PRD-S2)"), `${file}: ${out}`);
  }
});
test("lint: a DOMParser lift elsewhere, or a wider lift for site tests, cannot be checked", () => {
  const real = join(here, "..", "eslint.config.mjs");
  const lift = (files: string, drop: string) =>
    `{ files: [${JSON.stringify(files)}], rules: { "no-restricted-syntax": ["error", ...base.flatMap((b) => b.files?.includes("**/*.ts") ? (b.rules?.["no-restricted-syntax"] ?? []).slice(1) : []).filter((e) => !${drop}.test(e.message))] } }`;
  for (const [block, file, named] of [
    [
      lift("src/lib/**/*.test.ts", "/DOMParser/"),
      "src/lib/x.test.ts",
      "src/lib/x.test.ts: no-restricted-syntax",
    ],
    [
      lift("site/**/*.test.ts", "/DOMParser|createElement /"),
      "site/a.test.ts",
      "site/a.test.ts: no-restricted-syntax",
    ],
    [
      lift("site/**/*.test.ts", "/DOMParser/").replace('["error"', '["off"'),
      "site/a.test.ts",
      "site/a.test.ts: no-restricted-syntax",
    ],
  ]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect(
      "lint",
      repo((r) =>
        put(
          r,
          file,
          `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
        ),
      ),
      3,
      {
        extraEnv: { ESLINT_CONFIG: config },
      },
    );
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
});
