// The trace step (G6): which spec statements have a passing test.
import { createHash } from "node:crypto";

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
