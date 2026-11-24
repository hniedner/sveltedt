// consumer-serve: the consumer project's production server (port 4174) and development server (port 4175), from one
// copy that the packed package is installed into (check-consumer's `prepare`), for the browser tests (CON-06, CON-08).
// Playwright starts its webServer before any global setup, so the command that serves also prepares.
//   node scripts/consumer-serve.ts [--root <dir>]
// It prints one line when both servers answer and then runs until it is stopped. Exit codes: 2 usage, 3 could not
// prepare or start. Every line of both servers also goes, timed and with the copy's path replaced, to
// <root>/test-results/consumer-serve.log (#217), beside the trace of a failed test; a line that cannot be written is
// reported on stderr and skipped.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepare } from "./check-consumer.ts";
import { childEnv, isResult } from "./gate-step.ts";
import { CANNOT, USAGE } from "./pinned.ts";

export const PORTS = { prod: 4174, dev: 4175 };
/** CON-08's second row: a route whose `img` has another `src` on the server than in the browser. */
export const MISMATCH = `<script lang="ts">
  const src = typeof window === "undefined" ? "/a.png" : "/b.png";
</script>

<img {src} alt="x" />
`;

/** A server process with the last lines it printed and why it could not be started, if it could not. */
interface Server {
  name: string;
  child: ChildProcess;
  out: string[];
  failed?: string;
}
function launch(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log?: string,
): Server {
  const server: Server = {
    name,
    child: spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }),
    out: [],
  };
  // The copy's real path first: on macOS the path given is a substring of the real one
  const real = log ? realpathSync(cwd) : cwd;
  const keep = (d: Buffer): void => {
    const lines = String(d).split("\n").filter(Boolean);
    server.out.push(...lines);
    server.out.splice(0, Math.max(0, server.out.length - 5));
    // Evidence must never end the servers it observes: a log that cannot be written is said on stderr and skipped
    if (log)
      try {
        appendFileSync(
          log,
          lines
            .map(
              (l) =>
                `${new Date().toISOString()} ${name}: ${l.replaceAll(real, "<copy>").replaceAll(cwd, "<copy>")}\n`,
            )
            .join(""),
        );
      } catch (e) {
        console.error(`consumer-serve: the log was not written: ${String(e)}`);
      }
  };
  server.child.stdout?.on("data", keep);
  server.child.stderr?.on("data", keep);
  server.child.on(
    "error",
    (e) => (server.failed = `could not be started: ${e.message}`),
  );
  return server;
}
const ended = (s: Server): string | undefined => {
  const { exitCode, signalCode } = s.child;
  if (exitCode === null && signalCode === null) return undefined;
  return `exited with ${exitCode ?? signalCode}${s.out.length ? `: ${s.out.join(" | ")}` : ""}`;
};

/** Why `server` did not answer at `url` (it failed, it ended, or no answer in `ms`), or undefined once it answers 200. */
async function wait(
  url: string,
  server: Server,
  ms: number,
): Promise<string | undefined> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const problem = server.failed ?? ended(server);
    if (problem) return `${server.name} ${problem}`;
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).ok)
        return undefined;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return `${server.name} did not answer within ${ms / 1000} s`;
}

/**
 * Plants the mismatch route in `copy`, starts the development server and waits for it on both routes (the first request
 * compiles a route), then starts the production server and waits for it: so when 4174 answers, so does 4175. A stop
 * function and a promise of why a server died later, or what failed.
 */
export async function start(
  copy: string,
  ports = PORTS,
  ms = 60_000,
  log?: string,
): Promise<{ stop: () => void; died: Promise<string> } | string> {
  if (log) {
    mkdirSync(dirname(log), { recursive: true });
    writeFileSync(log, "");
  }
  mkdirSync(join(copy, "src", "routes", "mismatch"), { recursive: true });
  writeFileSync(
    join(copy, "src", "routes", "mismatch", "+page.svelte"),
    MISMATCH,
  );
  const dev = launch(
    "the development server",
    join(copy, "node_modules", ".bin", "vite"),
    ["dev", "--host", "127.0.0.1", "--port", String(ports.dev), "--strictPort"],
    copy,
    childEnv(),
    log,
  );
  let prod: Server | undefined;
  const stop = (): void => {
    dev.child.kill();
    prod?.child.kill();
  };
  let problem = await wait(`http://127.0.0.1:${ports.dev}/`, dev, ms);
  problem ??= await wait(`http://127.0.0.1:${ports.dev}/mismatch`, dev, ms);
  if (!problem) {
    prod = launch(
      "the production server",
      process.execPath,
      ["build"],
      copy,
      {
        ...childEnv(),
        HOST: "127.0.0.1",
        PORT: String(ports.prod),
      },
      log,
    );
    problem = await wait(`http://127.0.0.1:${ports.prod}/`, prod, ms);
  }
  if (problem || !prod) {
    stop();
    return problem ?? "the production server was not started";
  }
  const servers = [dev, prod];
  const died = new Promise<string>((resolve) => {
    for (const s of servers)
      s.child.on("exit", () => resolve(`${s.name} ${ended(s) ?? "stopped"}`));
  });
  return { stop, died };
}

async function main(argv: string[]): Promise<number> {
  const at = argv.indexOf("--root");
  if (argv.length !== (at >= 0 ? 2 : 0) || (at >= 0 && !argv[at + 1])) {
    console.log(
      "USAGE consumer-serve: node scripts/consumer-serve.ts [--root <dir>]",
    );
    return USAGE;
  }
  const root =
    at >= 0
      ? resolve(argv[at + 1])
      : join(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = mkdtempSync(join(tmpdir(), "consumer-serve-"));
  let stop = (): void => undefined;
  const clean = (): void => {
    stop();
    rmSync(dir, { recursive: true, force: true });
  };
  // Before the preparation: Playwright ends a webServer with SIGKILL unless gracefulShutdown names SIGTERM
  const end = (): never => {
    clean();
    process.exit(0);
  };
  process.on("SIGTERM", end);
  process.on("SIGINT", end);
  const fail = (why: string, details: string[] = []): number => {
    clean();
    for (const d of details) console.log(`  ${d}`);
    console.log(`COULD NOT CHECK consumer-serve: ${why}`);
    return CANNOT;
  };
  const prepared = prepare(root, dir);
  if (isResult(prepared)) return fail(prepared.summary, prepared.details);
  const started = await start(
    prepared.copy,
    PORTS,
    undefined,
    join(root, "test-results", "consumer-serve.log"),
  );
  if (typeof started === "string") return fail(started);
  stop = started.stop;
  console.log(
    `The consumer: http://127.0.0.1:${PORTS.prod}/ and its development server http://127.0.0.1:${PORTS.dev}/`,
  );
  return fail(await started.died);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const code = await main(process.argv.slice(2));
    process.exitCode = code;
  } catch (e) {
    console.log(
      `USAGE consumer-serve: crashed: ${(e as Error | undefined)?.stack ?? String(e)}`,
    );
    process.exitCode = USAGE;
  }
}
