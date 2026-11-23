// check-consumer: the statements of spec/package.md part 2 (CON) over a copy of `consumer/` that the packed package is
// installed into.
//   node scripts/check-consumer.ts [--root <dir>]
// Exit codes (docs/engineering/gates.md, G1): 0 pass, 1 finding, 2 usage or crash, 3 could not check.
import { spawn, spawnSync } from "node:child_process";
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
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "parse5";
import type { DefaultTreeAdapterTypes as Tree } from "parse5";
import {
  childEnv,
  COLOUR,
  isResult,
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
/** One answer of the consumer's production server: its status, its policy header and its HTML. */
export interface Page {
  status: number;
  csp: string;
  html: string;
}
export interface State {
  before: Committed;
  after: Committed;
  copy: Copy;
  /** The listener file the copy holds (static/csp-listener.js), which the server must answer with. */
  listener: string;
  /** `GET /`, `GET /` again, `GET /no-such-page` and `GET /csp-listener.js` on the production server. */
  http: { home: Page; again: Page; missing: Page; listener: Page };
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

const nodes = (n: Tree.Node): Tree.Node[] => [
  n,
  ...("childNodes" in n ? n.childNodes.flatMap(nodes) : []),
];
const elements = (html: string, tag: string): Tree.Element[] =>
  nodes(parse(html)).filter(
    (n): n is Tree.Element => "tagName" in n && n.tagName === tag,
  );
const textOf = (n: Tree.Node): string =>
  nodes(n)
    .filter((x): x is Tree.TextNode => x.nodeName === "#text")
    .map((x) => x.value)
    .join("")
    .trim();
/** The first cell of each body row, as text. */
const firstCells = (html: string): string[] =>
  nodes(parse(html))
    .filter(
      (n): n is Tree.Element =>
        "tagName" in n &&
        n.tagName === "tr" &&
        (n.parentNode as Tree.Element).tagName === "tbody",
    )
    .map((row) => {
      const cell = row.childNodes.find(
        (c) => "tagName" in c && c.tagName === "td",
      );
      return cell ? textOf(cell) : "";
    });
const ORDERS = "07 03 15 01 20 11 05 18 09 13 02 17 06 14 10 19 04 12 16 08"
  .split(" ")
  .map((n) => `Order ${n}`);

/** CON-02: the list page holds one table named "Orders" with the 20 rows of the fixed list, in its order. */
function listPage(s: State): Finding[] {
  const html = s.http.home.html;
  const tables = elements(html, "table");
  const found: string[] = [];
  if (s.http.home.status !== 200)
    found.push(`the list page answered ${s.http.home.status}, not 200`);
  if (tables.length !== 1)
    found.push(`the list page holds ${tables.length} tables, not 1`);
  else {
    const caption = elements(html, "caption").map(textOf)[0];
    if (caption !== "Orders")
      found.push(`the table's caption reads "${caption}", not "Orders"`);
    const cells = firstCells(html);
    if (cells.length !== 20)
      found.push(`the list page holds ${cells.length} body rows, not 20`);
    ORDERS.forEach((want, i) => {
      if (cells[i] !== want)
        found.push(
          `row ${i + 1} starts with "${cells[i] ?? ""}", not "${want}"`,
        );
    });
  }
  return found.map((message) => ({ id: "CON-02", message }));
}

/** CON-03: no element of the server's HTML, as a parser reads it, has a `style` attribute. */
function noStyle(s: State): Finding[] {
  return (
    [
      ["list", s.http.home],
      ["404", s.http.missing],
    ] as const
  ).flatMap(([name, { html }]) =>
    nodes(parse(html))
      .filter(
        (n): n is Tree.Element =>
          "attrs" in n && n.attrs.some((a) => a.name === "style"),
      )
      .map((n) => ({
        id: "CON-03",
        message: `the ${name} page has a style attribute on <${n.tagName}>`,
      })),
  );
}

const NONCE = /'nonce-[\w+/=-]+'/;
const STRICT = [
  "default-src 'self'",
  "script-src 'self' 'nonce-N'",
  "style-src 'self'",
  "style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=' 'report-sample'",
];

/** CON-04: each HTML answer carries the strict policy with one fresh nonce in `script-src` and no other addition. */
function policy(s: State): Finding[] {
  const found: string[] = [];
  const nonces: string[] = [];
  for (const [name, { csp }] of [
    ["list", s.http.home],
    ["second list", s.http.again],
    ["404", s.http.missing],
  ] as const) {
    nonces.push(NONCE.exec(csp)?.[0] ?? "");
    const shape = csp
      .replace(NONCE, "'nonce-N'")
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .sort();
    if (shape.join("; ") !== [...STRICT].sort().join("; "))
      found.push(
        `the ${name} page's policy differs from the strict policy with one nonce: ${shape.join("; ")}`,
      );
  }
  if (new Set(nonces).size !== nonces.length)
    found.push("two responses carry the same nonce");
  return found.map((message) => ({ id: "CON-04", message }));
}

const attr = (n: Tree.Element, name: string): string | undefined =>
  n.attrs.find((a) => a.name === name)?.value;
const show = (n: Tree.Element): string =>
  `<script ${n.attrs.map((a) => `${a.name}="${a.value}"`).join(" ")}>`;

/** CON-05: the list page loads the listener from its own origin as a plain script, before every other script. */
function listenerFirst(s: State): Finding[] {
  const found: string[] = [];
  const scripts = elements(s.http.home.html, "script");
  const at = scripts.findIndex((n) => attr(n, "src") === "/csp-listener.js");
  if (at < 0)
    found.push(
      "no script loads /csp-listener.js from the consumer's own origin",
    );
  else {
    for (const a of ["async", "defer", "type"])
      if (attr(scripts[at], a) !== undefined)
        found.push(`the listener script has the ${a} attribute`);
    for (const n of scripts.slice(0, at))
      if (attr(n, "type") !== "module" || attr(n, "async") !== undefined)
        found.push(`a script comes before the listener: ${show(n)}`);
  }
  const { status, html } = s.http.listener;
  if (status !== 200)
    found.push(`the server answers /csp-listener.js with ${status}, not 200`);
  else if (html !== s.listener)
    found.push("/csp-listener.js is not the bytes of the listener");
  return found.map((message) => ({ id: "CON-05", message }));
}

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
  return [
    ...install(s),
    ...listPage(s),
    ...listenerFirst(s),
    ...noStyle(s),
    ...policy(s),
    ...types(s),
    ...peers(s),
  ];
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
  ...(
    [
      ["no table (the render threw)", "<p>Internal Error</p>"],
      [
        "a table with a different caption",
        "<table><caption>x</caption></table>",
      ],
    ] as const
  ).map(([row, html]): Canary => ({
    id: "CON-02",
    row,
    plant: (s) => ({
      ...s,
      http: { ...s.http, home: { ...s.http.home, html } },
    }),
    found: true,
  })),
  ...(
    [
      [
        "the listener after the framework's bootstrap script",
        '<script nonce="n">boot()</script><script src="/csp-listener.js"></script>',
      ],
      [
        "the listener with an async attribute",
        '<script src="/csp-listener.js" async></script>',
      ],
    ] as const
  ).map(([row, html]): Canary => ({
    id: "CON-05",
    row,
    plant: (s) => ({
      ...s,
      http: {
        ...s.http,
        home: {
          ...s.http.home,
          html: `<html><head>${html}</head><body>${s.http.home.html}</body></html>`,
        },
      },
    }),
    found: true,
  })),
  {
    id: "CON-03",
    row: "SvelteKit's default page shell wrapper with a style attribute",
    plant: (s) => ({
      ...s,
      http: {
        ...s.http,
        missing: {
          ...s.http.missing,
          html: '<div style="display: contents"></div>',
        },
      },
    }),
    found: true,
  },
  {
    id: "CON-04",
    row: "'unsafe-inline' added to style-src",
    plant: (s) => ({
      ...s,
      http: {
        ...s.http,
        home: {
          ...s.http.home,
          csp: s.http.home.csp.replace(
            "style-src 'self'",
            "style-src 'self' 'unsafe-inline'",
          ),
        },
      },
    }),
    found: true,
  },
  {
    id: "CON-04",
    row: "the same nonce in two responses",
    plant: (s) => ({
      ...s,
      http: { ...s.http, again: { ...s.http.again, csp: s.http.home.csp } },
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
  const done = /^\d+ COMPLETED (\d+) FILES (\d+) ERRORS /m.exec(out);
  if (!done) return undefined;
  const errors = [
    ...out.matchAll(/^\d+ ERROR "([^"]*)" (\d+:\d+) "(.*)"$/gm),
  ].map((m) => `${m[1]} ${m[2]} "${m[3]}"`);
  return errors.length === Number(done[2])
    ? { files: Number(done[1]), errors }
    : undefined;
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

/** A free port on the loopback address. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer().once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
const answer = async (url: string): Promise<Page> => {
  const r = await fetch(url, {
    redirect: "manual",
    headers: { accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: r.status,
    csp: r.headers.get("content-security-policy") ?? "",
    html: await r.text(),
  };
};

/** The consumer's production server on a free port, asked for the three pages; the server is stopped afterwards. */
async function serve(copy: string): Promise<State["http"] | string> {
  const port = await freePort();
  const server = spawn(process.execPath, ["build"], {
    cwd: copy,
    env: { ...childEnv(), HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let tries = 0; tries < 60; tries++) {
      try {
        return {
          home: await answer(`${base}/`),
          again: await answer(`${base}/`),
          missing: await answer(`${base}/no-such-page`),
          listener: await answer(`${base}/csp-listener.js`),
        };
      } catch {
        if (server.exitCode !== null) return "the consumer server exited";
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return "the consumer server did not answer within 15 s";
  } finally {
    server.kill();
  }
}

/** The verdict on one state: the statements, then the canary rows that show they can fail. */
export function verdict(s: State): Result {
  if (s.http.missing.status !== 404)
    return result(CANNOT, `/no-such-page answered ${s.http.missing.status}`);
  if (s.peers.planted.status === 0)
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

/** The packed package installed into a built copy of the consumer, as the checks and the browser tests read it. */
export interface Prepared {
  made: { contents: Contents; tgz: string };
  copy: string;
  /** Where the copy's node_modules/@hniedner/sveltedt link leads. */
  real: string;
}

/** Pack, copy the tracked consumer/, install from its lockfile, add the tarball, build: or why one step could not run. */
export function prepare(root: string, dir: string): Prepared | Result {
  const made = packed(root, dir);
  if (typeof made === "string") return result(CANNOT, made);
  const copy = join(dir, "copy");
  if (!copyTracked(root, copy))
    return result(CANNOT, "no file is tracked under consumer/");
  const pnpm = binaryOf("pnpm");
  const steps: [string, string, string[]][] = [
    [
      "pnpm install",
      pnpm,
      ["install", "--frozen-lockfile", "--prefer-offline"],
    ],
    ["pnpm add", pnpm, ["add", "-D", "--prefer-offline", made.tgz]],
    // The build writes SvelteKit's generated tsconfig, which the consumer's extends (CON-09)
    ["vite build", join(copy, "node_modules", ".bin", "vite"), ["build"]],
  ];
  for (const [name, cmd, args] of steps) {
    const r = run(cmd, args, copy);
    if (r.status !== 0)
      return result(
        CANNOT,
        `${name} exited ${r.status ?? "without a status"} in the consumer copy${cmd === pnpm ? " (no registry or warm store?)" : ""}`,
        lines(r),
      );
  }
  try {
    return { made, copy, real: realpathSync(join(copy, "node_modules", NAME)) };
  } catch {
    return result(CANNOT, `the copy holds no installed ${NAME}`);
  }
}

export async function check(root: string): Promise<Result> {
  const dir = mkdtempSync(join(tmpdir(), "consumer-"));
  try {
    const prepared = prepare(root, dir);
    if (isResult(prepared)) return prepared;
    // After the preparation, which reads nothing but the tracked files: a missing lockfile ends it, not this read
    const before = committed(root);
    const { made, copy, real } = prepared;
    const pnpm = binaryOf("pnpm");
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
    const http = await serve(copy);
    if (typeof http === "string") return result(CANNOT, http);
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
    const added = run(pnpm, ["add", "-D", "--prefer-offline", tgz6], copy);
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
      http,
      listener: readFileSync(join(copy, "static", "csp-listener.js"), "utf8"),
      types: { real: typed, planted: typedPlanted },
      peers: { real: peerReal, planted: peerPlanted },
      copy: installedCopy,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

await scriptMain("check-consumer", import.meta.url, check);
