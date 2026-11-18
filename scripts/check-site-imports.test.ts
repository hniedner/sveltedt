// Tests for check-site-imports.ts (IMP-01). Each case builds a small git repository in a temporary folder, plants
// files in site/src and asserts the exit code, the first word of the last line and the content of the output.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  "check-site-imports.ts",
);
const PKG = "@hniedner/sveltedt";
const exportsOf = (e: unknown): string =>
  JSON.stringify({ name: PKG, exports: e });
const ROOT_EXPORTS = exportsOf({ ".": { svelte: "./src/lib/index.ts" } });
const GOOD = `import { DataTable } from '${PKG}';\n`;
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A repository holding the given files, staged so `git ls-files` lists them; the default root and site files are
 * a package.json with an `exports` field and one clean site file (so "N file(s) read" counts that one too). */
function repo(
  files: Readonly<Record<string, string>>,
  defaults = true,
): string {
  const root = mkdtempSync(join(tmpdir(), "check-site-imports-"));
  made.push(root);
  const all = defaults
    ? { "package.json": ROOT_EXPORTS, "site/src/main.ts": GOOD, ...files }
    : files;
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  return root;
}
const plant = (name: string, text: string): string =>
  repo({ [`site/src/${name}`]: text });

/** Runs the scan and asserts its exit code and the word its last line starts with; returns the output. */
function expect(args: string[], code: number): string {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  const out = r.stdout + r.stderr;
  assert.equal(r.status, code, out);
  const word = ["PASS", "FINDING", "USAGE", "COULD NOT CHECK"][code];
  assert.match(
    out.trim().split("\n").at(-1) ?? "",
    new RegExp(`^${word} check-site-imports:`),
    out,
  );
  return out;
}
/** One finding in the planted file, two files read, and the finding's text. */
function found(root: string, file: string, text: RegExp): void {
  const out = expect(["--root", root], 1);
  assert.match(out, new RegExp(`${file.replace(/\./g, "\\.")}:\\d+: .*`));
  assert.match(out, text);
  assert.match(out, /1 finding\(s\); 2 file\(s\) read, canaries found/);
}
const passes = (root: string, files: number): string => {
  const out = expect(["--root", root], 0);
  assert.match(
    out,
    new RegExp(
      `^PASS check-site-imports: ${files} file\\(s\\) read, canaries found$`,
      "m",
    ),
  );
  return out;
};

