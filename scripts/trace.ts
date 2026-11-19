// The trace step (G6): which spec statements have a passing test.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { HERE } from "./gate-step.ts";

export interface Statement {
  id: string;
  file: string;
  line: number; // 1-based line of the `**ID**` line
  hash: string | null; // null when the statement lacks its Reason or Layer line
}

const STATEMENT = /^\*\*([A-Z][A-Z0-9]*-\d+)\*\*/;

/** The first 8 hex of the sha256 of `text` with every run of white space collapsed to one space (G6). */
const hashOf = (text: string): string =>
  createHash("sha256")
    .update(text.replace(/\s+/g, " ").trim(), "utf8")
    .digest("hex")
    .slice(0, 8);

/**
 * The statements of one spec file. A statement runs from its `**ID**` line to the next one (or a heading); its hash
 * covers the text before its first `- Reason:` line plus its `- Layer:` line, so a changed example or layer makes a
 * test stale and a changed reason or `Traces:` line does not (G6). A statement lacking either line is a problem.
 */
export function parseSpec(
  file: string,
  text: string,
): { statements: Statement[]; problems: string[] } {
  const lines = text.split("\n");
  const statements: Statement[] = [];
  const problems: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const id = STATEMENT.exec(lines[i])?.[1];
    if (!id) continue;
    let end = i + 1;
    while (
      end < lines.length &&
      !STATEMENT.test(lines[end]) &&
      !/^#/.test(lines[end])
    )
      end++;
    const block = lines.slice(i, end);
    const reason = block.findIndex((l) => l.startsWith("- Reason:"));
    const layer = block.findIndex(
      (l, n) => n > reason && l.startsWith("- Layer:"),
    );
    const at = `${file}:${i + 1}: ${id}`;
    if (reason < 0) problems.push(`${at}: no "- Reason:" line`);
    else if (layer < 0) problems.push(`${at}: no "- Layer:" line`);
    statements.push({
      id,
      file,
      line: i + 1,
      hash:
        reason < 0 || layer < 0
          ? null
          : hashOf(`${block.slice(0, reason).join("\n")}\n${block[layer]}`),
    });
  }
  return { statements, problems };
}

export interface Marker {
  id: string;
  hash: string;
  file: string;
  line: number; // of the marker comment
  from: number; // first and last line of the statement it names
  to: number;
  modifiers: string[]; // `.only`, `.skip`, `.todo`, `.fails` or `{ skip: true }` under the statement
}

const MARKER = /^\/\/ @spec\("([^"]+)", "([0-9a-f]{8})"\)\s*$/;
const MODIFIERS = new Set(["only", "skip", "todo", "fails"]);

/**
 * The `// @spec("ID", "hash")` markers of one test source, each attached to the statement after it in the same block
 * (TypeScript's parser finds the comments, so marker text inside a string is not read). A marker with no statement
 * after it names nothing, and a comment that mentions `@spec(` without being a marker is a mistake: both are problems.
 */
export function readMarkers(
  file: string,
  text: string,
): { markers: Marker[]; problems: string[] } {
  const ts = createRequire(join(HERE, "..", "package.json"))(
    "typescript",
  ) as typeof import("typescript");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const markers: Marker[] = [];
  const problems: string[] = [];
  const lineOf = (pos: number) =>
    sf.getLineAndCharacterOfPosition(pos).line + 1;
  const modifiersOf = (stmt: import("typescript").Statement): string[] => {
    const found = new Set<string>();
    const walk = (n: import("typescript").Node): void => {
      if (ts.isPropertyAccessExpression(n) && MODIFIERS.has(n.name.text))
        found.add(`.${n.name.text}`);
      if (
        ts.isPropertyAssignment(n) &&
        MODIFIERS.has(n.name.getText(sf)) &&
        n.initializer.kind !== ts.SyntaxKind.FalseKeyword
      )
        found.add(`{ ${n.name.getText(sf)}: ${n.initializer.getText(sf)} }`);
      ts.forEachChild(n, walk);
    };
    walk(stmt);
    return [...found];
  };
  /** The marker comments in the trivia at `pos`, each with `stmt` (the statement they lead) or none. */
  const comments = (pos: number, stmt?: import("typescript").Statement) => {
    for (const c of ts.getLeadingCommentRanges(text, pos) ?? []) {
      const comment = text.slice(c.pos, c.end);
      if (!comment.includes("@spec(")) continue;
      const m = MARKER.exec(comment);
      const at = `${file}:${lineOf(c.pos)}`;
      if (!m) problems.push(`${at}: malformed @spec marker`);
      else if (!stmt) problems.push(`${at}: ${m[1]}: names no statement`);
      else
        markers.push({
          id: m[1],
          hash: m[2],
          file,
          line: lineOf(c.pos),
          from: lineOf(stmt.getStart(sf)),
          to: lineOf(stmt.end),
          modifiers: modifiersOf(stmt),
        });
    }
  };
  const visit = (node: import("typescript").Node): void => {
    const list =
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isCaseClause(node) ||
      ts.isDefaultClause(node)
        ? node.statements
        : undefined;
    if (list) {
      for (const stmt of list) comments(stmt.pos, stmt);
      comments(list.end);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { markers, problems };
}

/** A test source: `.test.` or `.spec.` JavaScript or TypeScript. */
const TEST_SOURCE = /\.(?:test|spec)\.[cm]?[jt]s$/;
/** The folders whose tests Vitest runs and the trace reads results of. */
const COVERED = /^(?:src|site|test)\//;

/**
 * The tracked test sources, sorted by what the trace does with them: `read` (results are read), `scripts` (the gate's
 * own node:test files, whose markers are read but whose results are not yet) and `stray` (outside the covered folders
 * and scripts/: the trace cannot say it ran them). Canary fixtures are inputs, never tests, and appear nowhere.
 */
export function traceSources(list: Set<string>): {
  read: string[];
  scripts: string[];
  stray: string[];
} {
  const sources = [...list]
    .filter((f) => TEST_SOURCE.test(f) && !f.startsWith("scripts/canaries/"))
    .sort();
  return {
    read: sources.filter((f) => COVERED.test(f)),
    scripts: sources.filter((f) => f.startsWith("scripts/")),
    stray: sources.filter((f) => !COVERED.test(f) && !f.startsWith("scripts/")),
  };
}

/** The markers that name no statement of the specs, or that name one whose text has changed since the test was written. */
export function judgeMarkers(
  markers: Marker[],
  statements: Statement[],
): string[] {
  const byId = new Map(statements.map((s) => [s.id, s]));
  return markers.flatMap((m) => {
    const at = `${m.file}:${m.line}: ${m.id}`;
    const s = byId.get(m.id);
    if (!s) return [`${at}: no spec holds this statement`];
    return s.hash !== null && s.hash !== m.hash
      ? [`${at}: stale (marker ${m.hash}, statement ${s.hash})`]
      : [];
  });
}
