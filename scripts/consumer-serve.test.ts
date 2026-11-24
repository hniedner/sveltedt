// Tests for consumer-serve.ts. The servers of a copy are faked by two small scripts, so every branch of `start` runs in
// well under a second; the script's own exits are run through the program.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { HERE } from "./gate-step.ts";
import { start } from "./consumer-serve.ts";

const free = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
// True once nothing answers on `port` (polled for 3 s: a stopped server takes a moment to go)
async function closed(port: number): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(500),
      });
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
// A fake vite that listens on --port after `delay` ms, and a fake build/index.js that listens on PORT after `delay`
// Every fake ends itself after 20 s, so a server that the code under test fails to stop cannot hold the run open
const LISTEN = (port: string, delay: number): string =>
  `setTimeout(() => process.exit(0), 20000); setTimeout(() => import("node:http").then((h) => h.createServer((q, r) => r.end("ok")).listen(Number(${port}), "127.0.0.1")), ${delay});`;
function fake(opts: { dev: string; prod: string }): string {
  const copy = mkdtempSync(join(tmpdir(), "serve-test-"));
  after(() => rmSync(copy, { recursive: true, force: true }));
  mkdirSync(join(copy, "node_modules", ".bin"), { recursive: true });
  mkdirSync(join(copy, "build"));
  const vite = join(copy, "node_modules", ".bin", "vite");
  writeFileSync(vite, `#!/usr/bin/env node\n${opts.dev}\n`);
  chmodSync(vite, 0o755);
  writeFileSync(join(copy, "build", "index.js"), opts.prod);
  return copy;
}
const GOOD = {
  dev: LISTEN('process.argv[process.argv.indexOf("--port") + 1]', 0),
  prod: LISTEN("process.env.PORT", 0),
};

