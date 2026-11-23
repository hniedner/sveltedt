// check-consumer: the statements of spec/package.md part 2 (CON) over a copy of `consumer/` that the packed package is
// installed into.
//   node scripts/check-consumer.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { childEnv, missedRows, result, scriptMain } from "./gate-step.ts";
import type { Result, Row } from "./gate-step.ts";
import { packed, run } from "./check-package.ts";
import type { Contents } from "./check-package.ts";
import { binaryOf, CANNOT, FINDING, PASS } from "./pinned.ts";

export interface Finding {
  id: string;
  message: string;
}
const NAME = "@hniedner/sveltedt";

/** What the checkout's committed consumer files held, as text. */
export interface Committed {
  manifest: string;
  lock: string;
}
/** The package as the copy installed it, and what the tarball holds. */
export interface Copy {
  dir: string;
  real: string;
  files: Contents;
  tarball: Contents;
  lock: string;
  tarballName: string;
}
export interface State {
  before: Committed;
  after: Committed;
  copy: Copy;
}
export type Canary = Row<State>;

/** CON-01: nothing committed names the package, the test left the committed files alone, and the copy holds the tarball. */
function install(s: State): Finding[] {
  const found: string[] = [];
  const m = JSON.parse(s.after.manifest) as Record<string, unknown>;
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = m[field];
    if (typeof deps === "object" && deps !== null && NAME in deps)
      found.push(`consumer/package.json names ${NAME} in ${field}`);
  }
  if (s.after.lock.includes(NAME))
    found.push(`consumer/pnpm-lock.yaml names ${NAME}`);
  if (s.after.manifest !== s.before.manifest || s.after.lock !== s.before.lock)
    found.push("the test changed a committed consumer file");
  const { copy } = s;
  const store = `${copy.dir}/node_modules/.pnpm/`;
  if (!copy.real.startsWith(store))
    found.push(
      `the installed package resolves to ${copy.real}, outside ${store}`,
    );
  for (const [path, bytes] of copy.tarball) {
    const got = copy.files.get(path);
    if (!got) found.push(`the installed package lacks ${path}`);
    else if (!got.equals(bytes))
      found.push(`the installed ${path} differs from the tarball's`);
  }
  for (const path of copy.files.keys())
    if (!copy.tarball.has(path))
      found.push(`the installed package holds ${path}, not in the tarball`);
  if (
    !copy.lock.includes(`${NAME}@file:`) ||
    !copy.lock.includes(copy.tarballName)
  )
    found.push(
      `the copy's lockfile does not record ${copy.tarballName} as the source of ${NAME}`,
    );
  return found.map((message) => ({ id: "CON-01", message }));
}

/** Every statement over one state, in the spec's order. */
export function analyse(s: State): Finding[] {
  return install(s);
}

export const CANARIES: Canary[] = [
  ...(["dependencies", "devDependencies", "peerDependencies"] as const).map(
    (field): Canary => ({
      id: "CON-01",
      row: `${NAME} named in ${field} of the committed consumer/package.json`,
      plant: (s) => ({
        ...s,
        after: {
          ...s.after,
          manifest: JSON.stringify({ [field]: { [NAME]: "link:.." } }),
        },
      }),
      found: true,
    }),
  ),
  {
    id: "CON-01",
    row: "the installed package resolving to a folder outside the copy",
    plant: (s) => ({ ...s, copy: { ...s.copy, real: "/repo/dist" } }),
    found: true,
  },
  {
    id: "CON-01",
    row: "an installed file that differs from the tarball's",
    plant: (s) => ({
      ...s,
      copy: {
        ...s.copy,
        files: new Map(s.copy.files).set("dist/index.js", Buffer.from("x")),
      },
    }),
    found: true,
  },
  {
    id: "CON-01",
    row: "a copy's lockfile without the tarball as the source",
    plant: (s) => ({
      ...s,
      copy: { ...s.copy, lock: "lockfileVersion: '9.0'\n" },
    }),
    found: true,
  },
];

/** Every file under `dir` by its path, as the bytes it holds. */
function readTree(dir: string): Contents {
  const files: Contents = new Map();
  for (const f of readdirSync(dir, { recursive: true, encoding: "utf8" }))
    if (!statSync(join(dir, f)).isDirectory())
      files.set(f, readFileSync(join(dir, f)));
  return files;
}

/** The files git tracks under `consumer/` copied to `dest` without that prefix; how many, or undefined on a git error. */
function copyTracked(root: string, dest: string): number | undefined {
  const ls = spawnSync(
    "git",
    ["-C", root, "ls-files", "-z", "--", "consumer"],
    {
      encoding: "utf8",
      env: childEnv(),
    },
  );
  if (ls.status !== 0) return undefined;
  const files = ls.stdout.split("\0").filter(Boolean);
  for (const f of files) {
    const to = join(dest, f.slice("consumer/".length));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(root, f), to);
  }
  return files.length;
}

const committed = (root: string): Committed => ({
  manifest: readFileSync(join(root, "consumer", "package.json"), "utf8"),
  lock: readFileSync(join(root, "consumer", "pnpm-lock.yaml"), "utf8"),
});

/** The verdict on one state: the statements, then the canary rows that show they can fail. */
export function verdict(s: State): Result {
  const findings = analyse(s);
  if (findings.length)
    return result(
      FINDING,
      `${findings.length} finding(s)`,
      findings.map((f) => `${f.id} ${f.message}`),
    );
  const missed = missedRows(s, CANARIES, analyse);
  if (missed.length)
    return result(
      CANNOT,
      "a canary row did not give its stated result",
      missed,
    );
  return result(
    PASS,
    "the packed package installed into the consumer copy; canaries found",
  );
}

export function check(root: string): Result {
  const dir = mkdtempSync(join(tmpdir(), "consumer-"));
  try {
    const made = packed(root, dir);
    if (typeof made === "string") return result(CANNOT, made);
    const copy = join(dir, "copy");
    const count = copyTracked(root, copy);
    if (!count) return result(CANNOT, "no file is tracked under consumer/");
    const before = committed(root);
    const pnpm = binaryOf("pnpm");
    const steps: [string, string[]][] = [
      ["pnpm install", ["install", "--frozen-lockfile", "--prefer-offline"]],
      ["pnpm add", ["add", "-D", "--offline", made.tgz]],
    ];
    for (const [name, args] of steps) {
      const r = run(pnpm, args, copy);
      if (r.status !== 0)
        return result(
          CANNOT,
          `${name} exited ${r.status ?? "without a status"} in the consumer copy (no registry or warm store?)`,
          r.stderr.split("\n").slice(-5),
        );
    }
    const link = join(copy, "node_modules", NAME);
    let real: string;
    try {
      real = realpathSync(link);
    } catch {
      return result(CANNOT, `the copy holds no installed ${NAME}`);
    }
    return verdict({
      before,
      after: committed(root),
      copy: {
        dir: realpathSync(copy),
        real,
        files: readTree(real),
        tarball: made.contents,
        lock: readFileSync(join(copy, "pnpm-lock.yaml"), "utf8"),
        tarballName: made.tgz.slice(dir.length + 1),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await scriptMain("check-consumer", import.meta.url, check);
