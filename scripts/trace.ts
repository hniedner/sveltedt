// The trace step (G6): which spec statements have a passing test.
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import {
  canaries,
  HERE,
  isResult,
  NA,
  NO_CACHE,
  result,
  tail,
  testRun,
  vitest,
} from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { CANNOT, FINDING, PASS } from "./pinned.ts";

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
/** Anything that looks like a marker, whatever its case or spacing: it must be one, in the one position, or it is a problem. */
const SPEC_LIKE = /@\s*spec/i;

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
    let named = false; // a statement has one marker
    for (const c of ts.getLeadingCommentRanges(text, pos) ?? []) {
      const comment = text.slice(c.pos, c.end);
      if (!SPEC_LIKE.test(comment)) continue;
      read.add(c.pos);
      const m = MARKER.exec(comment);
      const at = `${file}:${lineOf(c.pos)}`;
      if (!m) problems.push(`${at}: malformed @spec marker`);
      else if (!stmt) problems.push(`${at}: ${m[1]}: names no statement`);
      else if (named)
        problems.push(`${at}: ${m[1]}: two markers on one statement`);
      else {
        named = true;
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
    }
  };
  const read = new Set<number>(); // the comments a recognised position gave
  const literals: [number, number][] = []; // text a `//` in which is no comment
  const visit = (node: import("typescript").Node): void => {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateLiteralToken(node) ||
      node.kind === ts.SyntaxKind.RegularExpressionLiteral
    )
      literals.push([node.getStart(sf), node.end]);
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
  // Fail closed: one marker position (directly above a statement); a comment like a marker anywhere else is a finding
  for (const c of text.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g))
    if (
      SPEC_LIKE.test(c[0]) &&
      !read.has(c.index) &&
      !literals.some(([a, b]) => c.index >= a && c.index < b)
    )
      problems.push(
        `${file}:${lineOf(c.index)}: a @spec comment outside the one recognised position (directly above a test statement)`,
      );
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

/** One test as the Vitest JSON reports it: its own line, its name and how it ended. */
export interface Ran {
  line: number;
  name: string;
  status: string;
}

/**
 * What the results say about each marker: a test counts for a marker when it ran in the marker's file on a line inside
 * the statement the marker names (the JSON's `location` is the test's own line). A marked statement with a modifier,
 * a failed or skipped test, or no test at all in a file that ran is a finding; a file that did not run at all cannot
 * be checked. `ok` is the markers none of which went wrong.
 */
export function judgeResults(
  markers: Marker[],
  ran: Map<string, Ran[]>,
): { findings: string[]; cannot: string[]; ok: Marker[] } {
  const findings: string[] = [];
  const cannot: string[] = [];
  const ok: Marker[] = [];
  for (const m of markers) {
    const at = `${m.file}:${m.line}: ${m.id}`;
    const tests = ran
      .get(m.file)
      ?.filter((t) => t.line >= m.from && t.line <= m.to);
    const bad = tests?.filter((t) => t.status !== "passed");
    if (!tests)
      cannot.push(
        `${at}: the test file is not in the results (it did not run)`,
      );
    else if (m.modifiers.length)
      findings.push(`${at}: the test uses ${m.modifiers.join(", ")}`);
    else if (!tests.length)
      findings.push(
        `${at}: no test ran under the marker (lines ${m.from}-${m.to})`,
      );
    else if (bad?.length)
      findings.push(
        `${at}: ${bad.map((t) => `${word(t.status)}: ${t.name}`).join("; ")}`,
      );
    else ok.push(m);
  }
  return { findings, cannot, ok };
}

/** Vitest's `pending`, `skipped` and `disabled` all mean the test did not run. */
const word = (status: string): string =>
  ["pending", "skipped", "disabled"].includes(status) ? "skipped" : status;

/** The tests of a Vitest report by file (relative to the real root, which the JSON names). */
function testsByFile(
  report: NonNullable<ReturnType<typeof vitest>["report"]>,
  root: string,
): Map<string, Ran[]> {
  const real = realpathSync(root);
  return new Map(
    report.testResults.map((r) => [
      relative(real, r.name),
      r.assertionResults.map((a) => ({
        line: a.location?.line ?? 0,
        name: a.fullName,
        status: a.status,
      })),
    ]),
  );
}

