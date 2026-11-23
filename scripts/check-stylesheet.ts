// check-stylesheet: THEME-01, 02, 04, 12 and 13 (spec/table.md) over the package's stylesheet.
//   node scripts/check-stylesheet.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postcss, { list } from "postcss";
import type { AtRule, ChildNode, Node, Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import { parse } from "svelte/compiler";
import { result } from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { CANNOT, FINDING, PASS, USAGE } from "./pinned.ts";
import { parseSpec } from "./trace.ts";

export interface Finding {
  id: string;
  message: string;
}
export interface Reads {
  selectors: number;
  declarations: number;
  rules: number;
  /** The distinct `--sdt-*` names the declarations read, in order of first use. */
  tokens: string[];
}
/** One row of a statement's example table: the stylesheet it plants and whether the statement must find it. */
export interface Canary {
  id: string;
  row: string;
  css: string;
  found: boolean;
}

/** The statements the canary stylesheets may name, each with whether it is a real-browser statement (THEME-13). */
export const CANARY_SPECS = new Map([
  ["THEME-10", true],
  ["THEME-12", false],
]);

export const CANARIES: Canary[] = [
  {
    id: "THEME-12",
    row: ".sdt-a .sdt-b",
    css: ".sdt-a .sdt-b { color: inherit }",
    found: true,
  },
  {
    id: "THEME-12",
    row: ".sdt-row:not(:last-child)",
    css: ".sdt-row:not(:last-child) { color: inherit }",
    found: true,
  },
  { id: "THEME-12", row: "#x", css: "#x { color: inherit }", found: true },
  {
    id: "THEME-12",
    row: ":is() with a compound argument",
    css: ":is(.sdt-a, .sdt-b .sdt-c) { color: inherit }",
    found: true,
  },
  {
    id: "THEME-12",
    row: ":has()",
    css: ".sdt-a:has(.sdt-b) { color: inherit }",
    found: true,
  },
  {
    id: "THEME-12",
    row: "a nested rule",
    css: ".sdt-a { & .sdt-b { color: inherit } }",
    found: true,
  },
  {
    id: "THEME-12",
    row: "!important",
    css: ".sdt-x { color: inherit !important }",
    found: true,
  },
  {
    id: "THEME-12",
    row: "one class",
    css: ".sdt-x { color: inherit }",
    found: false,
  },
  {
    id: "THEME-12",
    row: "a pseudo-element is left out",
    css: '.sdt-x::after { content: "" }',
    found: false,
  },
  {
    id: "THEME-12",
    row: ":where() counts 0",
    css: ".sdt-row:where(:not(:last-child)) { color: inherit }",
    found: false,
  },
  {
    id: "THEME-13",
    row: "a marker before the rule",
    css: '/* @spec("THEME-10") */ .sdt-x { color: inherit }',
    found: false,
  },
  {
    id: "THEME-13",
    row: "no marker",
    css: ".sdt-x { color: inherit }",
    found: true,
  },
  {
    id: "THEME-13",
    row: "no spec holds the id",
    css: '/* @spec("THEME-99") */ .sdt-x { color: inherit }',
    found: true,
  },
  {
    id: "THEME-13",
    row: "the statement is not a real-browser one",
    css: '/* @spec("THEME-12") */ .sdt-x { color: inherit }',
    found: true,
  },
  {
    id: "THEME-13",
    row: "a marked rule inside @media",
    css: '@media (min-width: 40rem) { /* @spec("THEME-10") */ .sdt-x { color: inherit } }',
    found: false,
  },
  {
    id: "THEME-13",
    row: "a marker before the @media does not mark the rule inside",
    css: '/* @spec("THEME-10") */ @media (min-width: 40rem) { .sdt-x { color: inherit } }',
    found: true,
  },
  {
    id: "THEME-13",
    row: "@keyframes is one rule",
    css: '/* @spec("THEME-10") */ @keyframes sdt-spin { from { opacity: 0 } to { opacity: 1 } }',
    found: false,
  },
  {
    id: "THEME-13",
    row: "a second rule after one marker",
    css: '/* @spec("THEME-10") */ .sdt-x { color: inherit } .sdt-y { color: inherit }',
    found: true,
  },
  {
    id: "THEME-13",
    row: "another comment between the marker and the rule",
    css: '/* @spec("THEME-10") */ /* note */ .sdt-x { color: inherit }',
    found: true,
  },
  {
    id: "THEME-13",
    row: "@font-face with no marker",
    css: "@font-face { font-family: sdt-x; src: local(sdt-x) }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "color: #333",
    css: ".sdt-x { color: #333 }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "a shorthand with a named colour",
    css: ".sdt-x { border: 1px solid blue }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "a gradient with one raw colour",
    css: ".sdt-x { background-image: linear-gradient(red, var(--sdt-a, Canvas)) }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "a fallback that is not a system colour",
    css: ".sdt-x { color: var(--sdt-text, #333) }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "no fallback",
    css: ".sdt-x { color: var(--sdt-text) }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "not the --sdt- prefix",
    css: ".sdt-x { color: var(--app-text, CanvasText) }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "a system colour outside forced-colors and outside a fallback",
    css: ".sdt-x { color: Canvas }",
    found: true,
  },
  {
    id: "THEME-01",
    row: "a --sdt-* property with a system-colour fallback",
    css: ".sdt-x { color: var(--sdt-text, CanvasText) }",
    found: false,
  },
  {
    id: "THEME-01",
    row: "a keyword and a zero-width border",
    css: ".sdt-x { color: currentColor; border: 0 solid red }",
    found: false,
  },
  {
    id: "THEME-01",
    row: "a system colour inside forced-colors",
    css: "@media (forced-colors: active) { .sdt-x { outline-color: Highlight } }",
    found: false,
  },
  {
    id: "THEME-01",
    row: "transparent",
    css: ".sdt-x { background: transparent }",
    found: false,
  },
  {
    id: "THEME-04",
    row: "a layer",
    css: "@layer sdt { .sdt-x { color: inherit } }",
    found: true,
  },
  {
    id: "THEME-04",
    row: "an import",
    css: '@import "./more.css";',
    found: true,
  },
  {
    id: "THEME-04",
    row: "neither",
    css: '/* @spec("THEME-10") */ .sdt-x { color: inherit }',
    found: false,
  },
];

type Spec = [number, number, number];
const ZERO: Spec = [0, 0, 0];
const ONE_CLASS: Spec = [0, 1, 0];
const plus = (a: Spec, b: Spec): Spec => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
const compare = (a: Spec, b: Spec): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const mostSpecific = (list: Spec[]): Spec =>
  list.reduce((m, s) => (compare(s, m) > 0 ? s : m), ZERO);
const LEGACY_ELEMENTS = new Set([
  ":before",
  ":after",
  ":first-line",
  ":first-letter",
]);
// Selectors Level 4: these take their most specific argument; `:where()` counts 0
const TAKE_ARGUMENT = new Set([":is", ":not", ":has", ":matches"]);

/** The specificity of one selector, pseudo-elements left out, a nested rule counted with its parent (`parent`). */
function specOf(sel: selectorParser.Selector, parent: Spec): Spec {
  let own = ZERO;
  let nested = false;
  sel.each((node) => {
    if (node.type === "id") own = plus(own, [1, 0, 0]);
    else if (node.type === "class" || node.type === "attribute")
      own = plus(own, [0, 1, 0]);
    else if (node.type === "tag") own = plus(own, [0, 0, 1]);
    else if (node.type === "nesting") {
      nested = true;
      own = plus(own, parent);
    } else if (node.type === "pseudo") {
      const name = node.value.toLowerCase();
      if (
        name.startsWith("::") ||
        LEGACY_ELEMENTS.has(name) ||
        name === ":where"
      )
        return;
      own = plus(
        own,
        TAKE_ARGUMENT.has(name)
          ? mostSpecific(node.map((arg) => specOf(arg, ZERO)))
          : [0, 1, 0],
      );
    }
  });
  return nested ? own : plus(own, parent);
}

const inKeyframes = (rule: Rule): boolean => {
  for (let p: Node | undefined = rule.parent; p; p = p.parent)
    if (p.type === "atrule" && /keyframes$/i.test((p as AtRule).name))
      return true;
  return false;
};
/** The most specific selector of a rule's list, counted with the rules it is nested in. */
function ruleSpec(
  rule: Rule,
  selectors: (spec: Spec, text: string) => void,
): Spec {
  let outer: Rule | undefined;
  for (let p: Node | undefined = rule.parent; p && !outer; p = p.parent)
    if (p.type === "rule") outer = p as Rule;
  const parent = outer ? ruleSpec(outer, () => {}) : ZERO;
  const specs: Spec[] = [];
  selectorParser((root) =>
    root.each((sel) => {
      const spec = specOf(sel, parent);
      specs.push(spec);
      selectors(spec, sel.toString().trim());
    }),
  ).processSync(rule.selector);
  return mostSpecific(specs);
}

// CSS Color 4: the named colours and the system colours (lower case); `transparent` and `currentColor` are keywords
const words = (list: string): Set<string> => new Set(list.split(" "));
const NAMED = words(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen",
);
const SYSTEM = words(
  "accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext",
);
const COLOUR_FUNCTION =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)$/i;
// Properties whose value is a colour: a custom property of a var() with no colour in its fallback is judged by this
const COLOUR_PROPERTY =
  /color$|^(?:background(?:-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|outline|fill|stroke|box-shadow|text-shadow|text-decoration|column-rule)$/i;

/** THEME-01: the colour values in a declaration's value that are not a --sdt-* property with a system-colour fallback. */
function rawColours(prop: string, value: string): string[] {
  const found: string[] = [];
  for (const part of list.comma(value))
    for (const token of list.space(part)) {
      const call = /^([\w-]+)\(([\s\S]*)\)$/.exec(token);
      if (!call) {
        if (
          /^#[0-9a-f]{3,8}$/i.test(token) ||
          NAMED.has(token.toLowerCase()) ||
          SYSTEM.has(token.toLowerCase())
        )
          found.push(token);
      } else if (call[1].toLowerCase() === "var") {
        const comma = call[2].indexOf(",");
        const fallback = comma < 0 ? "" : call[2].slice(comma + 1).trim();
        const fine =
          call[2].trim().startsWith("--sdt-") &&
          SYSTEM.has(fallback.toLowerCase());
        if (
          !fine &&
          (COLOUR_PROPERTY.test(prop) || rawColours(prop, fallback).length)
        )
          found.push(token);
      } else if (COLOUR_FUNCTION.test(call[1])) found.push(token);
      else if (call[1].toLowerCase() !== "url")
        found.push(...rawColours(prop, call[2]));
    }
  return found;
}
const inForcedColors = (node: Node): boolean => {
  for (let p = node.parent; p; p = p.parent)
    if (
      p.type === "atrule" &&
      /^\(forced-colors:\s*active\)$/i.test((p as AtRule).params.trim())
    )
      return true;
  return false;
};
// A border or outline of width 0 paints no colour
const zeroWidth = (prop: string, value: string): boolean =>
  /^(?:border|outline)/i.test(prop) &&
  list.space(value).some((t) => /^0(?:\.0+)?[a-z]*$/i.test(t));

const MARKER = /^@spec\("([^"]+)"\)$/;
/** THEME-13: the id of the marker comment directly before a node, or a word for what is wrong with it. */
function markerProblem(
  node: ChildNode,
  specs: Map<string, boolean>,
): string | undefined {
  const before = node.prev();
  const id =
    before?.type === "comment"
      ? MARKER.exec(before.text.trim())?.[1]
      : undefined;
  if (!id) return "no marker comment directly before it";
  if (!specs.has(id)) return `no spec holds ${id}`;
  return specs.get(id) ? undefined : `${id} is not a real-browser statement`;
}
const isMarked = (node: ChildNode): boolean =>
  (node.type === "rule" && !inKeyframes(node)) ||
  (node.type === "atrule" &&
    /^(?:-\w+-)?keyframes$|^font-face$|^property$/i.test(node.name));