// ---- IMP-01 canary table: each row planted in site/src and found
test("IMP-01 row: a deep import in a .ts file is a finding", () => {
  found(
    plant(
      "a.ts",
      "import { DataTable } from '../../src/lib/DataTable.svelte'\n",
    ),
    "a.ts",
    /reaches the repository's src\//,
  );
});
test("IMP-01 row: a re-export from src is a finding", () => {
  found(
    plant("a.ts", "export { DataTable } from '../../src/lib/index.ts'\n"),
    "a.ts",
    /reaches the repository's src\//,
  );
});
test("IMP-01 row: a dynamic import of src is a finding", () => {
  found(
    plant("a.ts", "await import('../../src/lib/Pagination.svelte')\n"),
    "a.ts",
    /reaches the repository's src\//,
  );
});
test("IMP-01 row: an import of the build output is a finding", () => {
  found(
    plant("a.ts", "import { DataTable } from '../../dist/index.js'\n"),
    "a.ts",
    /build output/,
  );
});
test("IMP-01 row: a deep import inside the script of a .svelte file is a finding", () => {
  const text =
    "<script lang=\"ts\">\n  import { DataTable } from '../../src/lib/DataTable.svelte'\n</script>\n";
  assert.match(
    expect(["--root", plant("A.svelte", text)], 1),
    /A\.svelte:2: .*reaches the repository's src\//,
  );
});
test("IMP-01 row: a subpath the exports field does not name is a finding", () => {
  found(
    plant(
      "a.ts",
      `import { DataTable } from '${PKG}/src/lib/DataTable.svelte'\n`,
    ),
    "a.ts",
    /\.\/src\/lib\/DataTable\.svelte is not a subpath/,
  );
});
test("IMP-01 row: a Vite alias that points the name at the repository is a finding", () => {
  const text = `export default { resolve: { alias: { '${PKG}': '../../src/lib' } } };\n`;
  found(
    plant("vite.config.ts", text),
    "vite.config.ts",
    /alias names @hniedner\/sveltedt/,
  );
});
test("IMP-01 row: a tsconfig paths entry that points the name at the repository is a finding", () => {
  const text = `{ "compilerOptions": { "paths": { "${PKG}": ["../../src/lib/index.ts"] } } }\n`;
  found(
    plant("tsconfig.json", text),
    "tsconfig.json",
    /paths entry "@hniedner\/sveltedt" redirects/,
  );
});
test("IMP-01 row: @source of src in a .css file is a finding", () => {
  found(
    plant("app.css", "@source '../../src';\n"),
    "app.css",
    /@source \.\.\/\.\.\/src: reaches the repository's src\//,
  );
});
test("IMP-01 row: @source of the repository root in a .css file is a finding", () => {
  found(
    plant("app.css", "@source '../../';\n"),
    "app.css",
    /@source \.\.\/\.\.\/: reaches the repository root/,
  );
});
test("IMP-01 row: source(...) of src on an @import in a .css file is a finding", () => {
  found(
    plant("app.css", "@import 'tailwindcss' source('../../src');\n"),
    "app.css",
    /reaches the repository's src\//,
  );
});
// ---- IMP-01 passing rows
test("IMP-01 row: an import of the package name alone passes, and the files read are counted", () => {
  passes(plant("a.ts", GOOD), 2);
});
for (const [row, path, text] of [
  [
    "the installed package's own folder",
    "",
    /the installed package's own folder/,
  ],
  ["a folder above src/lib", "/src", /names src in the installed package/],
  [
    "a folder below src/lib",
    "/src/lib/parts",
    /names src\/lib\/parts in the installed package/,
  ],
  ["a glob", "/src/lib/**/*.svelte", /a glob into the installed package/],
] as const)
  test(`IMP-01 row: @source naming ${row} through the installed name is a finding`, () => {
    found(
      plant("app.css", `@source '../node_modules/${PKG}${path}';\n`),
      "app.css",
      text,
    );
  });
test("IMP-01 row: source(...) naming the installed package's own folder is a finding", () => {
  found(
    plant(
      "app.css",
      `@import 'tailwindcss' source('../node_modules/${PKG}');\n`,
    ),
    "app.css",
    /the installed package's own folder/,
  );
});
test("IMP-01 row: @source naming the exports' deepest folder through the installed name passes, with or without a trailing slash", () => {
  passes(plant("app.css", `@source '../node_modules/${PKG}/src/lib';\n`), 2);
  passes(plant("app.css", `@source './../node_modules/${PKG}/src/lib/';\n`), 2);
});
test("the deepest folder follows every exports target under every condition", () => {
  const root = repo({
    "package.json": exportsOf({
      ".": { types: "./dist/index.d.ts", svelte: "./dist/index.js" },
      "./parts/*": "./dist/parts/*.js",
    }),
    "site/src/app.css": `@source '../node_modules/${PKG}/src/lib';\n`,
  });
  assert.match(
    expect(["--root", root], 1),
    /names src\/lib in the installed package, not the folder its exports point at \(dist\)/,
  );
});
test("exports whose deepest folder is the package's own folder cannot be checked", () => {
  const root = repo({
    "package.json": exportsOf({ ".": "./index.js", "./lib": "./lib/a.js" }),
  });
  assert.match(
    expect(["--root", root], 3),
    /deepest folder is the package's own folder/,
  );
});
test("IMP-01 row: @source naming the site's own folder passes", () => {
  passes(plant("app.css", "@source '../';\n"), 2);
});
test("IMP-01 row: source(none), @source not and @source inline name no path", () => {
  const css =
    "@import 'tailwindcss' source(none);\n@source not '../../src';\n@source inline(\"p-{1,2} ../../src\");\n";
  passes(plant("app.css", css), 2);
});

