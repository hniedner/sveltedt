// The red-check step (G7): not built yet.
import { result } from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { CANNOT } from "./pinned.ts";

export interface Change {
  source: boolean;
  added: Set<string>;
  tests: { now: string; old: string | null }[];
  support: { path: string; deleted: boolean }[];
}

const NOT_BUILT = "red-check is not built";

export function readChange(sha: string, subject: string, z: string): Change {
  throw new Error(`${NOT_BUILT}: ${sha} ${subject} ${z.length}`);
}

export function loadFailure(
  message: string,
  file: string,
  added: Set<string>,
  real: string,
): string {
  throw new Error(`${NOT_BUILT}: ${message} ${file} ${added.size} ${real}`);
}

export function check(root: string): Result {
  return result(CANNOT, `${NOT_BUILT}: ${root}`);
}
