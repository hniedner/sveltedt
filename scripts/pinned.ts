// What scan-secrets.ts, check-repo.ts and gate-step.ts share: the exit codes of every check (G1) and the read of a pinned tool.
import { readFileSync } from "node:fs";

export const PASS = 0,
  FINDING = 1,
  USAGE = 2,
  CANNOT = 3;

/** The version `file` pins on a line `version <x>`, or undefined when the file or the line is missing. */
export function pinnedVersion(file: string): string | undefined {
  try {
    return /^version (\S+)$/m.exec(readFileSync(file, "utf8"))?.[1];
  } catch {
    return undefined;
  }
}

/** The binary to run for `name`: the test seam `<NAME>_BIN` when it is set and not empty, else `name` on PATH. */
export const binaryOf = (name: string): string =>
  process.env[`${name.toUpperCase()}_BIN`] || name;