// ---- what counts as an import of SvelteDT
test("a relative path to the root, above it, and to dist are findings; to the site, a fixture or a sibling are not", () => {
  const r = plant(
    "a.ts",
    "import a from '../../'; import b from '../../..'; import c from '../../x/y/../../dist/z';\n",
  );
  assert.match(expect(["--root", r], 1), /3 finding\(s\); 2 file\(s\) read/);
  const ok = repo({
    "site/src/a.ts":
      "import a from './b.ts'; import b from '../../test/fixtures/x.ts'; import c from '../dist/x.js';\n",
  });
  passes(ok, 2);
});
test("a subpath the root exports names passes, one a `*` pattern covers passes, a null target is a finding", () => {
  const root = repo({
    "package.json": exportsOf({
      ".": "./lib/a.ts",
      "./extra": "./lib/b.ts",
      "./ui/*": "./lib/ui/*.ts",
      "./private": null,
    }),
    "site/src/a.ts": `import a from '${PKG}/extra'; import b from '${PKG}/ui/x';\n`,
  });
  passes(root, 2);
  assert.match(
    expect(["--root", plant("b.ts", `import a from '${PKG}/private'\n`)], 1),
    /\.\/private is not a subpath/,
  );
});
test("a bare `@hniedner/sveltedt/` and a name that only starts the same are judged as written", () => {
  assert.match(
    expect(["--root", plant("a.ts", `import a from '${PKG}/'\n`)], 1),
    /1 finding\(s\)/,
  );
  passes(
    plant(
      "a.ts",
      `import a from '${PKG}-other'; import b from '@hniedner/other';\n`,
    ),
    2,
  );
});
test("side-effect imports, export-from, require and import.meta.glob are read", () => {
  const text =
    "import '../../src/a.css';\nexport * from '../../src/b';\nconst c = require('../../src/c');\nconst d = import.meta.glob(['./ok/*.ts', '../../src/**/*.ts']);\n";
  assert.match(
    expect(["--root", plant("a.ts", text)], 1),
    /4 finding\(s\); 2 file\(s\) read/,
  );
});
test("a dynamic import whose argument is not a string literal cannot be read and is a finding", () => {
  assert.match(
    expect(["--root", plant("a.ts", "const m = await import(path);\n")], 1),
    /not a string literal/,
  );
  assert.match(
    expect(
      ["--root", plant("a.ts", "const m = await import(`../../${name}`);\n")],
      1,
    ),
    /not a string literal/,
  );
});
test("a multi-line import statement is read, with the line of its path", () => {
  assert.match(
    expect(
      [
        "--root",
        plant("a.ts", `\nimport {\n  A,\n  B,\n} from '../../src/lib/x'\n`),
      ],
      1,
    ),
    /a\.ts:5: /,
  );
});
test("a path is judged as written: a link in it is not followed", () => {
  const root = repo({
    "src/lib/x.ts": "export const x = 1;\n",
    "site/src/a.ts": "import { x } from './link/lib/x.ts';\n",
  });
  symlinkSync("../../src", join(root, "site/src/link"));
  execFileSync("git", ["-C", root, "add", "-A"]);
  passes(root, 2);
});
test("a file under site/dist or any node_modules is not read", () => {
  const bad = "import a from '../../src/x';\n";
  const root = repo({
    "site/dist/a.js": bad,
    "site/node_modules/p/a.js": bad,
    "site/src/node_modules/q/a.js": bad,
  });
  passes(root, 1);
});
test("every extension the statement lists is read, and a file of another kind is not", () => {
  const bad = "import a from '../../src/x';\n";
  const files = Object.fromEntries(
    ["ts", "mts", "cts", "js", "mjs", "cjs"].map((e) => [
      `site/src/f.${e}`,
      bad,
    ]),
  );
  files["site/src/f.svelte"] = `<script lang="ts">\n${bad}</script>\n`;
  assert.match(
    expect(["--root", repo({ ...files, "site/src/notes.md": bad })], 1),
    /7 finding\(s\); 8 file\(s\) read/,
  );
});

