// check-package: the statements of spec/package.md part 1 (PKG) over the tarball `pnpm pack` makes of the built package.
//   node scripts/check-package.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// Every check reads the packed manifest and files, never the repository's package.json: pnpm replaces `exports` from
// `publishConfig` only when it packs.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { childEnv, result } from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { binaryOf, CANNOT, FINDING, PASS, USAGE } from "./pinned.ts";

export interface Finding {
  id: string;
  message: string;
}
/** The tarball's files by their path inside the package ("package.json", "dist/index.js"). */
export type Contents = Map<string, Buffer>;
/** The repository's own LICENSE and NOTICE bytes, which the tarball's must equal (PKG-04). */
export interface Repo {
  license: Buffer;
  notice: Buffer;
}
/** One row of a statement's example table: a change planted in a copy of the tarball's contents, and whether the
 *  statement must find it. A `found: false` row is a change that must still pass. */
export interface Canary {
  id: string;
  row: string;
  plant: (c: Contents) => Contents;
  found: boolean;
}

const drop = (c: Contents, path: string): Contents => {
  const copy = new Map(c);
  copy.delete(path);
  return copy;
};
const put = (c: Contents, path: string, text: string): Contents =>
  new Map(c).set(path, Buffer.from(text));

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
/** The packed manifest, or undefined when it is missing or not a JSON object. */
export function manifest(c: Contents): Record<string, unknown> | undefined {
  try {
    const m: unknown = JSON.parse(c.get("package.json")?.toString() ?? "");
    return isObject(m) ? m : undefined;
  } catch {
    return undefined;
  }
}
/** The path in the tarball that `exports["./styles.css"].default` names, if it names one. */
function stylesheet(c: Contents): string | undefined {
  const e = manifest(c)?.exports;
  const s = isObject(e) && isObject(e["./styles.css"]) ? e["./styles.css"] : {};
  return typeof s.default === "string"
    ? s.default.replace(/^\.\//, "")
    : undefined;
}

const ROOT_FILES = ["package.json", "README.md", "LICENSE", "NOTICE"];

/** PKG-03: only the listed files, no test file, no second stylesheet. */
function shape(c: Contents): Finding[] {
  const css = stylesheet(c);
  const found: Finding[] = [];
  for (const path of c.keys()) {
    const inDist = path.startsWith("dist/");
    let problem: string | undefined;
    if (ROOT_FILES.includes(path) || path === css) continue;
    if (inDist && /\.(?:test|spec)\./.test(path)) problem = "a test file";
    else if (inDist && path.endsWith(".css"))
      problem = "a second stylesheet (THEME-04)";
    else if (!inDist || !/\.(?:js|svelte|d\.ts)$/.test(path))
      problem = "not listed";
    if (problem) found.push({ id: "PKG-03", message: `${path}: ${problem}` });
  }
  return found;
}

/** PKG-01: the root export has `types` and `svelte`, each a file under ./dist/. */
function root(c: Contents): Finding[] {
  const e = manifest(c)?.exports;
  const r = isObject(e) ? e["."] : undefined;
  if (!isObject(r))
    return [
      { id: "PKG-01", message: 'exports["."] is not a set of conditions' },
    ];
  return ["types", "svelte"].flatMap((cond) => {
    const path = r[cond];
    const message =
      typeof path !== "string"
        ? `no ${cond} condition`
        : path.startsWith("./dist/")
          ? ""
          : `${cond} is ${path}, not under ./dist/`;
    return message ? [{ id: "PKG-01", message }] : [];
  });
}

/** The files a consumer's build runs, which PKG-07 reads: `.svelte` and `.js`, not the declarations. */
export const runnable = (c: Contents): string[] =>
  [...c.keys()].filter((p) => /\.(?:svelte|js)$/.test(p));
const RELATIVE_TS = /\b(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']*\.ts)["']/g;

/** PKG-07: no run file imports a relative module whose path ends in `.ts`. */
function imports(c: Contents): Finding[] {
  return runnable(c).flatMap((path) =>
    [...(c.get(path)?.toString() ?? "").matchAll(RELATIVE_TS)].map((m) => ({
      id: "PKG-07",
      message: `${path} imports ${m[1]}`,
    })),
  );
}

/** PKG-05: `./styles.css` has exactly `style` and `default`, naming the same file, which the tarball holds. */
function styles(c: Contents): Finding[] {
  const e = manifest(c)?.exports;
  const s = isObject(e) ? e["./styles.css"] : undefined;
  const problems: string[] = [];
  if (!isObject(s))
    problems.push('exports["./styles.css"] is not a set of conditions');
  else {
    for (const cond of ["style", "default"])
      if (typeof s[cond] !== "string") problems.push(`no ${cond} condition`);
    for (const cond of Object.keys(s).filter(
      (k) => !["style", "default"].includes(k),
    ))
      problems.push(`the condition ${cond} is neither style nor default`);
    if (s.style !== s.default && s.style && s.default)
      problems.push("style and default name different files");
    const file = stylesheet(c);
    if (file && !c.has(file)) problems.push(`${file} is not in the tarball`);
  }
  return problems.map((message) => ({ id: "PKG-05", message }));
}

/** PKG-04: LICENSE and NOTICE are in the tarball with the repository's bytes. */
function notices(c: Contents, repo: Repo): Finding[] {
  return (
    [
      ["LICENSE", repo.license],
      ["NOTICE", repo.notice],
    ] as const
  ).flatMap(([name, bytes]) => {
    const got = c.get(name);
    const message = !got
      ? `${name} is not in the tarball`
      : got.equals(bytes)
        ? ""
        : `${name} differs from the repository's`;
    return message ? [{ id: "PKG-04", message }] : [];
  });
}

/** Every statement over one tarball's contents, in the spec's order. */
export function analyse(c: Contents, repo: Repo): Finding[] {
  return [
    ...root(c),
    ...shape(c),
    ...notices(c, repo),
    ...styles(c),
    ...imports(c),
  ];
}

/** The packed manifest with `exports["."]` replaced, or removed when `value` is undefined. */
const withRoot = (c: Contents, value: unknown): Contents => {
  const m = manifest(c) ?? {};
  const e = { ...(m.exports as object), ".": value };
  if (value === undefined) delete (e as Record<string, unknown>)["."];
  return put(c, "package.json", JSON.stringify({ ...m, exports: e }));
};

/** The packed manifest with `exports["./styles.css"]` replaced, or removed when `value` is undefined. */
const withStyles = (c: Contents, value: unknown): Contents => {
  const m = manifest(c) ?? {};
  const e: Record<string, unknown> = {
    ...(m.exports as object),
    "./styles.css": value,
  };
  if (value === undefined) delete e["./styles.css"];
  return put(c, "package.json", JSON.stringify({ ...m, exports: e }));
};

export const CANARIES: Canary[] = [
  ...(
    [
      ["dist/A.svelte", 'import { x } from "./messages.ts";', true],
      ["dist/index.js", 'import { x } from "./messages.ts";', true],
      ["dist/types.d.ts", 'import type { T } from "./types.ts";', false],
    ] as [string, string, boolean][]
  ).map(([path, line, found]): Canary => ({
    id: "PKG-07",
    row: `${line} in ${path}`,
    plant: (c) => put(c, path, `${line}\n`),
    found,
  })),
  ...(
    [
      [{ style: "./dist/styles.css" }, "no default", true],
      [{ default: "./dist/styles.css" }, "no style", true],
      [undefined, "absent", true],
      [
        { style: "./dist/x.css", default: "./dist/x.css" },
        "a file the tarball does not hold",
        true,
      ],
    ] as [unknown, string, boolean][]
  ).map(([value, row, found]): Canary => ({
    id: "PKG-05",
    row,
    plant: (c) => withStyles(c, value),
    found,
  })),
  ...(
    [
      [{ svelte: "./dist/index.js" }, "no types", true],
      [{ types: "./dist/index.d.ts" }, "no svelte", true],
      ["./dist/index.js", "a string, no conditions", true],
      [undefined, "no exports for .", true],
      [
        { types: "./src/lib/index.ts", svelte: "./src/lib/index.ts" },
        "the repository's own exports, not under ./dist/",
        true,
      ],
      [
        { types: "./dist/index.d.ts", svelte: "./dist/index.js" },
        "types and svelte under ./dist/",
        false,
      ],
    ] as [unknown, string, boolean][]
  ).map(([value, row, found]): Canary => ({
    id: "PKG-01",
    row,
    plant: (c) => withRoot(c, value),
    found,
  })),
  ...[
    ["dist/DataTable.test.js", "a test file"],
    ["dist/sort.spec.d.ts", "a test file"],
    ["src/lib/index.ts", "source outside dist/"],
    ["site/server.ts", "the site"],
    ["consumer/package.json", "the consumer project"],
    ["dist/app.css", "a second stylesheet beside dist/styles.css"],
    [".npmrc", "not listed"],
  ].map(([path, row]): Canary => ({
    id: "PKG-03",
    row: `${path}: ${row}`,
    plant: (c) => put(c, path, "x"),
    found: true,
  })),
  {
    id: "PKG-04",
    row: "without NOTICE",
    plant: (c) => drop(c, "NOTICE"),
    found: true,
  },
  {
    id: "PKG-04",
    row: "without LICENSE",
    plant: (c) => drop(c, "LICENSE"),
    found: true,
  },
  {
    id: "PKG-04",
    row: "a NOTICE that differs from the repository's",
    plant: (c) => put(c, "NOTICE", "another notice"),
    found: true,
  },
  {
    id: "PKG-03",
    row: "dist/index.js, dist/DataTable.svelte, dist/DataTable.svelte.d.ts, dist/styles.css",
    plant: (c) =>
      put(
        put(
          put(c, "dist/DataTable.svelte", "x"),
          "dist/DataTable.svelte.d.ts",
          "x",
        ),
        "dist/index.js",
        "x",
      ),
    found: false,
  },
];

/**
 * The canary rows whose stated result the statements did not give, each as a line; none is a working check. A row is
 * judged by the findings its planting adds to those the base already has, so a finding in the real tarball is a
 * finding, not a failed canary.
 */
export function missedCanaries(base: Contents, repo: Repo): string[] {
  const text = (f: Finding): string => `${f.id} ${f.message}`;
  const before = new Set(analyse(base, repo).map(text));
  const missed: string[] = [];
  for (const k of CANARIES) {
    const added = analyse(k.plant(base), repo).filter(
      (f) => f.id === k.id && !before.has(text(f)),
    );
    if (added.length > 0 !== k.found)
      missed.push(`${k.id} row "${k.row}": ${k.found ? "not found" : "found"}`);
  }
  return missed;
}

const run = (cmd: string, args: string[], cwd: string) =>
  spawnSync(cmd, args, { cwd, encoding: "utf8", env: childEnv() });

/** Build with svelte-package, pack with pnpm, unpack: the tarball's contents, or the reason none could be read. */
function packed(root: string, dir: string): Contents | string {
  const build = run(
    join(root, "node_modules", ".bin", "svelte-package"),
    ["-i", "src/lib", "-o", "dist"],
    root,
  );
  if (build.status !== 0)
    return `svelte-package exited ${build.status ?? "without a status"}`;
  const pack = run(binaryOf("pnpm"), ["pack", "--pack-destination", dir], root);
  const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (pack.status !== 0 || !tgz) return "pnpm pack made no tarball";
  const out = join(dir, "unpacked");
  mkdirSync(out);
  if (run("tar", ["-xzf", join(dir, tgz), "-C", out], dir).status !== 0)
    return "the tarball could not be unpacked";
  const files: Contents = new Map();
  for (const f of readdirSync(join(out, "package"), { recursive: true }))
    try {
      files.set(f, readFileSync(join(out, "package", f)));
    } catch {
      // a directory entry
    }
  return files;
}

/** The verdict on one tarball's contents: canaries first, then the statements. */
export function verdict(contents: Contents, repo: Repo): Result {
  if (!manifest(contents))
    return result(CANNOT, "the packed package.json cannot be read");
  if (!runnable(contents).length)
    return result(CANNOT, "no .svelte or .js file in the tarball to read");
  const missed = missedCanaries(contents, repo);
  if (missed.length)
    return result(
      CANNOT,
      "a canary row did not give its stated result",
      missed,
    );
  const findings = analyse(contents, repo);
  if (findings.length)
    return result(
      FINDING,
      `${findings.length} finding(s)`,
      findings.map((f) => `${f.id} ${f.message}`),
    );
  return result(
    PASS,
    `${contents.size} file(s) in the tarball, canaries found`,
  );
}

export function check(root: string): Result {
  const repo = {
    license: readFileSync(join(root, "LICENSE")),
    notice: readFileSync(join(root, "NOTICE")),
  };
  const dir = mkdtempSync(join(tmpdir(), "package-"));
  try {
    const contents = packed(root, dir);
    return typeof contents === "string"
      ? result(CANNOT, contents)
      : verdict(contents, repo);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
};
function main(argv: string[]): number {
  const at = argv.indexOf("--root");
  if (argv.length !== (at >= 0 ? 2 : 0) || (at >= 0 && !argv[at + 1])) {
    console.log(
      "USAGE check-package: node scripts/check-package.ts [--root <dir>]",
    );
    return USAGE;
  }
  const r = check(
    at >= 0
      ? argv[at + 1]
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} check-package: ${r.summary}`);
  return r.code;
}

// Run as a program, not when a test imports the checks
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.log(
      `USAGE check-package: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
    );
    process.exitCode = USAGE;
  }
}