/**
 * The planted skipped, marked test must come back as a finding, read from the results: the test skips itself at run
 * time, which no marker text shows. Else the step could not see a skip, and nothing it passes counts.
 */
function canary(): Result | null {
  const dir = canaries("trace");
  const run = vitest(dir, [...NO_CACHE, "--includeTaskLocation"]);
  const bad = (why: string) =>
    result(
      CANNOT,
      `the planted skipped, marked test was not reported: ${why}`,
      tail(run.out),
    );
  if (!run.report) return bad("vitest wrote no report");
  const { statements } = parseSpec(
    "canary.md",
    readFileSync(join(dir, "canary.md"), "utf8"),
  );
  const { markers } = readMarkers(
    "canary.test.ts",
    readFileSync(join(dir, "canary.test.ts"), "utf8"),
  );
  const { findings } = judgeResults(markers, testsByFile(run.report, dir));
  const flagged =
    judgeMarkers(markers, statements).length === 0 &&
    findings.some((f) => /skipped/.test(f));
  return flagged ? null : bad("no finding named it");
}

function trace(root: string, list: Set<string>): Result {
  const specFiles = [...list].filter((f) => /^spec\/[^/]+\.md$/.test(f)).sort();
  const statements: Statement[] = [];
  const findings: string[] = [];
  const cannot: string[] = [];
  for (const f of specFiles) {
    const r = parseSpec(f, readFileSync(join(root, f), "utf8"));
    statements.push(...r.statements);
    findings.push(...r.problems);
  }
  const src = traceSources(list);
  const markers: Marker[] = [];
  for (const f of [...src.read, ...src.scripts]) {
    const r = readMarkers(f, readFileSync(join(root, f), "utf8"));
    markers.push(...r.markers);
    findings.push(...r.problems);
  }
  cannot.push(
    ...src.stray.map(
      (f) => `${f}: a test file outside src/, site/, test/ and scripts/`,
    ),
  );
  if (!specFiles.length && !markers.length && !cannot.length)
    return result(NA, "no spec file and no marker");
  findings.push(...judgeMarkers(markers, statements));
  const scripts = markers.filter((m) => src.scripts.includes(m.file));
  cannot.push(
    ...scripts.map(
      (m) => `${m.file}:${m.line}: ${m.id}: node:test results are not read yet`,
    ),
  );
  const read = markers.filter((m) => src.read.includes(m.file));
  let results = 0;
  let ok: Marker[] = [];
  if (read.length) {
    const planted = canary();
    if (planted) return planted;
    if (!list.has("vitest.config.ts"))
      return result(CANNOT, "vitest.config.ts is not tracked");
    const run = testRun(root);
    if (isResult(run)) return run;
    if (run.error) return result(CANNOT, run.error);
    if (!run.report)
      return result(CANNOT, "vitest wrote no report", tail(run.out));
    results = run.report.numTotalTests;
    const judged = judgeResults(read, testsByFile(run.report, root));
    findings.push(...judged.findings);
    cannot.push(...judged.cannot);
    ok = judged.ok;
  }
  const named = new Set(markers.map((m) => m.id));
  const untested = statements.filter((s) => !named.has(s.id)).map((s) => s.id);
  const hashes = new Map(statements.map((s) => [s.id, s.hash]));
  const tested = new Set(
    ok.filter((m) => hashes.get(m.id) === m.hash).map((m) => m.id),
  );
  const listed = untested.length
    ? [
        `not yet tested (${untested.length}):`,
        ...untested.map((id) => `  ${id}`),
      ]
    : [];
  if (findings.length)
    return result(FINDING, `${findings.length} problem(s)`, [
      ...findings,
      ...cannot,
      ...listed,
    ]);
  if (cannot.length)
    return result(CANNOT, `${cannot.length} marker(s) or file(s) not checked`, [
      ...cannot,
      ...listed,
    ]);
  return result(
    PASS,
    `${specFiles.length} spec file(s), ${statements.length} statement(s), ${markers.length} marker(s), ${results} result(s) read; ${tested.size} tested`,
    listed,
  );
}

export const check = trace;
