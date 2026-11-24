// The selftest step's shards: the CI job `selftest` runs one shard per matrix entry (GATE_SHARD=1..3), balanced by each
// file's measured seconds (PLAN-ci-split-2: about 185 s a shard, 557 s in all). Moving a file between shards is an edit here.
export const SHARDS: readonly (readonly string[])[] = [
  [
    "scripts/check-repo-lint.test.ts",
    "scripts/check-package.test.ts",
    "scripts/consumer-serve.test.ts",
    "scripts/diff-coverage.test.ts",
    "scripts/setup.test.ts",
    "scripts/check-stylesheet.test.ts",
    "scripts/shards.test.ts",
  ],
  [
    "scripts/check-repo.test.ts",
    "scripts/check-repo-hooks.test.ts",
    "scripts/red-check.test.ts",
    "scripts/check-consumer.test.ts",
    "scripts/scan-secrets.test.ts",
  ],
  [
    "scripts/check-repo-tools.test.ts",
    "scripts/check-repo-site.test.ts",
    "scripts/trace.test.ts",
    "scripts/mutation.test.ts",
  ],
];

/** One line for each tracked test file that the table holds in no shard or in more than one; a forgotten file runs nowhere. */
export function shardProblems(
  files: readonly string[],
  shards: readonly (readonly string[])[] = SHARDS,
): string[] {
  return files.flatMap((f) => {
    const n = shards.filter((s) => s.includes(f)).length;
    if (n === 1) return [];
    return [
      `${f} is in ${n === 0 ? "no shard" : `${n} shards`} of scripts/shards.ts`,
    ];
  });
}

/** One line for each table entry that is not a tracked test file: a deleted or renamed test leaves no dead entry behind.
 * Not part of shardProblems: the selftest step runs that one in fixture repositories that track only some of the table. */
export function deadEntries(
  files: readonly string[],
  shards: readonly (readonly string[])[] = SHARDS,
): string[] {
  return shards
    .flat()
    .filter((f) => !files.includes(f))
    .map((f) => `${f} is in scripts/shards.ts but not tracked`);
}
