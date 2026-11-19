// The trace step (G6): reads the spec statements, the @spec markers in the tests and the shared test run's results,
// and says which statements have a passing test, which fail the check, and which no marker names (listed, exit 0).
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
/**
 * A line that looks like a statement's id but is not one the reader takes (a typo would hide the statement): bold, a
 * word, a hyphen and a digit, with at most stray punctuation inside the bold. Stated limits, not handled: an id in
 * underscores (`__X-05__`), in a blockquote, a list item or indented, a three-part id, extra words inside the bold, an
 * orphan `- Reason:` line.
 */
const LOOSE =
  /^\*\*\s*[A-Za-z][A-Za-z0-9]*\s*-\s*\d[A-Za-z0-9]*\s*[:.,;!]?\s*\*\*/;
const FENCE = /^\s*(?:```|~~~)/;

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
  // Inside a code fence nothing is an id or a heading; a fence left open would swallow the rest, so it is a problem
  let open = -1;
  const fenced = lines.map((l, i) => {
    const edge = FENCE.test(l);
    if (edge) open = open < 0 ? i : -1;
    return edge || open >= 0;
  });
  if (open >= 0) problems.push(`${file}:${open + 1}: unclosed code fence`);
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const id = STATEMENT.exec(lines[i])?.[1];
    if (!id) {
      if (LOOSE.test(lines[i]))
        problems.push(
          `${file}:${i + 1}: looks like a statement id, which is **ABC-01**`,
        );
      continue;
    }
    let end = i + 1;
    while (
      end < lines.length &&
      (fenced[end] || (!STATEMENT.test(lines[end]) && !/^#/.test(lines[end])))
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
  if (!statements.length) problems.push(`${file}: no statement found`);
  return { statements, problems };
}

export interface Marker {
  id: string;
  hash: string;
  file: string;
  line: number; // of the marker comment
  from: number; // first and last line of the code statement it leads
  to: number;
  modifiers: string[]; // `.only`, `.skip`, `.todo`, `.fails`, or an options object with one of those names set to `true` or a string
}

const MARKER = /^\/\/ @spec\("([^"]+)", "([0-9a-f]{8})"\)\s*$/;
const MODIFIERS = new Set(["only", "skip", "todo", "fails"]);
/**
 * The test runner's entry points: a modifier counts only on a call chain rooted at one of these, never in test data.
 * Stated limit: a chain rooted elsewhere (the result of `it.extend`, an alias) is not seen; the results still show a skip or todo, not a `.fails` or `.only`.
 */
const ROOTS = new Set(["test", "it", "describe", "suite"]);
/** Any comment that mentions `@spec` (any case, any spacing, even inside a longer word) must be a marker in the one position, or it is a problem. */
const SPEC_LIKE = /@\s*spec/i;

/**
 * The `// @spec("ID", "hash")` markers of one test source, each attached to the code statement it leads in the same
 * block (TypeScript's scanner finds the comments, so marker text inside a string is not read). A marker that leads no
 * statement names nothing, and a comment that mentions `@spec` without being a marker is a mistake: both are problems.
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
      if (ts.isCallExpression(n)) {
        // The call chain `test.skip.each(...)(...)`: names along it, down to the root identifier
        const names: string[] = [];
        let e: import("typescript").Expression = n.expression;
        while (ts.isPropertyAccessExpression(e) || ts.isCallExpression(e)) {
          if (ts.isPropertyAccessExpression(e)) names.push(e.name.text);
          e = e.expression;
        }
        if (ts.isIdentifier(e) && ROOTS.has(e.text)) {
          for (const name of names)
            if (MODIFIERS.has(name)) found.add(`.${name}`);
          for (const arg of n.arguments)
            if (ts.isObjectLiteralExpression(arg))
              for (const p of arg.properties)
                if (
                  ts.isPropertyAssignment(p) &&
                  MODIFIERS.has(p.name.getText(sf)) &&
                  (p.initializer.kind === ts.SyntaxKind.TrueKeyword ||
                    ts.isStringLiteralLike(p.initializer))
                )
                  found.add(
                    `{ ${p.name.getText(sf)}: ${p.initializer.getText(sf)} }`,
                  );
        }
      }
      ts.forEachChild(n, walk);
    };
    walk(stmt);
    return [...found];
  };
  // A marker is a leading comment of its statement as TypeScript defines one; no adjacency is required.
  /** The marker comments in the trivia at `pos`, each with `stmt` (the code statement they lead) or none. */
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
  // Fail closed: one marker position (a leading comment of its statement); a comment like a marker anywhere else is a finding.
  // Every comment comes from the scanner, as the leading or trailing trivia of some token: strings and regexes are
  // never mistaken for comments, whatever they hold.
  const all = new Map<number, number>();
  const scan = (n: import("typescript").Node): void => {
    for (const c of [
      ...(ts.getLeadingCommentRanges(text, n.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, n.end) ?? []),
    ])
      all.set(c.pos, c.end);
    n.getChildren(sf).forEach(scan);
  };
  scan(sf);
  for (const [pos, end] of all)
    if (SPEC_LIKE.test(text.slice(pos, end)) && !read.has(pos))
      problems.push(
        `${file}:${lineOf(pos)}: a @spec comment outside the one recognised position (a leading comment of its statement as TypeScript defines one; no adjacency is required)`,
      );
  return { markers, problems };
}

