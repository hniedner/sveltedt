// check-theme-classes: THEME-01 over the component source. Every colour class must be a complete literal that reads
// a `--sdt-*` custom property with a CSS system-colour fallback, e.g. `bg-[var(--sdt-surface,Canvas)]`.
//   node scripts/check-theme-classes.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
// It reads the source as Tailwind does, as plain text split into candidate tokens, so a class built in a `.ts` file
// or a template string is read too. A value it does not know as a size, width or style keyword counts as a colour:
// an unknown class is a finding, never a silent pass. Only tracked files under src/lib are read (tests excluded).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANNOT, FINDING, PASS, USAGE } from "./pinned.ts";

const WORD: Record<number, string> = {
  [PASS]: "PASS",
  [FINDING]: "FINDING",
  [USAGE]: "USAGE",
  [CANNOT]: "COULD NOT CHECK",
};
// Longer prefixes first, so `text-shadow-` is not read as `text-` with the value `shadow-...`
const PREFIXES = [
  "inset-shadow-",
  "inset-ring-",
  "drop-shadow-",
  "text-shadow-",
  "decoration-",
  "outline-",
  "border-",
  "divide-",
  "accent-",
  "stroke-",
  "shadow-",
  "caret-",
  "text-",
  "ring-",
  "fill-",
  "from-",
  "via-",
  "bg-",
  "to-",
];
const SYSTEM =
  "AccentColor|AccentColorText|ActiveText|ButtonBorder|ButtonFace|ButtonText|Canvas|CanvasText|Field|FieldText|GrayText|Highlight|HighlightText|LinkText|Mark|MarkText|SelectedItem|SelectedItemText|VisitedText";
const TOKEN = new RegExp(
  `^\\[(?:color:)?var\\(--sdt-[a-z0-9-]+,_?(?:${SYSTEM})\\)\\]$`,
  "i",
);
const NO_COLOUR = new Set(["transparent", "current", "inherit"]);
const NOT_COLOUR =
  /^(?:\d[\w.%]*|px|none|hidden|solid|dashed|dotted|double|inset|collapse|separate|left|center|right|justify|start|end|top|bottom|wrap|nowrap|balance|pretty|ellipsis|clip|auto|2xs|xs|sm|md|lg|\d?xl|fixed|local|scroll|cover|contain|repeat|no-repeat|wavy|from-font|reverse|(?:spacing|offset|opacity|repeat|linear|radial|conic|clip|origin|blend|size|position)-.+|\[(?:length|number|percentage|url|image|position|size):.+\]|\[-?[\d.]+[a-z%]*\])(?:\/\S+)?$/;
// THEME-01's example table: the canary rows, planted in a temporary file on every run
const CANARIES: [string, boolean][] = [
  ["bg-blue-500", false],
  ["bg-[${tone}]", false],
  ["bg-[var(--sdt-surface,#fff)]", false],
  ["bg-[var(--sdt-surface)]", false],
  ["bg-[var(--app-surface,Canvas)]", false],
  ["bg-[var(--sdt-surface,Canvas)]", true],
];

// A class attribute of a component: `class="..."`, `class='...'` or `class={`...`}`
const CLASS_ATTR = /\bclass=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;

interface Scan {
  classes: number;
  literals: number;
  findings: string[];
}

/** The class literals read in class attributes, the colour-prefixed ones, and the findings among them. */
function scanText(name: string, text: string): Scan {
  const out: Scan = { classes: 0, literals: 0, findings: [] };
  for (const m of text.matchAll(CLASS_ATTR))
    out.classes += (m[1] ?? m[2] ?? m[3] ?? "")
      .split(/\s+/)
      .filter(Boolean).length;
  text.split("\n").forEach((line, i) => {
    for (const token of line.split(/[\s"'`]+/)) {
      const utility = token
        .replace(/^(?:\[[^\]]*\]:|[^[\]:]+:)*!?-?/, "")
        .replace(/!$/, "");
      const prefix = PREFIXES.find((p) => utility.startsWith(p));
      if (!prefix) continue;
      out.literals += 1;
      let value = utility.slice(prefix.length);
      if (prefix === "border-" || prefix === "divide-")
        value = value.replace(/^[xytrblse](?:-|$)/, "");
      if (prefix === "ring-") value = value.replace(/^offset-(?=\D)/, "");
      const at = `${name}:${i + 1}: ${token}`;
      if (!value && utility.length > prefix.length) continue; // `border-t`: a side, no colour
      if (!value || /[${}]/.test(value))
        out.findings.push(`${at}: built at run time, not a complete literal`);
      else if (
        NO_COLOUR.has(value) ||
        NOT_COLOUR.test(value) ||
        TOKEN.test(value)
      )
        continue;
      else
        out.findings.push(
          `${at}: a colour that does not read a --sdt-* property with a system-colour fallback`,
        );
    }
  });
  return out;
}

/** Every canary row must give its stated result, read from a file as the source is. */
function canariesFound(): boolean {
  const dir = mkdtempSync(join(tmpdir(), "theme-canary-"));
  try {
    return CANARIES.every(([cls, passes], i) => {
      const file = join(dir, `Canary${i}.svelte`);
      writeFileSync(file, `<div class={\`${cls}\`}></div>\n`);
      const s = scanText(file, readFileSync(file, "utf8"));
      return s.literals === 1 && (s.findings.length === 0) === passes;
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function check(root: string): {
  code: number;
  summary: string;
  details: string[];
} {
  if (!canariesFound())
    return {
      code: CANNOT,
      summary: "a THEME-01 canary row did not give its stated result",
      details: [],
    };
  const r = spawnSync("git", ["-C", root, "ls-files", "-z", "src/lib"], {
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
    .filter((f) => /\.(?:svelte|ts|js)$/.test(f) && !/\.test\.[jt]s$/.test(f));
  if (!files.length)
    return {
      code: CANNOT,
      summary: "no tracked source file under src/lib",
      details: [],
    };
  const all = files.map((f) =>
    scanText(f, readFileSync(join(root, f), "utf8")),
  );
  const classes = all.reduce((n, s) => n + s.classes, 0);
  const literals = all.reduce((n, s) => n + s.literals, 0);
  const details = all.flatMap((s) => s.findings);
  const read = `${classes} class literal(s) read, ${literals} colour literal(s) checked in ${files.length} file(s)`;
  // Either count at 0 means the scan saw nothing it could judge (THEME-01: "more than 0")
  if (!classes || !literals)
    return { code: CANNOT, summary: `${read}: nothing to check`, details };
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
      "USAGE check-theme-classes: node scripts/check-theme-classes.ts [--root <dir>]",
    );
    return USAGE;
  }
  const r = check(
    at >= 0
      ? argv[at + 1]
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} check-theme-classes: ${r.summary}`);
  return r.code;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.log(
    `USAGE check-theme-classes: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
  );
  process.exitCode = USAGE;
}
