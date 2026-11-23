// Tests for scripts/shards: the shard table of the selftest step and the check that every test file is in exactly one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { shardProblems } from "./shards.ts";

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
