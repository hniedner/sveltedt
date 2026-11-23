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
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  childEnv,
  COLOUR,
  missedRows,
  result,
  scriptMain,
} from "./gate-step.ts";
import type { Result, Row } from "./gate-step.ts";
import { packed, planted, run } from "./check-package.ts";
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
/** What `svelte-check --output machine` reported: the files it read and its errors, as "file line:column message". */
export interface TypeReport {
  files: number;
  errors: string[];
}
/** What `pnpm peers check` printed and exited with. */
export interface PeerReport {
  status: number;
  text: string;
}
export interface State {
  before: Committed;
  after: Committed;
  copy: Copy;
  /** `real`: the consumer; `planted`: the same copy with a page that passes `rows={42}` (CON-09's second row). */
  types: { real: TypeReport; planted: TypeReport };
  /** `real`: the consumer with the real tarball; `planted`: with a tarball whose peer range is `^6.0.0` (CON-11's second row). */
  peers: { real: PeerReport; planted: PeerReport };
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

/** CON-09: the type check of the copy reports no error, with SvelteDT's types from the installed package. */
const types = (s: State): Finding[] =>
  s.types.real.errors.map((message) => ({ id: "CON-09", message }));

/** CON-11: no issue of `pnpm peers check` names the package; an issue that names only others is not this statement's. */
function peers(s: State): Finding[] {
  const { status, text } = s.peers.real;
  if (status === 0 || !text.includes(NAME)) return [];
  const issue = text.split("\n").find((l) => l.startsWith("✕")) ?? "an issue";
  return [
    {
      id: "CON-11",
      message: `pnpm peers check reports an issue that names ${NAME}: ${issue}`,
    },
  ];
}

/** Every statement over one state, in the spec's order. */
export function analyse(s: State): Finding[] {
  return [...install(s), ...types(s), ...peers(s)];
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
    id: "CON-09",
    row: "a page that passes rows={42} to DataTable gives an error",
    plant: (s) => ({ ...s, types: { ...s.types, real: s.types.planted } }),
    found: true,
  },
  {
    id: "CON-11",
    row: "a tarball whose peer range for svelte is above the installed version",
    plant: (s) => ({ ...s, peers: { ...s.peers, real: s.peers.planted } }),
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

/** The first lines a failed command printed, without colour, for the details of a could-not-check. */
const lines = (r: { stdout: string; stderr: string }): string[] =>
  `${r.stdout}${r.stderr}`
    .replace(COLOUR, "")
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 10);

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

/** The report in `svelte-check --output machine` text, or undefined when it did not report on any file. */
export function parseTypeReport(out: string): TypeReport | undefined {
  const done = /^\d+ COMPLETED (\d+) FILES /m.exec(out);
  if (!done) return undefined;
  const errors = [
    ...out.matchAll(/^\d+ ERROR "([^"]*)" (\d+:\d+) "(.*)"$/gm),
  ].map((m) => `${m[1]} ${m[2]} "${m[3]}"`);
  return { files: Number(done[1]), errors };
}

/** The peer report of a `pnpm peers check` run, or undefined when it printed neither of pnpm's two verdicts. */
export function parsePeerReport(r: {
  status: number | null;
  stdout: string;
}): PeerReport | undefined {
  return r.status !== null &&
    /No peer dependency issues found|Issues with peer dependencies found/.test(
      r.stdout,
    )
    ? { status: r.status, text: r.stdout }
    : undefined;
}

/** svelte-check in the copy, with its own configuration and tsconfig (CON-09). */
function typeCheck(copy: string): TypeReport | undefined {
  const r = run(
    join(copy, "node_modules", ".bin", "svelte-check"),
    [
      "--tsconfig",
      "./tsconfig.json",
      "--config",
      "vite.config.js",
      "--output",
      "machine",
    ],
    copy,
  );
  return parseTypeReport(r.stdout);
}

/** The verdict on one state: the statements, then the canary rows that show they can fail. */
export function verdict(s: State): Result {
  if (s.peers.real.status !== 0 && s.peers.planted.status === 0)
    return result(
      CANNOT,
      "pnpm peers check did not report the planted peer range",
    );
  if (!s.types.real.files || !s.types.planted.files)
    return result(CANNOT, "the type check read no file of the consumer copy");
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
          lines(r),
        );
    }
    const link = join(copy, "node_modules", NAME);
    let real: string;
    try {
      real = realpathSync(link);
    } catch {
      return result(CANNOT, `the copy holds no installed ${NAME}`);
    }
    // The build writes SvelteKit's generated tsconfig, which the consumer's extends (CON-09)
    const build = run(
      join(copy, "node_modules", ".bin", "vite"),
      ["build"],
      copy,
    );
    if (build.status !== 0)
      return result(
        CANNOT,
        "vite build failed in the consumer copy",
        lines(build),
      );
    const typed = typeCheck(copy);
    const page = join(copy, "src", "routes", "+page.svelte");
    const source = readFileSync(page, "utf8");
    writeFileSync(page, source.replace("rows={orders}", "rows={42}"));
    const typedPlanted = typeCheck(copy);
    writeFileSync(page, source);
    if (!typed || !typedPlanted)
      return result(
        CANNOT,
        "svelte-check exited without a report in the consumer copy",
      );
    // What the real tarball installed, read before CON-11 replaces it with a planted one
    const installedCopy: Copy = {
      dir: realpathSync(copy),
      real,
      files: readTree(real),
      tarball: made.contents,
      lock: readFileSync(join(copy, "pnpm-lock.yaml"), "utf8"),
      tarballName: made.tgz.slice(dir.length + 1),
    };
    // CON-11: the peer check of the real tarball, then of one whose peer range for svelte is above the installed version
    const peerReal = parsePeerReport(run(pnpm, ["peers", "check"], copy));
    const manifest = JSON.parse(
      made.contents.get("package.json")?.toString() ?? "",
    ) as {
      peerDependencies: Record<string, string>;
    };
    manifest.peerDependencies.svelte = "^6.0.0";
    const tgz6 = planted(
      new Map(made.contents).set(
        "package.json",
        Buffer.from(JSON.stringify(manifest)),
      ),
      dir,
      "peer6",
    );
    const added = run(pnpm, ["add", "-D", "--offline", tgz6], copy);
    const peerPlanted =
      added.status === 0
        ? parsePeerReport(run(pnpm, ["peers", "check"], copy))
        : undefined;
    if (!peerReal || !peerPlanted)
      return result(
        CANNOT,
        "pnpm peers check gave no report in the consumer copy",
        lines(added),
      );
    return verdict({
      before,
      after: committed(root),
      types: { real: typed, planted: typedPlanted },
      peers: { real: peerReal, planted: peerPlanted },
      copy: installedCopy,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await scriptMain("check-consumer", import.meta.url, check);