export function analyse(
  css: string,
  specs: Map<string, boolean>,
): { reads: Reads; findings: Finding[] } {
  const reads: Reads = { selectors: 0, declarations: 0, rules: 0, tokens: [] };
  const findings: Finding[] = [];
  postcss.parse(css).walk((node) => {
    if (isMarked(node)) {
      reads.rules++;
      const problem = markerProblem(node, specs);
      if (problem)
        findings.push({
          id: "THEME-13",
          message: `${node.type === "rule" ? node.selector : `@${(node as AtRule).name}`}: ${problem}`,
        });
    }
    if (node.type === "atrule" && /^(?:layer|import)$/i.test(node.name))
      findings.push({
        id: "THEME-04",
        message: `the stylesheet holds an @${node.name} rule`,
      });
    if (node.type === "rule" && !inKeyframes(node)) {
      ruleSpec(node, (spec, text) => {
        reads.selectors++;
        if (compare(spec, ONE_CLASS) > 0)
          findings.push({
            id: "THEME-12",
            message: `${text} has the specificity (${spec.join(",")}), above (0,1,0)`,
          });
      });
    } else if (node.type === "decl") {
      reads.declarations++;
      for (const [, name] of node.value.matchAll(/var\(\s*(--sdt-[\w-]+)/g))
        if (!reads.tokens.includes(name)) reads.tokens.push(name);
      if (node.important)
        findings.push({
          id: "THEME-12",
          message: `${node.prop} is declared !important`,
        });
      if (!inForcedColors(node) && !zeroWidth(node.prop, node.value))
        for (const colour of rawColours(node.prop, node.value))
          findings.push({
            id: "THEME-01",
            message: `${node.prop}: ${colour} is not a --sdt-* property with a system-colour fallback`,
          });
    }
  });
  return { reads, findings };
}

/** One row of THEME-04's source table: the tracked files it plants (path to text) and whether it must be found. */
export interface LayoutCanary {
  row: string;
  files: Record<string, string>;
  found: boolean;
}
const SHEET = '/* @spec("THEME-10") */ .sdt-x { color: inherit }';
const COMPONENT = '<div class="sdt"></div>';
export const LAYOUT_CANARIES: LayoutCanary[] = [
  {
    row: "the real source: one .css file, no <style> block",
    files: { "src/lib/styles.css": SHEET, "src/lib/A.svelte": COMPONENT },
    found: false,
  },
  {
    row: "a second .css file",
    files: { "src/lib/styles.css": SHEET, "src/lib/more.css": SHEET },
    found: true,
  },
  {
    row: "no .css file",
    files: { "src/lib/A.svelte": COMPONENT },
    found: true,
  },
  {
    row: "a <style> block at the top level of a .svelte file",
    files: {
      "src/lib/styles.css": SHEET,
      "src/lib/A.svelte": `${COMPONENT}<style>.x { color: inherit }</style>`,
    },
    found: true,
  },
];

/** THEME-04, the part that reads files: exactly one stylesheet under src/lib and no <style> block in a component. */
export function layout(files: Record<string, string>): Finding[] {
  const found = (message: string): Finding => ({ id: "THEME-04", message });
  const paths = Object.keys(files);
  const sheets = paths.filter((f) => /^src\/lib\/.+\.css$/.test(f));
  return [
    ...(sheets.length === 1
      ? []
      : [
          found(
            sheets.length
              ? `${sheets.length} stylesheets: ${sheets.join(", ")}`
              : "no stylesheet under src/lib",
          ),
        ]),
    ...paths
      .filter((f) => /^src\/lib\/.+\.svelte$/.test(f) && parse(files[f]).css)
      .map((f) => found(`${f} holds a <style> block`)),
  ];
}

const GUIDE_TABLE = (rows: string): string =>
  `# Styling\n\n## Tokens\n\n| Token | Paints | Fallback |\n|---|---|---|\n${rows}\n\n## Token pairs\n\nText.\n`;
/** One row of THEME-02's table: the names the stylesheet reads, the guide's text, and the verdict it must give. */
export interface TokenCanary {
  row: string;
  read: string[];
  guide: string;
  /** A finding's message part, "pass", or "cannot" for could-not-check. */
  expect: string;
}
export const TOKEN_CANARIES: TokenCanary[] = [
  {
    row: "the table lists exactly the names read",
    read: ["--sdt-border"],
    guide: GUIDE_TABLE("| `--sdt-border` | the divider | `GrayText` |"),
    expect: "pass",
  },
  {
    row: "a name read with no table row",
    read: ["--sdt-border"],
    guide: GUIDE_TABLE(""),
    expect: "--sdt-border is read by the stylesheet and not in the token table",
  },
  {
    row: "a table row no declaration reads",
    read: ["--sdt-border"],
    guide: GUIDE_TABLE(
      "| `--sdt-border` | x | `GrayText` |\n| `--sdt-unused` | x | `Canvas` |",
    ),
    expect: "--sdt-unused is in the token table and no declaration reads it",
  },
  {
    row: "no token table",
    read: ["--sdt-border"],
    guide: "# Styling\n\nNo table.\n",
    expect: "cannot",
  },
  {
    row: "a table without the Fallback column",
    read: ["--sdt-border"],
    guide:
      "## Tokens\n\n| Token | Paints |\n|---|---|\n| `--sdt-border` | x |\n",
    expect: "cannot",
  },
  {
    row: "0 names read from the stylesheet",
    read: [],
    guide: GUIDE_TABLE("| `--sdt-border` | x | `GrayText` |"),
    expect: "cannot",
  },
];

/** THEME-02: the findings of the token table against the names read, or a string saying why it cannot be checked. */
export function tokens(read: string[], guide: string): Finding[] | string {
  const lines = guide.split("\n");
  const start = lines.findIndex((l) => /^## Tokens\s*$/.test(l));
  const table = lines
    .slice(start + 1)
    .filter(
      (l, i, rest) =>
        !rest.slice(0, i).some((x) => x.startsWith("#")) && l.startsWith("|"),
    )
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  if (start < 0 || !table.length)
    return "no token table under the heading ## Tokens";
  if (table[0].join() !== "Token,Paints,Fallback")
    return `the token table's columns are ${table[0].join(", ")}, not Token, Paints, Fallback`;
  if (!read.length) return "0 --sdt-* names read from the stylesheet";
  const listed = table.slice(2).map((r) => r[0].replace(/`/g, ""));
  const finding = (message: string): Finding => ({ id: "THEME-02", message });
  return [
    ...read
      .filter((n) => !listed.includes(n))
      .map((n) =>
        finding(`${n} is read by the stylesheet and not in the token table`),
      ),
    ...listed
      .filter((n) => !read.includes(n))
      .map((n) =>
        finding(`${n} is in the token table and no declaration reads it`),
      ),
  ];
}

// ---- the step: the canary tables first, then the tracked files of the repository at `root`

/** Every statement id of the spec files, with whether its Layer line says real browser. */
function specIds(texts: string[]): Map<string, boolean> {
  const ids = new Map<string, boolean>();
  for (const text of texts) {
    const lines = text.split("\n");
    const { statements } = parseSpec("", text);
    statements.forEach((st, i) => {
      const end = statements[i + 1]?.line ?? lines.length + 1;
      ids.set(
        st.id,
        lines
          .slice(st.line - 1, end - 1)
          .some((l) => /^- Layer: real browser/.test(l)),
      );
    });
  }
  return ids;
}

/** The canary rows that did not give their stated result, as text. */
function missedCanaries(): string[] {
  const hit = (id: string, css: string): boolean =>
    analyse(css, CANARY_SPECS).findings.some((f) => f.id === id);
  return [
    ...CANARIES.filter((c) => hit(c.id, c.css) !== c.found).map(
      (c) => `${c.id}: ${c.row}`,
    ),
    ...LAYOUT_CANARIES.filter(
      (c) => layout(c.files).length > 0 !== c.found,
    ).map((c) => `THEME-04: ${c.row}`),
    ...TOKEN_CANARIES.filter((c) => {
      const got = tokens(c.read, c.guide);
      return c.expect === "cannot"
        ? typeof got !== "string"
        : typeof got === "string" ||
            (c.expect === "pass"
              ? got.length > 0
              : !got.some((f) => f.message === c.expect));
    }).map((c) => `THEME-02: ${c.row}`),
  ];
}

export function check(root: string): Result {
  const missed = missedCanaries();
  if (missed.length)
    return result(
      CANNOT,
      "a canary row did not give its stated result",
      missed,
    );
  const ls = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
  });
  if (ls.status !== 0) return result(CANNOT, `${root}: git ls-files failed`);
  const tracked = ls.stdout.split("\0").filter(Boolean);
  const text = (f: string): string => readFileSync(join(root, f), "utf8");
  const files = Object.fromEntries(
    tracked
      .filter((f) => /^src\/lib\/.+\.(?:css|svelte)$/.test(f))
      .map((f) => [f, text(f)]),
  );
  const specFiles = tracked.filter((f) => /^spec\/.+\.md$/.test(f));
  if (!specFiles.length)
    return result(CANNOT, "no spec file is tracked under spec/");
  const guide = tracked.includes("docs/styling.md")
    ? text("docs/styling.md")
    : undefined;
  if (guide === undefined)
    return result(CANNOT, "docs/styling.md is not tracked");
  const specs = specIds(specFiles.map(text));
  const reads: Reads = { selectors: 0, declarations: 0, rules: 0, tokens: [] };
  const findings = layout(files);
  for (const [f, css] of Object.entries(files).filter(([f]) =>
    f.endsWith(".css"),
  )) {
    const one = analyse(css, specs);
    reads.selectors += one.reads.selectors;
    reads.declarations += one.reads.declarations;
    reads.rules += one.reads.rules;
    reads.tokens.push(
      ...one.reads.tokens.filter((t) => !reads.tokens.includes(t)),
    );
    findings.push(
      ...one.findings.map((x) => ({ ...x, message: `${f}: ${x.message}` })),
    );
  }
  const table = tokens(reads.tokens, guide);
  if (typeof table !== "string") findings.push(...table);
  const details = findings.map((x) => `${x.id} ${x.message}`);
  if (findings.length)
    return result(FINDING, `${findings.length} finding(s)`, details);
  const empty = [
    ["declaration", reads.declarations],
    ["selector", reads.selectors],
    ["rule", reads.rules],
  ].filter(([, n]) => n === 0);
  if (empty.length)
    return result(CANNOT, `0 ${empty[0][0]}(s) read from the stylesheet`);
  if (typeof table === "string") return result(CANNOT, table);
  return result(
    PASS,
    `${reads.declarations} declaration(s), ${reads.selectors} selector(s), ${reads.rules} rule(s), ${reads.tokens.length} token name(s) read; canaries found`,
  );
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
      "USAGE check-stylesheet: node scripts/check-stylesheet.ts [--root <dir>]",
    );
    return USAGE;
  }
  const r = check(
    at >= 0
      ? argv[at + 1]
      : join(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  for (const d of r.details) console.log(`  ${d}`);
  console.log(`${WORD[r.code]} check-stylesheet: ${r.summary}`);
  return r.code;
}

// Run as a program, not when a test imports the checks
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.log(
      `USAGE check-stylesheet: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
    );
    process.exitCode = USAGE;
  }
}
