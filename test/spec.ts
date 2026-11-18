// The marker in every test title: the statement id and the first 8 hex digits of the sha256 (UTF-8) of the
// statement text. That text is the raw Markdown from the first character of the statement's `**<id>**` line up to
// the line before its first `- Reason:` line (examples and notes included), followed by its `- Layer:` line, with
// every run of white space collapsed to one space and the ends trimmed. Reason and Traces are outside. So a changed
// or added example row changes the hash, and the test is stale until it is updated.
export function spec(id: string, hash: string): string {
  return `${id} ${hash}`;
}
