// The mutation step (G8): the tests state it; the build follows.
import { NA, result } from "./gate-step.ts";
import type { Result } from "./gate-step.ts";
import { CANNOT } from "./pinned.ts";

export interface Report {
  files: Record<
    string,
    {
      mutants: {
        status: string;
        mutatorName: string;
        location: { start: { line: number } };
      }[];
    }
  >;
}
export const judge = (report: Report, changed: Map<string, number[]>): Result =>
  result(
    NA,
    `not built (${Object.keys(report.files).length}, ${changed.size})`,
  );
export const disableWithoutReason = (files: Map<string, string>): string[] =>
  files.size ? [] : [];
export const workDir = (root: string): string => root;
export const check = (root: string): Result =>
  result(CANNOT, `not built: ${root}`);
