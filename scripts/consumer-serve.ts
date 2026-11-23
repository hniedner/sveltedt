// consumer-serve: the consumer project's production server (port 4174) and development server (port 4175), from one
// copy that the packed package is installed into (check-consumer's `prepare`), for the browser tests (CON-06, CON-08).
// Playwright starts its webServer before any global setup, so the command that serves also prepares.
//   node scripts/consumer-serve.ts [--root <dir>]
// It prints one line when both servers answer and then runs until it is stopped. Exit codes: 2 usage, 3 could not
// prepare or start.
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

/** Why the server did not come up (it exited, or did not answer in `ms`), or undefined once it answers 200. */
async function wait(
  url: string,
  child: ChildProcess,
  ms: number,
): Promise<string | undefined> {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (child.exitCode !== null) return `exited with ${child.exitCode}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return undefined;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return `did not answer within ${ms / 1000} s`;
}

/** Plants the mismatch route in `copy`, starts both servers and waits for both: a stop function, or what failed. */
export async function start(
  copy: string,
  ports = PORTS,
  ms = 60_000,
): Promise<{ stop: () => void } | string> {
  mkdirSync(join(copy, "src", "routes", "mismatch"), { recursive: true });
  writeFileSync(
    join(copy, "src", "routes", "mismatch", "+page.svelte"),
    MISMATCH,
  );
  const dev = spawn(
    join(copy, "node_modules", ".bin", "vite"),
    ["dev", "--host", "127.0.0.1", "--port", String(ports.dev), "--strictPort"],
    { cwd: copy, env: childEnv(), stdio: "ignore" },
  );
  const prod = spawn(process.execPath, ["build"], {
    cwd: copy,
    env: { ...childEnv(), HOST: "127.0.0.1", PORT: String(ports.prod) },
    stdio: "ignore",
  });
  const stop = (): void => {
    dev.kill();
    prod.kill();
  };
  // The routes are asked for once before the tests start: the development server compiles a route on its first request
  for (const [name, child, url] of [
    ["the development server", dev, `http://127.0.0.1:${ports.dev}/`],
    [
      "the development server /mismatch",
      dev,
      `http://127.0.0.1:${ports.dev}/mismatch`,
    ],
    ["the production server", prod, `http://127.0.0.1:${ports.prod}/`],
  ] as const) {
    const problem = await wait(url, child, ms);
    if (problem) {
      stop();
      return `${name} ${problem}`;
    }
  }
  return { stop };
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
  const clean = (): void => rmSync(dir, { recursive: true, force: true });
  const prepared = prepare(root, dir);
  if (isResult(prepared)) {
    clean();
    console.log(`COULD NOT CHECK consumer-serve: ${prepared.summary}`);
    return CANNOT;
  }
  const started = await start(prepared.copy);
  if (typeof started === "string") {
    clean();
    console.log(`COULD NOT CHECK consumer-serve: ${started}`);
    return CANNOT;
  }
  const end = (): never => {
    started.stop();
    clean();
    process.exit(0);
  };
  process.on("SIGTERM", end);
  process.on("SIGINT", end);
  console.log(
    `The consumer: http://127.0.0.1:${PORTS.prod}/ and its development server http://127.0.0.1:${PORTS.dev}/`,
  );
  return await new Promise<number>(() => undefined);
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
