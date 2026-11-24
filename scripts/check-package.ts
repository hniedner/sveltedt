// check-package: the statements of spec/package.md part 1 (PKG) over the tarball `pnpm pack` makes of the built package.
//   node scripts/check-package.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// Every check reads the packed manifest and files, never the repository's package.json: pnpm replaces `exports` from
// `publishConfig` only when it packs.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  childEnv,
  COLOUR,
  missedRows,
  result,
  scriptMain,
} from "./gate-step.ts";
import type { Row } from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { binaryOf, CANNOT, FINDING, PASS } from "./pinned.ts";

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
export type Canary = Row<Contents>;

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
const RELATIVE_TS = /\b(?:from|import)\s*\(?\s*["'`](\.\.?\/[^"'`]*\.ts)["'`]/g;

/** PKG-07: no run file imports a relative module whose path ends in `.ts`. */
function imports(c: Contents): Finding[] {
  return runnable(c).flatMap((path) =>
    [...(c.get(path)?.toString() ?? "").matchAll(RELATIVE_TS)].map((m) => ({
      id: "PKG-07",
      message: `${path} imports ${m[1]}`,
    })),
  );
}

/**
 * `exports[subpath]` has exactly the conditions `want`, each naming a file the tarball holds (PKG-05, PKG-06): its
 * problems, in that order.
 */
function conditions(
  c: Contents,
  subpath: string,
  want: [string, string],
): string[] {
  const e = manifest(c)?.exports;
  const s = isObject(e) ? e[subpath] : undefined;
  if (!isObject(s)) return [`exports["${subpath}"] is not a set of conditions`];
  const files = want.flatMap((cond) =>
    typeof s[cond] === "string" ? [s[cond].replace(/^\.\//, "")] : [],
  );
  return [
    ...want
      .filter((cond) => typeof s[cond] !== "string")
      .map((cond) => `no ${cond} condition`),
    ...Object.keys(s)
      .filter((k) => !want.includes(k))
      .map((k) => `the condition ${k} is neither ${want[0]} nor ${want[1]}`),
    ...[...new Set(files)]
      .filter((file) => !c.has(file))
      .map((file) => `${file} is not in the tarball`),
  ];
}

/** PKG-05: `./styles.css` has exactly `style` and `default`, naming the same file, which the tarball holds. */
function styles(c: Contents): Finding[] {
  const e = manifest(c)?.exports;
  const s = isObject(e) ? e["./styles.css"] : undefined;
  const differ =
    isObject(s) && s.style && s.default && s.style !== s.default
      ? ["style and default name different files"]
      : [];
  return [
    ...conditions(c, "./styles.css", ["style", "default"]),
    ...differ,
  ].map((message) => ({ id: "PKG-05", message }));
}

/** PKG-06: `./connection` has exactly `types` and `svelte`, each a file the tarball holds. */
const connection = (c: Contents): Finding[] =>
  conditions(c, "./connection", ["types", "svelte"]).map((message) => ({
    id: "PKG-06",
    message,
  }));

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
    ...connection(c),
    ...imports(c),
  ];
}

/** The packed manifest with `exports[subpath]` replaced, or removed when `value` is undefined. */
const withExport = (c: Contents, subpath: string, value: unknown): Contents => {
  const m = manifest(c) ?? {};
  const e: Record<string, unknown> = {
    ...(m.exports as object),
    [subpath]: value,
  };
  if (value === undefined) delete e[subpath];
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
    plant: (c) => withExport(c, "./styles.css", value),
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
    plant: (c) => withExport(c, ".", value),
    found,
  })),
  ...(
    [
      [{ svelte: "./dist/connection/index.js" }, "no types"],
      [
        {
          types: "./dist/connection/index.d.ts",
          default: "./dist/connection/index.js",
        },
        "default in place of svelte",
      ],
      [undefined, "absent"],
      [
        {
          types: "./dist/connection/x.d.ts",
          svelte: "./dist/connection/x.js",
        },
        "both conditions naming files the tarball does not hold",
      ],
    ] as [unknown, string][]
  ).map(([value, row]): Canary => ({
    id: "PKG-06",
    row,
    plant: (c) => withExport(c, "./connection", value),
    found: true,
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

export const missedCanaries = (
  base: Contents,
  repo: Repo,
  rows: Canary[] = CANARIES,
): string[] => missedRows(base, rows, (c) => analyse(c, repo));

export const run = (cmd: string, args: string[], cwd: string) =>
  spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: childEnv(),
    timeout: 300_000, // not forever
  });

/** Build with svelte-package, pack with pnpm, unpack: the tarball's contents, or the reason none could be read. */
export function packed(
  root: string,
  dir: string,
): { contents: Contents; tgz: string } | string {
  // A private copy of what the package is built from: runs at once (selftest runs the test files in parallel) share
  // no dist/, and nothing is written into the repository
  const pkg = join(dir, "pkg");
  for (const f of [
    "package.json",
    "LICENSE",
    "NOTICE",
    "README.md",
    "svelte.config.js",
    "tsconfig.json",
    "src/lib",
  ])
    if (existsSync(join(root, f)))
      cpSync(join(root, f), join(pkg, f), { recursive: true });
  if (existsSync(join(root, "node_modules")))
    symlinkSync(join(root, "node_modules"), join(pkg, "node_modules"));
  const build = run(
    join(root, "node_modules", ".bin", "svelte-package"),
    ["-i", "src/lib", "-o", "dist"],
    pkg,
  );
  if (build.status !== 0)
    return `svelte-package exited ${build.status ?? "without a status"}`;
  const pack = run(binaryOf("pnpm"), ["pack", "--pack-destination", dir], pkg);
  const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (pack.status !== 0 || !tgz) return "pnpm pack made no tarball";
  const out = join(dir, "unpacked");
  mkdirSync(out);
  if (run("tar", ["-xzf", join(dir, tgz), "-C", out], dir).status !== 0)
    return "the tarball could not be unpacked";
  const files: Contents = new Map();
  for (const f of readdirSync(join(out, "package"), {
    recursive: true,
    encoding: "utf8",
  }))
    if (!statSync(join(out, "package", f)).isDirectory())
      files.set(f, readFileSync(join(out, "package", f)));
  return { contents: files, tgz: join(dir, tgz) };
}

/** A tarball of `c` laid out as npm packs it (everything under package/), for the tools to read. */
export function planted(c: Contents, dir: string, name: string): string {
  const base = join(dir, name);
  for (const [path, bytes] of c) {
    mkdirSync(dirname(join(base, "package", path)), { recursive: true });
    writeFileSync(join(base, "package", path), bytes);
  }
  const tgz = `${base}.tgz`;
  const r = spawnSync("tar", ["-czf", tgz, "-C", base, "package"], {
    env: { ...childEnv(), COPYFILE_DISABLE: "1" }, // macOS tar would add ._ files that publint reads as a package
  });
  if (r.status !== 0) throw new Error(`tar could not write ${tgz}`);
  return tgz;
}

const LEVEL = /^(Errors|Warnings|Suggestions):$/;
/** publint's errors and warnings on a tarball as "Level: line"; undefined when it did not report on a package. */
export function publintProblems(
  root: string,
  tgz: string,
): string[] | undefined {
  const r = run(
    join(root, "node_modules", ".bin", "publint"),
    ["run", tgz],
    root,
  );
  const lines = r.stdout
    .replace(COLOUR, "")
    .split("\n")
    .map((l) => l.trim());
  if (!lines.includes("All good!") && !lines.some((l) => LEVEL.test(l)))
    return undefined;
  let level = "";
  const problems: string[] = [];
  for (const l of lines) {
    const header = LEVEL.exec(l);
    if (header) level = header[1];
    else if (/^\d+\. /.test(l) && level !== "Suggestions")
      problems.push(`${level}: ${l}`);
  }
  return problems;
}

/**
 * "Are the types wrong?" on a tarball: its problem lines, [] when it reports none, undefined when it printed no
 * resolution table. The profile and the two exclusions each have their reason:
 * - esm-only: the package is ESM only, so a CommonJS consumer's resolution is not a defect;
 * - ./styles.css is excluded: a CSS file is not a module, attw cannot resolve it;
 * - internal-resolution-error is ignored: under node16 the `./X.svelte` re-exports of svelte-package's output do not
 *   resolve, while Svelte consumers resolve with `bundler` (green); CON-04 proves the types for a real consumer.
 */
export function attwProblems(root: string, tgz: string): string[] | undefined {
  const r = run(
    join(root, "node_modules", ".bin", "attw"),
    [
      tgz,
      "--profile",
      "esm-only",
      "--exclude-entrypoints",
      "./styles.css",
      "--ignore-rules",
      "internal-resolution-error",
    ],
    root,
  );
  const lines = r.stdout
    .replace(COLOUR, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^[┌├└│]/.test(l));
  if (!r.stdout.includes("bundler") || ![0, 1].includes(r.status ?? -1))
    return undefined;
  return r.status === 0 ? [] : lines;
}

/** The manifest of `c` changed by `change`, as the contents of a new tarball. */
function changed(
  c: Contents,
  change: (m: { exports: Record<string, Record<string, unknown>> }) => void,
): Contents {
  const m = manifest(c) as { exports: Record<string, Record<string, unknown>> };
  change(m);
  return put(c, "package.json", JSON.stringify(m));
}

/** The tool rows: a planted tarball each, which the tool must report (PKG-02 rows and the attw canary). */
function toolRows(root: string, c: Contents, dir: string): string[] {
  const rows: [
    string,
    (tgz: string) => string[] | undefined,
    Contents,
    RegExp,
  ][] = [
    [
      "publint: the svelte condition at ./dist/missing.js",
      (t) => publintProblems(root, t),
      changed(c, (m) => (m.exports["."].svelte = "./dist/missing.js")),
      /^Errors: .*missing\.js/,
    ],
    [
      "publint: a repository value that is a warning",
      (t) => publintProblems(root, t),
      changed(c, (m) => Object.assign(m, { repository: "not a url" })),
      /^Warnings: .*pkg\.repository/,
    ],
    [
      "attw: the types condition at a file the tarball does not hold",
      (t) => attwProblems(root, t),
      changed(c, (m) => (m.exports["."].types = "./dist/missing.d.ts")),
      /./,
    ],
  ];
  return rows.flatMap(([row, tool, planted_, want], i) =>
    tool(planted(planted_, dir, `row${i}`))?.some((l) => want.test(l))
      ? []
      : [`${row}: not found`],
  );
}

/** The verdict on one tarball's contents: the statements, then the canaries that show they can fail. */
export function verdict(
  contents: Contents,
  repo: Repo,
  rows: Canary[] = CANARIES,
): Result {
  if (!manifest(contents))
    return result(CANNOT, "the packed package.json cannot be read");
  if (!runnable(contents).length)
    return result(CANNOT, "no .svelte or .js file in the tarball to read");
  // The findings first: a defect the real contents already carry is also in the canaries' base, so a planting adds
  // nothing and the canary rows would miss and hide it behind could not check. A finding blocks as well.
  const findings = analyse(contents, repo);
  if (findings.length)
    return result(
      FINDING,
      `${findings.length} finding(s)`,
      findings.map((f) => `${f.id} ${f.message}`),
    );
  const missed = missedCanaries(contents, repo, rows);
  if (missed.length)
    return result(
      CANNOT,
      "a canary row did not give its stated result",
      missed,
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
    const made = packed(root, dir);
    if (typeof made === "string") return result(CANNOT, made);
    const v = verdict(made.contents, repo);
    if (v.code !== PASS) return v;
    const missed = toolRows(root, made.contents, dir);
    if (missed.length)
      return result(
        CANNOT,
        "a canary row did not give its stated result",
        missed,
      );
    const tools = [
      ["publint", publintProblems(root, made.tgz)],
      ["attw", attwProblems(root, made.tgz)],
    ] as const;
    const silent = tools.find(([, got]) => got === undefined);
    if (silent) return result(CANNOT, `${silent[0]} reported on no package`);
    const found = tools.flatMap(([name, got]) =>
      (got ?? []).map((l) => `${name} ${l}`),
    );
    return found.length
      ? result(FINDING, `${found.length} finding(s)`, found)
      : result(PASS, `${v.summary}; publint and attw report nothing`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await scriptMain("check-package", import.meta.url, check);
