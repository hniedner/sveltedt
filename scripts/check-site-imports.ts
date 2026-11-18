// check-site-imports: IMP-01 over the test site. The site may import SvelteDT only through the package's public
// exports, and nothing may redirect that name.
//   node scripts/check-site-imports.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// It reads the site as plain text, as the statement describes. Where text cannot decide, it is stricter, never open:
//   - a dynamic `import(...)` whose argument is not a string literal, an `alias` it cannot read as a literal object
//     or array without spreads, computed keys and template strings, and a tsconfig `paths` it cannot read are findings;
//   - comments in script files are not removed, so a commented-out import is a finding too;
//   - a regular expression in an alias is run against the package name; one that does not compile is a finding.
// Not seen (INFERRED limits, see NOTES): an alias key assembled from pieces that no longer contain "hniedner", a
// tsconfig `extends` chain that leaves site/, aliases set by a plugin, `new URL(...)` paths, `<style>` blocks of
// `.svelte` files, and tracked symbolic links that are themselves source files. Only tracked files are read.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANNOT, FINDING, PASS, USAGE } from "./pinned.ts";

const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
};
const PKG = "@hniedner/sveltedt";
const SCRIPT = /\.(?:[mc]?[jt]s|svelte)$/;
const CSS = /\.css$/;
const TSCONFIG = /^[tj]sconfig[^/]*\.json$/;

interface Ctx {
  root: string;
  exportKeys: string[];
  /** The deepest folder holding every `exports` target, relative to the package root (`src/lib` today). */
  exportsFolder: string;
}

const isPkg = (s: string): boolean => s === PKG || s.startsWith(`${PKG}/`);
/** True when an `exports` key (exact, or with one `*`) names the subpath. */
function exported(keys: string[], sub: string): boolean {
  return keys.some((k) => {
    const star = k.indexOf("*");
    if (star < 0) return k === sub;
    return (
      sub.length >= k.length - 1 &&
      sub.startsWith(k.slice(0, star)) &&
      sub.endsWith(k.slice(star + 1))
    );
  });
}