/** A test source: `.test.` or `.spec.` JavaScript or TypeScript. */
const TEST_SOURCE = /\.(?:test|spec)\.[cm]?[jt]s$/;
/** The folders the gate expects Vitest to run; a test file there that the run misses is reported, not assumed. */
const COVERED = /^(?:src|site|test)\//;

/**
 * The tracked test sources, sorted by what the trace does with them: `read` (results are read), `scripts` (the gate's
 * own node:test files, whose markers are read but whose results this step does not read) and `stray` (outside the
 * covered folders and scripts/: the trace cannot say it ran them; their markers are not read). Canary fixtures are
 * inputs, never tests, and appear nowhere. Stated limit: a marker in a stray test file, a helper, a .tsx or a .svelte
 * file is not seen (the TEST_SOURCE pattern below is all the step reads).
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

/**
 * A problem line for each marker that names no spec statement, or whose hash is not the statement's (its text changed
 * since the test was written). A statement with no hash is already a spec problem and is left out here.
 */
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
 * the code statement the marker leads (the JSON's `location` is the test's own line). A marked statement with a modifier,
 * a failed or skipped test, or no test at all in a file that ran is a finding; a file that did not run at all cannot
 * be checked. `ok` is each marker whose tests all passed. Limit: a test that a helper defines (the call is not under
 * the marked statement) has no line there, so such a marker reports "no test ran": loud, never a silent pass.
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
  if (run.error) return bad(run.error);
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

/** A statement id defined twice: both places are named. */
function duplicateIds(statements: Statement[]): string[] {
  const first = new Map<string, Statement>();
  const found: string[] = [];
  for (const s of statements) {
    const was = first.get(s.id);
    if (was)
      found.push(
        `${s.file}:${s.line}: ${s.id}: also defined at ${was.file}:${was.line}`,
      );
    else first.set(s.id, s);
  }
  return found;
}

/** A spec file the step reads: top level of spec/, Markdown. */
const SPEC_FILE = /^spec\/[^/]+\.md$/;

/** The step: spec statements and markers read, results judged, untested statements listed. */
function trace(root: string, list: Set<string>): Result {
  const specFiles = [...list].filter((f) => SPEC_FILE.test(f)).sort();
  const statements: Statement[] = [];
  const findings: string[] = [];
  const cannot: string[] = [];
  for (const f of specFiles) {
    const r = parseSpec(f, readFileSync(join(root, f), "utf8"));
    statements.push(...r.statements);
    findings.push(...r.problems);
  }
  findings.push(...duplicateIds(statements));
  // Anything else under spec/ may hold statements the step does not read: never skipped
  cannot.push(
    ...[...list]
      .filter((f) => f.startsWith("spec/") && !SPEC_FILE.test(f))
      .map((f) => `${f}: under spec/ but not a top-level .md file`),
  );
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
  if (
    !specFiles.length &&
    !markers.length &&
    !cannot.length &&
    !findings.length
  )
    return result(NA, "no spec file and no marker");
  findings.push(...judgeMarkers(markers, statements));
  const scripts = markers.filter((m) => src.scripts.includes(m.file));
  cannot.push(
    ...scripts.map(
      (m) =>
        `${m.file}:${m.line}: ${m.id}: node:test results are not read by this step`,
    ),
  );
  const read = markers.filter((m) => src.read.includes(m.file));
  let results = 0;
  let ok: Marker[] = [];
  // The positive control runs whenever there is a test source to read, not only when a marker was found: a reader
  // that finds nothing (say after a TypeScript change) must fail the canary, never pass with every statement untested.
  if (src.read.length) {
    const planted = canary();
    if (planted) return planted;
  }
  if (read.length) {
    if (!list.has("vitest.config.ts"))
      return result(CANNOT, "vitest.config.ts is not tracked");
    const run = testRun(root);
    if (isResult(run)) return run;
    if (run.error) return result(CANNOT, run.error);
    if (!run.report)
      return result(CANNOT, "vitest wrote no report", tail(run.out));
    // Same detection as the test step, but a trace that cannot trust the run says COULD NOT CHECK: an error outside any
    // test (unhandled) fails the run though the report counts no failed test
    if (run.status !== 0 && run.report.numFailedTests === 0)
      return result(
        CANNOT,
        `vitest exited ${run.status} though no test failed`,
        tail(run.out),
      );
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
    `${specFiles.length} spec file(s), ${statements.length} statement(s), ${markers.length} marker(s), ${results} test(s) ran; ${tested.size} of ${statements.length} statements tested`,
    listed,
  );
}

export const check = trace;
