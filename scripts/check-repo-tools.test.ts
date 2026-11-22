// Tests for check-repo.ts: the tool steps format, types and svelte. Fixtures in check-repo.fixture.ts.

import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  COMPONENT,
  FIXTURE_TSCONFIG,
  PINS,
  SCRIPTS_TSCONFIG,
  UNDER_NODE_MODULES,
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
test("format: a file Prettier leaves out cannot be checked", () => {
  const out = expect(
    "format",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.md`, "# Note\n")),
    3,
  );
  assert.match(out, /Prettier did not check 1 file/);
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