/** The judgement on one specifier written in `file` (a path relative to the repository root), or "" when it is fine. */
function judge(
  ctx: Ctx,
  file: string,
  spec: string,
  relativeOnly: boolean,
): string {
  const path = spec.replace(/[?#].*$/, "");
  const isRel =
    /^\.\.?(?:\/|$)/.test(path) ||
    (relativeOnly && !isPkg(path) && !path.startsWith("/"));
  if (isRel) {
    // Lexical, as written: no link is followed, so nothing here touches the disk
    const target = relative(ctx.root, resolve(ctx.root, dirname(file), path))
      .split("\\")
      .join("/");
    if (target === "" || target === ".." || target.startsWith("../"))
      return "reaches the repository root or a folder above it";
    if (target === "src" || target.startsWith("src/"))
      return "reaches the repository's src/";
    if (target === "dist" || target.startsWith("dist/"))
      return "reaches the package's build output (dist/)";
    return "";
  }
  if (!isPkg(spec)) return "";
  const sub = `.${spec.slice(PKG.length)}`;
  return exported(ctx.exportKeys, sub)
    ? ""
    : `${sub} is not a subpath the root exports field names`;
}

// ---- script files (.ts .mts .cts .js .mjs .cjs .svelte)
const STR = String.raw`(?:'([^'\n]*)'|"([^"\n]*)"|\x60([^\x60$\n]*)\x60)`;
const FROM = new RegExp(
  String.raw`\b(?:import|export)\b[^'"\x60;]*?\bfrom\s*${STR}`,
  "g",
);
const SIDE = new RegExp(String.raw`\bimport\s*${STR}`, "g");
const CALL = new RegExp(String.raw`\b(?:import|require)\s*\(\s*${STR}`, "g");
const OPEN = /\b(?:import|require)\s*\(/g;
const LITERAL_ARG = new RegExp(String.raw`^\s*${STR}`);
const GLOB =
  /\bimport\.meta\.glob(?:Eager)?\s*\(\s*(\[[^\]]*\]|'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)/g;
const lit = (m: RegExpMatchArray): string => m[1] ?? m[2] ?? m[3] ?? "";

/** The index of the bracket closing the one at `open`, strings skipped, or -1. */
function closing(text: string, open: number): number {
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++)
        if (text[i] === "\\") i++;
    } else if (pairs[c]) stack.push(pairs[c]);
    else if (c === "}" || c === "]") {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** The findings about `alias` in a Vite configuration (or any script): the name must not be redirected. */
/** The script with its comments blanked; quoted strings and template literals are kept as written. */
const withoutComments = (text: string): string =>
  text.replace(
    /(['"`])(?:\\.|(?!\1)[^\\])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (c) => (c.startsWith("/") ? c.replace(/[^\n]/g, " ") : c),
  );

function aliasFindings(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\balias\b/g)) {
    const after = text.slice(m.index + 5);
    const colon = /^["'`]?\s*:\s*/.exec(after);
    const open = colon ? m.index + 5 + colon[0].length : -1;
    const end =
      open >= 0 && "{[".includes(text[open] ?? "") ? closing(text, open) : -1;
    if (end < 0) {
      out.push(
        "alias is not written as a literal object or array, so it cannot be read",
      );
      continue;
    }
    const block = text.slice(open, end + 1);
    if (/hniedner/i.test(block)) out.push(`alias names ${PKG}`);
    if (/\.\.\.|\$\{|[{,]\s*\[/.test(block))
      out.push(
        "alias holds a spread, a template string or a computed key, so it cannot be read",
      );
    for (const f of block.matchAll(
      /\bfind\s*:\s*\/((?:\\.|[^/\\\n])+)\/([a-z]*)/g,
    )) {
      try {
        if (new RegExp(f[1], f[2]).test(PKG))
          out.push(`alias regular expression /${f[1]}/ matches ${PKG}`);
      } catch {
        out.push(`alias regular expression /${f[1]}/ does not compile`);
      }
    }
  }
  return out;
}

function scanScript(ctx: Ctx, file: string, text: string): string[] {
  const out: string[] = [];
  const at = (idx: number): string =>
    `${file}:${text.slice(0, idx).split("\n").length}`;
  const add = (idx: number, spec: string, why: string): void => {
    if (why) out.push(`${at(idx)}: ${spec}: ${why}`);
  };
  for (const m of text.matchAll(FROM))
    add(m.index, lit(m), judge(ctx, file, lit(m), false));
  for (const m of text.matchAll(SIDE))
    add(m.index, lit(m), judge(ctx, file, lit(m), false));
  for (const m of text.matchAll(CALL))
    add(m.index, lit(m), judge(ctx, file, lit(m), false));
  for (const m of text.matchAll(OPEN)) {
    if (!LITERAL_ARG.test(text.slice(m.index + m[0].length)))
      add(
        m.index,
        "import(...)",
        "the argument is not a string literal, so it cannot be read",
      );
  }
  for (const m of text.matchAll(GLOB)) {
    for (const s of m[1].matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g))
      add(m.index, lit(s), judge(ctx, file, lit(s), false));
  }
  if (!file.endsWith(".svelte"))
    for (const why of aliasFindings(withoutComments(text)))
      out.push(`${at(0)}: ${why}`);
  return out;
}

const ESC = /[.+?^$(){}|[\]\\]/g;
// ---- tsconfig / jsconfig: a `paths` key that matches the name or a subpath of it
function scanTsconfig(file: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"paths"/g)) {
    const open = text.indexOf("{", m.index + 7);
    const colon = /^\s*:\s*\{/.test(text.slice(m.index + 7, open + 1));
    const end = colon ? closing(text, open) : -1;
    if (end < 0) {
      out.push(
        `${file}: "paths" is not written as a literal object, so it cannot be read`,
      );
      continue;
    }
    for (const k of text
      .slice(open, end + 1)
      .matchAll(/"([^"\n]+)"\s*:\s*\[/g)) {
      const line = text.slice(0, open + k.index).split("\n").length;
      const re = new RegExp(
        `^${k[1].replace(ESC, "\\$&").replace(/\*/g, ".*")}$`,
      );
      if (re.test(PKG) || re.test(`${PKG}/probe`))
        out.push(`${file}:${line}: paths entry "${k[1]}" redirects ${PKG}`);
    }
  }
  return out;
}

// ---- CSS: the path-taking at-rules and source(...)
const AT = /@(import|source|plugin|config|reference)\b/g;
/** The text of an at-rule from `from` up to its `;` outside quotes and parentheses (or its `{`, or the end). */
function atRuleText(css: string, from: number): string {
  let depth = 0,
    i = from;
  for (; i < css.length; i++) {
    const c = css[i];
    if (c === "'" || c === '"') {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === ";" || c === "{") && depth <= 0) break;
  }
  return css.slice(from, i);
}
const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, "$2");

// A path into the installed package must name exactly the exports' deepest folder: the bare package folder is the
// repository root through the workspace link, a folder below can leave component files out, a glob is neither.
const INSTALLED = new RegExp(`(?:^|/)node_modules/${PKG}(?:/(.*))?$`);
function installedFolder(ctx: Ctx, file: string, path: string): string {
  const target = relative(ctx.root, resolve(ctx.root, dirname(file), path))
    .split("\\")
    .join("/");
  const m = INSTALLED.exec(target);
  if (!m) return "";
  const rest = m[1] ?? "";
  if (/[*?{}[\]]/.test(rest)) return "a glob into the installed package";
  if (rest === ctx.exportsFolder) return "";
  const named = rest
    ? `${rest} in the installed package`
    : "the installed package's own folder";
  return `names ${named}, not the folder its exports point at (${ctx.exportsFolder})`;
}

function scanCss(ctx: Ctx, file: string, raw: string): string[] {
  // Comments blanked (line numbers kept), but not inside a quoted string: a glob such as "src/**/*.ts" holds "/**/"
  const css = raw.replace(
    /(['"])(?:\\.|(?!\1)[^\\\n])*\1|\/\*[\s\S]*?\*\//g,
    (c) => (c.startsWith("/*") ? c.replace(/[^\n]/g, " ") : c),
  );
  const out: string[] = [];
  for (const m of css.matchAll(AT)) {
    const params = atRuleText(css, m.index + m[0].length).trim();
    const line = `${file}:${css.slice(0, m.index).split("\n").length}`;
    const paths: [string, boolean][] = []; // [path, true when it is a filesystem path whatever its spelling]
    for (const s of params.matchAll(/\bsource\(\s*([^)]*?)\s*\)/g))
      if (unquote(s[1]) !== "none") paths.push([unquote(s[1]), true]);
    const head = params.replace(/\bsource\([^)]*\)/g, "").trim();
    if (m[1] === "source") {
      if (/^not\b/.test(head) || /^inline\(/.test(head)) continue; // names no path
      const first = /^(['"])(.*?)\1/.exec(head);
      if (first) paths.push([first[2], true]);
    } else {
      const first = /^(?:url\(\s*)?(['"]?)([^'")\s]+)\1/.exec(head);
      if (first) paths.push([first[2], false]);
    }
    for (const [p, fs] of paths) {
      const why =
        (fs && installedFolder(ctx, file, p)) || judge(ctx, file, p, fs);
      if (why) out.push(`${line}: @${m[1]} ${p}: ${why}`);
    }
  }
  return out;
}

function scanFile(ctx: Ctx, file: string, text: string): string[] {
  if (CSS.test(file)) return scanCss(ctx, file, text);
  if (TSCONFIG.test(basename(file))) return scanTsconfig(file, text);
  return scanScript(ctx, file, text);
}

// ---- IMP-01's canary table (every row must be found) and its passing rows (every one must pass)
const CANARY_CTX = (root: string): Ctx => ({
  root,
  exportKeys: ["."],
  exportsFolder: "src/lib",
});
const CANARIES: [string, string, boolean][] = [
  [
    "a.ts",
    "import { DataTable } from '../../src/lib/DataTable.svelte'\n",
    false,
  ],
  ["a.ts", "export { DataTable } from '../../src/lib/index.ts'\n", false],
  ["a.ts", "await import('../../src/lib/Pagination.svelte')\n", false],
  ["a.ts", "import { DataTable } from '../../dist/index.js'\n", false],
  [
    "a.svelte",
    "<script lang=\"ts\">\n  import { DataTable } from '../../src/lib/DataTable.svelte'\n</script>\n",
    false,
  ],
  [
    "a.ts",
    `import { DataTable } from '${PKG}/src/lib/DataTable.svelte'\n`,
    false,
  ],
  [
    "vite.config.ts",
    `export default { resolve: { alias: { '${PKG}': '../src/lib' } } };\n`,
    false,
  ],
  [
    "tsconfig.json",
    `{ "compilerOptions": { "paths": { "${PKG}": ["../src/lib/index.ts"] } } }\n`,
    false,
  ],
  ["a.css", "@source '../../src';\n", false],
  ["a.css", "@source '../../';\n", false],
  ["a.css", "@import 'tailwindcss' source('../../src');\n", false],
  ["a.ts", `import { DataTable } from '${PKG}'\n`, true],
  ["a.css", `@source '../node_modules/${PKG}';\n`, false],
  ["a.css", `@source '../node_modules/${PKG}/src';\n`, false],
  ["a.css", `@source '../node_modules/${PKG}/src/lib/parts';\n`, false],
  ["a.css", `@source '../node_modules/${PKG}/src/lib/**/*.svelte';\n`, false],
  ["a.css", `@import 'tailwindcss' source('../node_modules/${PKG}');\n`, false],
  ["a.css", `@source '../node_modules/${PKG}/src/lib';\n`, true],
  ["a.css", `@source '../node_modules/${PKG}/src/lib/';\n`, true],
  ["a.css", "@source '../';\n", true],
];

/** Every canary row must give its stated result, planted in site/src of a temporary folder and read back. */
function canariesFound(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "imports-canary-"));
  try {
    mkdirSync(join(dir, "site/src"), { recursive: true });
    return CANARIES.every(([name, src, passes]) => {
      const rel = posix.join("site/src", name);
      writeFileSync(join(dir, rel), src);
      const found = scanFile(
        CANARY_CTX(dir),
        rel,
        readFileSync(join(dir, rel), "utf8"),
      );
      return (found.length === 0) === passes;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The subpaths the root package.json's `exports` names, or a reason it cannot be read. */
/** The root package.json's `exports` value, or undefined when there is no readable package.json. */
function readExports(root: string): { exports: unknown } | undefined {
  try {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { exports?: unknown };
    return { exports: pkg.exports };
  } catch {
    return undefined;
  }
}

function exportKeys(e: unknown): string[] | string {
  if (
    e === undefined ||
    e === null ||
    e === "" ||
    (typeof e === "object" && !Object.keys(e).length)
  )
    return "no exports field in the root package.json";
  if (typeof e !== "object" || Array.isArray(e)) return ["."];
  const keys = Object.keys(e);
  if (!keys.some((k) => k.startsWith("."))) return ["."]; // conditions only: the root entry
  return keys.filter(
    (k) => k.startsWith(".") && (e as Record<string, unknown>)[k] !== null,
  );
}

/** Every target the `exports` value points at, under every condition (null targets name nothing). */
function targets(e: unknown): string[] {
  if (typeof e === "string") return [e];
  if (Array.isArray(e)) return e.flatMap(targets);
  if (e && typeof e === "object") return Object.values(e).flatMap(targets);
  return [];
}

/** The deepest folder holding every exports target (a `*` pattern counts up to its star), or a reason. */
function exportsFolder(e: unknown): string {
  // The folder of each target; for a pattern, the folder of the part before its star ("./src/lib/*" -> src/lib)
  const folders = targets(e).map((t) =>
    posix
      .dirname(posix.normalize(`${t.split("*")[0]}x`))
      .split("/")
      .filter((part) => part !== "."),
  );
  if (!folders.length) return ""; // only null targets: no folder, so could not check
  const common = folders.reduce((a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });
  return common.join("/");
}

function check(root: string): {
  code: number;
  summary: string;
  details: string[];
} {
  if (!canariesFound())
    return {
      code: CANNOT,
      summary: "an IMP-01 canary row did not give its stated result",
      details: [],
    };
  const pkg = readExports(root);
  if (!pkg)
    return {
      code: CANNOT,
      summary: "no readable root package.json",
      details: [],
    };
  const keys = exportKeys(pkg.exports);
  if (typeof keys === "string")
    return { code: CANNOT, summary: keys, details: [] };
  const folder = exportsFolder(pkg.exports);
  if (!folder)
    return {
      code: CANNOT,
      summary:
        "the exports targets' deepest folder is the package's own folder",
      details: [],
    };
  const r = spawnSync("git", ["-C", root, "ls-files", "-z", "site"], {
    encoding: "utf8",
  });
  if (r.status !== 0)
    return {
      code: CANNOT,
      summary: `${root}: git ls-files failed`,
      details: [],
    };
  const files = r.stdout
    .split("\0")
    .filter(
      (f) =>
        (SCRIPT.test(f) || CSS.test(f) || TSCONFIG.test(basename(f))) &&
        !/^site\/(?:dist|node_modules)\//.test(f) &&
        !f.includes("/node_modules/"),
    );
  if (!files.length)
    return {
      code: CANNOT,
      summary: "no tracked file read under site/",
      details: [],
    };
  const ctx: Ctx = { root, exportKeys: keys, exportsFolder: folder };
  const details = files.flatMap((f) =>
    scanFile(ctx, f, readFileSync(join(root, f), "utf8")),
  );
  const read = `${files.length} file(s) read`;
  if (details.length)
    return {
      code: FINDING,
      summary: `${details.length} finding(s); ${read}, canaries found`,
      details,
    };
  return { code: PASS, summary: `${read}, canaries found`, details };
}

function main(argv: string[]): number {
  const at = argv.indexOf("--root");
  if (argv.length !== (at >= 0 ? 2 : 0) || (at >= 0 && !argv[at + 1])) {
    console.log(
      "USAGE check-site-imports: node scripts/check-site-imports.ts [--root <dir>]",
    );
    return USAGE;
  }
  const r = check(
    at >= 0
      ? argv[at + 1]
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} check-site-imports: ${r.summary}`);
  return r.code;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.log(
    `USAGE check-site-imports: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
  );
  process.exitCode = USAGE;
}