// ---- CSS
test("CSS at-rules: @import, @plugin, @config and @reference are read; comments and unknown at-rules are not", () => {
  const css =
    "@import '../../src/lib/x.css';\n@plugin '../../src/p.js';\n@config '../../src/tw.js';\n@reference '../../src/r.css';\n" +
    "/* @source '../../src'; */\n@import 'tailwindcss';\n@plugin '@tailwindcss/typography';\n@theme { --x: 1px; }\n";
  assert.match(
    expect(["--root", plant("app.css", css)], 1),
    /4 finding\(s\); 2 file\(s\) read/,
  );
});
test("CSS: a package specifier in @import is judged against the exports field", () => {
  assert.match(
    expect(["--root", plant("app.css", `@import '${PKG}/styles.css';\n`)], 1),
    /\.\/styles\.css is not a subpath/,
  );
});
test("CSS: source(...) with a double-quoted path and a path in @source with a glob are read", () => {
  assert.match(
    expect(
      [
        "--root",
        plant(
          "app.css",
          '@import "tailwindcss" source("../../src");\n@source "../../src/**/*.{svelte,ts}";\n',
        ),
      ],
      1,
    ),
    /2 finding\(s\)/,
  );
});

// ---- alias and paths
test("Vite alias: the word in a comment is not an alias, a commented-out alias neither", () => {
  const text =
    "// No alias: the site resolves the package as a consumer does.\n/* alias: { x: 'y' } */\nexport default { root: 'http://a//b' };\n";
  passes(repo({ "site/vite.config.ts": text }), 2);
});
test("Vite alias: an array form with a matching regular expression is a finding", () => {
  const text =
    "export default { resolve: { alias: [{ find: /^@hn/, replacement: 'x' }, { find: /^@\\w+\\/sveltedt$/, replacement: 'y' }] } };\n";
  assert.match(
    expect(["--root", plant("vite.config.ts", text)], 1),
    /matches @hniedner\/sveltedt/,
  );
});
test("Vite alias: a spread, a computed key, a template string or a non-literal value is a finding, never a pass", () => {
  for (const alias of [
    "{ ...others }",
    "{ [name]: 'x' }",
    "{ k: `${a}` }",
    "makeAliases()",
    "aliases",
  ]) {
    assert.match(
      expect(
        [
          "--root",
          plant(
            "vite.config.ts",
            `export default { resolve: { alias: ${alias} } };\n`,
          ),
        ],
        1,
      ),
      /cannot be read/,
      alias,
    );
  }
});
test("Vite alias: an alias for another name passes", () => {
  passes(
    plant(
      "vite.config.ts",
      "export default { resolve: { alias: { $lib: './src/lib', '~': './src' } } };\n",
    ),
    2,
  );
});
test("tsconfig paths: a wildcard that matches the name is a finding, an entry for another name passes", () => {
  const wild = (k: string): string =>
    `{\n  // comment\n  "compilerOptions": { "paths": { "${k}": ["../x"], }, }\n}\n`;
  for (const key of ["@hniedner/*", "*", `${PKG}/*`])
    assert.match(
      expect(["--root", plant("tsconfig.json", wild(key))], 1),
      /redirects/,
      key,
    );
  passes(plant("tsconfig.json", wild("$lib/*")), 2);
});
test("tsconfig paths: an entry inherited through extends is found, as TypeScript reads the file", () => {
  const root = repo({
    "site/tsconfig.base.json": `{ "compilerOptions": { "paths": { "${PKG}": ["../src/lib"] } } }\n`,
    "site/tsconfig.json": '{ "extends": "./tsconfig.base.json" }\n',
  });
  assert.match(
    expect(["--root", root], 1),
    /site\/tsconfig\.json:1 \(inherited through extends\): paths entry/,
  );
});
test("tsconfig paths: a file TypeScript cannot read is a finding", () => {
  assert.match(
    expect(["--root", plant("tsconfig.json", "{ nope\n")], 1),
    /TypeScript cannot read it/,
  );
});

