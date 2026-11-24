// Tests for scripts/shards: the shard table of the selftest step and the check that every test file is in exactly one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { deadEntries, shardProblems } from "./shards.ts";

const TABLE = [["a.test.ts", "b.test.ts"], ["c.test.ts"]];

test("shardProblems: every file in exactly one shard is no problem", () => {
  assert.deepEqual(
    shardProblems(["c.test.ts", "a.test.ts", "b.test.ts"], TABLE),
    [],
  );
});
test("shardProblems: a file in no shard is named", () => {
  assert.deepEqual(shardProblems(["a.test.ts", "new.test.ts"], TABLE), [
    "new.test.ts is in no shard of scripts/shards.ts",
  ]);
});
test("shardProblems: a file in two shards is named with the count", () => {
  assert.deepEqual(
    shardProblems(["c.test.ts"], [["c.test.ts"], ["c.test.ts"]]),
    ["c.test.ts is in 2 shards of scripts/shards.ts"],
  );
});
test("deadEntries: a table entry that is not a tracked test file is named", () => {
  // A deleted or renamed test file leaves no dead entry behind
  assert.deepEqual(deadEntries(["a.test.ts", "c.test.ts"], TABLE), [
    "b.test.ts is in scripts/shards.ts but not tracked",
  ]);
  assert.deepEqual(
    deadEntries(["a.test.ts", "b.test.ts", "c.test.ts"], TABLE),
    [],
  );
});

// The local catch: the selftest step runs this check only under GATE_SHARD or in CI, so a developer's new test file that
// is missing from the table fails here, in the local gate, instead of a round trip later in CI.
test("shardProblems: every tracked test file of this repository is in exactly one shard", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "scripts/*.test.ts", "scripts/*.test.mjs"],
    { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8" },
  )
    .split("\n")
    // the step's own pattern: top level of scripts/ only (git's `*` also crosses folders, into the canaries)
    .filter((f) => /^scripts\/[^/]+\.test\.(?:mjs|ts)$/.test(f));
  assert.notEqual(files.length, 0);
  assert.deepEqual(shardProblems(files), []);
  assert.deepEqual(deadEntries(files), []);
});