test(
  "start: both servers answer, the mismatch route is planted, and stop ends them",
  { timeout: 30_000 },
  async () => {
    const copy = fake(GOOD);
    const ports = { dev: await free(), prod: await free() };
    const started = await start(copy, ports, 5000);
    assert.ok(typeof started !== "string", "the servers did not start");
    after(() => started.stop()); // a failed assertion below must not leave the servers holding the run open
    assert.ok(
      existsSync(join(copy, "src", "routes", "mismatch", "+page.svelte")),
    );
    assert.equal((await fetch(`http://127.0.0.1:${ports.prod}/`)).status, 200);
    started.stop();
    assert.ok(
      await closed(ports.dev),
      "the development server still answers after stop",
    );
    assert.ok(
      await closed(ports.prod),
      "the production server still answers after stop",
    );
  },
);
test(
  "start: a development server that exits, a production server that exits, and one that never answers are could not start",
  { timeout: 30_000 },
  async () => {
    const failed = async (opts: typeof GOOD, ms: number): Promise<string> => {
      const ports = { dev: await free(), prod: await free() };
      const r = await start(fake(opts), ports, ms);
      if (typeof r !== "string") r.stop(); // a start that should have failed must not hold the run open
      assert.equal(typeof r, "string");
      assert.ok(
        (await closed(ports.dev)) && (await closed(ports.prod)),
        "a failed start left a server",
      );
      return r as string;
    };
    assert.equal(
      await failed({ ...GOOD, dev: "process.exit(1);" }, 5000),
      "the development server exited with 1",
    );
    assert.equal(
      await failed({ ...GOOD, prod: "process.exit(1);" }, 5000),
      "the production server exited with 1",
    );
    // The routes are asked for once before the tests start, so the first browser does not pay the dev server's compile
    const half = `import("node:http").then((h) => h.createServer((q, r) => { r.statusCode = q.url === "/mismatch" ? 500 : 200; r.end("x"); }).listen(Number(process.argv[process.argv.indexOf("--port") + 1]), "127.0.0.1"));`;
    assert.equal(
      await failed({ ...GOOD, dev: half }, 600),
      "the development server did not answer within 0.6 s",
    );
    // Margin for a loaded runner: ms is per wait, and the fake dev server must answer inside it before prod starts
    assert.equal(
      await failed({ ...GOOD, prod: LISTEN("process.env.PORT", 60_000) }, 5000),
      "the production server did not answer within 5 s",
    );
  },
);
test(
  "start: the production server is started only after the development server answers, so Playwright's wait on 4174 covers both",
  { timeout: 30_000 },
  async () => {
    const stamp = (name: string): string =>
      `require("node:fs").writeFileSync("${name}", String(Date.now()));`;
    const copy = fake({
      dev: `setTimeout(() => { ${stamp("dev-up")} ${GOOD.dev} }, 500);`,
      prod: `${stamp("prod-up")} ${GOOD.prod}`,
    });
    const ports = { dev: await free(), prod: await free() };
    const started = await start(copy, ports, 5000);
    assert.ok(typeof started !== "string", "the servers did not start");
    after(() => started.stop());
    const at = (name: string): number =>
      Number(readFileSync(join(copy, name), "utf8"));
    assert.ok(at("prod-up") >= at("dev-up"));
  },
);
test(
  "start: why a server failed is in the message: its output, a missing binary, a kill by signal",
  { timeout: 30_000 },
  async () => {
    const failed = async (
      opts: typeof GOOD,
      ms = 5000,
      bare = false,
    ): Promise<string> => {
      const copy = fake(opts);
      if (bare) rmSync(join(copy, "node_modules", ".bin", "vite"));
      const r = await start(
        copy,
        { dev: await free(), prod: await free() },
        ms,
      );
      if (typeof r !== "string") r.stop();
      assert.equal(typeof r, "string");
      return r as string;
    };
    assert.equal(
      await failed({ ...GOOD, dev: 'console.error("boom"); process.exit(1);' }),
      "the development server exited with 1: boom",
    );
    assert.match(
      await failed(GOOD, 5000, true),
      /^the development server could not be started: /,
    );
    assert.equal(
      await failed({ ...GOOD, dev: 'process.kill(process.pid, "SIGKILL");' }),
      "the development server exited with SIGKILL",
    );
  },
);
test(
  "start: a server that dies after both answered is reported by `died`",
  { timeout: 30_000 },
  async () => {
    const copy = fake({
      ...GOOD,
      // Margin for a loaded runner: it dies at 3 s so prod is surely ready first
      prod: `${LISTEN("process.env.PORT", 0)} setTimeout(() => process.exit(7), 3000);`,
    });
    const started = await start(
      copy,
      { dev: await free(), prod: await free() },
      5000,
    );
    assert.ok(typeof started !== "string", "the servers did not start");
    after(() => started.stop());
    assert.equal(await started.died, "the production server exited with 7");
  },
);
test("the program: SIGTERM after both servers answer ends them and removes the copy", async () => {
  const mine = mkdtempSync(join(tmpdir(), "serve-tmp-"));
  after(() => rmSync(mine, { recursive: true, force: true }));
  const child = spawn(process.execPath, [join(HERE, "consumer-serve.ts")], {
    env: { ...process.env, TMPDIR: mine },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const code = new Promise<number | null>((r) => child.on("close", r));
  await new Promise<void>((ready) =>
    child.stdout.on(
      "data",
      (d: Buffer) => String(d).startsWith("The consumer:") && ready(),
    ),
  );
  child.kill("SIGTERM");
  assert.equal(await code, 0);
  assert.deepEqual(
    readdirSync(mine).filter((n) => n.startsWith("consumer-serve-")),
    [],
  );
  await assert.rejects(fetch("http://127.0.0.1:4174/"));
});
test("the program: an unknown argument is a usage error, a root without a consumer cannot be prepared (exit 3)", () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [join(HERE, "consumer-serve.ts"), ...args], {
      encoding: "utf8",
    });
  assert.equal(run("--nope").status, 2);
  const empty = mkdtempSync(join(tmpdir(), "serve-root-"));
  after(() => rmSync(empty, { recursive: true, force: true }));
  const r = run("--root", empty);
  assert.equal(r.status, 3);
  assert.match(
    r.stdout,
    /^COULD NOT CHECK consumer-serve: svelte-package exited/m,
  );
});