// ---- what the lexer reads and what it does not
test("a comment inside an import does not hide it", () => {
  found(
    plant(
      "a.ts",
      "import { A } from /* c */ '../../src/lib/a.ts';\nexport { A };\n",
    ),
    "a.ts",
    /\.\.\/\.\.\/src\/lib\/a\.ts: reaches the repository's src\//,
  );
});
test("a string or a comment that holds import text is not an import", () => {
  const text =
    "export const s = \"import x from '../../src/lib/z.ts'\";\n// import y from '../../src/lib/y.ts'\n";
  passes(plant("a.ts", text), 2);
});
test("a component's markup that holds the words import ... from as text is not an import", () => {
  const svelte =
    "<script lang=\"ts\">\n  const n = 1;\n</script>\n\n<p>import x from '../../src/lib/x.ts' ({n})</p>\n";
  passes(plant("A.svelte", svelte), 2);
});
test("a component's module script is read too, through Svelte's parser", () => {
  const svelte =
    "<script lang=\"ts\" module>\n  import { x } from '../../src/lib/x.ts';\n  export { x };\n</script>\n";
  found(plant("A.svelte", svelte), "A.svelte", /A\.svelte:2: /);
});
test("import.meta.glob and a non-literal import() in a comment are not findings; in code they are", () => {
  passes(
    plant(
      "a.ts",
      "// import.meta.glob('../../src/**')\n/* import(name) */\nexport {};\n",
    ),
    2,
  );
  found(
    plant("a.ts", "export const m = import.meta.glob('../../src/**');\n"),
    "a.ts",
    /reaches the repository's src\//,
  );
  found(
    plant("a.ts", "const n = 'x';\nexport const m = import(n);\n"),
    "a.ts",
    /not a string literal/,
  );
});
test("limit: the regex-read forms inside a string are read as code (a finding, never a silent pass)", () => {
  found(
    plant("a.ts", "export const s = 'import(name)';\n"),
    "a.ts",
    /not a string literal/,
  );
});

// ---- could not check
test("a repository without a package.json cannot be checked", () => {
  assert.match(
    expect(["--root", repo({ "site/src/main.ts": GOOD }, false)], 3),
    /no readable root package\.json/,
  );
});
test("a package.json that is not JSON cannot be checked", () => {
  assert.match(
    expect(
      [
        "--root",
        repo({ "package.json": "{", "site/src/main.ts": GOOD }, false),
      ],
      3,
    ),
    /no readable root package\.json/,
  );
});
test("a package.json without exports, or with an empty one, cannot be checked", () => {
  const without = repo(
    { "package.json": JSON.stringify({ name: PKG }), "site/src/main.ts": GOOD },
    false,
  );
  assert.match(expect(["--root", without], 3), /no exports field/);
  assert.match(
    expect(
      [
        "--root",
        repo(
          { "package.json": exportsOf({}), "site/src/main.ts": GOOD },
          false,
        ),
      ],
      3,
    ),
    /no exports field/,
  );
});
test("a site with no file to read cannot be checked, even with a finding in site/dist", () => {
  const root = repo(
    {
      "package.json": ROOT_EXPORTS,
      "site/dist/a.js": "import a from '../../src/x';\n",
      "site/README.md": "x\n",
    },
    false,
  );
  assert.match(
    expect(["--root", root], 3),
    /no tracked file read under site\//,
  );
});
test("a folder that is not a git repository cannot be checked", () => {
  const root = mkdtempSync(join(tmpdir(), "check-site-imports-"));
  made.push(root);
  writeFileSync(join(root, "package.json"), ROOT_EXPORTS);
  assert.match(expect(["--root", root], 3), /git ls-files failed/);
});
test("an unknown argument is a usage error", () => {
  assert.match(expect(["--nope"], 2), /node scripts\/check-site-imports\.ts/);
});
