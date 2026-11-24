// Tests for children.ts. Every test that starts a process records its pids and kills them (and their groups) in an
// `after` hook, so a red run leaves nothing running.
import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { HERE } from "./gate-step.ts";
import { readyLine, spawnGroup, stop } from "./children.ts";

const IDLE = "setInterval(() => {}, 1000);";
// A child that starts a grandchild whose pid it prints, and then idles
const SPAWN_GRANDCHILD = `const g = require("node:child_process").spawn(process.execPath, ["-e", "${IDLE}"], { stdio: "ignore" }); console.log("grandchild " + g.pid); `;
const WITH_GRANDCHILD = SPAWN_GRANDCHILD + IDLE;
// The same, but the grandchild ignores SIGTERM, and its pid is printed once it says so
const IGNORING_GRANDCHILD = `const g = require("node:child_process").spawn(process.execPath, ["-e", 'process.on("SIGTERM", () => {}); console.log("up"); ${IDLE}'], { stdio: ["ignore", "pipe", "ignore"] }); g.stdout.once("data", () => console.log("grandchild " + g.pid)); ${IDLE}`;
const HELPER = pathToFileURL(join(HERE, "children.ts")).href;

// Kills each pid recorded in the returned list when the test ends
function reaper(): number[] {
  const pids: number[] = [];
  after(() => {
    for (const p of pids) {
      try {
        process.kill(-p, "SIGKILL"); // every recorded child leads a group that holds its grandchildren
      } catch {
        // already gone
      }
    }
  });
  return pids;
}
function begin(pids: number[], ...args: string[]) {
  const child = spawnGroup(process.execPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.pid !== undefined) pids.push(child.pid);
  return child;
}
function pidOf(child: ChildProcess): number {
  assert.ok(child.pid !== undefined, "the child has no pid");
  return child.pid;
}
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
// True once `pid` is gone (polled for `ms`: a signalled process takes a moment)
async function gone(pid: number, ms = 3000): Promise<boolean> {
  for (let i = 0; i < ms / 50 && alive(pid); i++)
    await new Promise((r) => setTimeout(r, 50));
  return !alive(pid);
}
const grandchildOf = async (child: ReturnType<typeof begin>): Promise<number> =>
  Number((await readyLine(child, "grandchild ")).slice("grandchild ".length));
// A program that starts a child with a grandchild through the helper, prints both pids, and then runs `then`
function program(then: string, before = ""): string {
  const dir = mkdtempSync(join(tmpdir(), "children-"));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "program.mjs");
  // The program's child is published at once, so a test that fails before it reads the pids still ends that group
  after(() => {
    const pidFile = join(dir, "child.pid");
    if (!existsSync(pidFile)) return;
    // A pid file that is empty or half written reads as 0, and kill(-0) would signal this process's own group
    const pid = Number(readFileSync(pidFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 1) return;
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  });
  writeFileSync(
    file,
    `import { writeFileSync } from "node:fs";
import { spawnGroup, readyLine } from "${HELPER}";
${before}
const child = spawnGroup(process.execPath, ["-e", ${JSON.stringify(WITH_GRANDCHILD)}], { stdio: ["ignore", "pipe", "pipe"] });
writeFileSync(${JSON.stringify(join(dir, "child.pid"))}, String(child.pid));
const line = await readyLine(child, "grandchild ");
console.log("pids " + child.pid + " " + line.slice("grandchild ".length));
${then}
`,
  );
  return file;
}
async function pidsOf(prog: ReturnType<typeof begin>): Promise<number[]> {
  const [, ...found] = (await readyLine(prog, "pids ")).split(" ");
  return found.map(Number);
}
const closed = (child: ChildProcess): Promise<[number | null, string | null]> =>
  new Promise((r) => child.once("close", (c, s) => r([c, s])));

test(
  "stop ends the child's whole process group, its grandchild too",
  { timeout: 15_000 },
  async () => {
    const pids = reaper();
    const child = begin(pids, "-e", WITH_GRANDCHILD);
    const grandchild = await grandchildOf(child);
    await stop(child);
    assert.ok(await gone(grandchild), "the grandchild is still running");
  },
);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  test(
    `a ${signal} to a program that started groups ends each of them, then the program by that signal`,
    { timeout: 15_000 },
    async () => {
      const pids = reaper();
      const prog = begin(pids, program(IDLE));
      const kids = await pidsOf(prog);
      const ended = closed(prog);
      process.kill(pidOf(prog), signal);
      assert.deepEqual(await ended, [null, signal]);
      for (const p of kids) assert.ok(await gone(p), `${p} is still running`);
    },
  );
}
for (const [how, code, then] of [
  ["process.exit", 3, "process.exit(3);"],
  ["throws", 1, 'throw new Error("boom");'],
] as const) {
  test(
    `a program that exits with a group running signals that group: ${how}`,
    { timeout: 15_000 },
    async () => {
      const pids = reaper();
      const prog = begin(pids, program(then));
      const ended = closed(prog);
      const kids = await pidsOf(prog);
      assert.deepEqual(await ended, [code, null]);
      for (const p of kids) assert.ok(await gone(p), `${p} is still running`);
    },
  );
}
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  test(
    `a ${signal} to a program with a listener of its own is forwarded to the groups without ending the program by it`,
    { timeout: 15_000 },
    async () => {
      const pids = reaper();
      // The first call starts a delayed exit 0; a second call (a re-raised signal) would exit 9
      const own = `let n = 0; process.on("${signal}", () => { if (++n > 1) process.exit(9); setTimeout(() => process.exit(0), 300); });`;
      const prog = begin(pids, program(IDLE, own));
      const kids = await pidsOf(prog);
      const ended = closed(prog);
      process.kill(pidOf(prog), signal);
      assert.deepEqual(await ended, [0, null]);
      for (const p of kids) assert.ok(await gone(p), `${p} is still running`);
    },
  );
}
test(
  "a leader that ends while its grandchild runs: the helper ends the grandchild when the leader closes",
  { timeout: 15_000 },
  async () => {
    const pids = reaper();
    const child = begin(pids, "-e", `${SPAWN_GRANDCHILD} process.exit(0);`);
    const ended = closed(child);
    const grandchild = await grandchildOf(child);
    await ended;
    assert.ok(await gone(grandchild), "the grandchild is still running");
  },
);
test(
  "stop gives a child that handles SIGTERM the time to finish, and returns once it has",
  { timeout: 15_000 },
  async () => {
    const pids = reaper();
    const dir = mkdtempSync(join(tmpdir(), "children-"));
    after(() => rmSync(dir, { recursive: true, force: true }));
    const marker = join(dir, "done");
    const child = begin(
      pids,
      "-e",
      `process.on("SIGTERM", () => setTimeout(() => { require("node:fs").writeFileSync(${JSON.stringify(marker)}, "done"); process.exit(0); }, 200)); console.log("ready"); ${IDLE}`,
    );
    await readyLine(child, "ready");
    const began = Date.now();
    await stop(child);
    assert.ok(existsSync(marker), "the child was ended before it finished");
    assert.ok(Date.now() - began < 4000, "stop waited for its whole grace");
  },
);
test(
  "stop sends SIGKILL after ms to a child that ignores SIGTERM",
  { timeout: 15_000 },
  async () => {
    const pids = reaper();
    const child = begin(
      pids,
      "-e",
      `process.on("SIGTERM", () => {}); console.log("ready"); ${IDLE}`,
    );
    await readyLine(child, "ready");
    await stop(child, 300);
    assert.ok(await gone(pidOf(child), 2000), "the child is still running");
  },
);
test(
  "stop sends SIGKILL to a grandchild that ignores SIGTERM after its leader exits",
  { timeout: 15_000 },
  async () => {
    const pids = reaper();
    const child = begin(
      pids,
      "-e",
      `process.on("SIGTERM", () => process.exit(0)); ${IGNORING_GRANDCHILD}`,
    );
    const grandchild = await grandchildOf(child);
    await stop(child, 300);
    assert.ok(await gone(grandchild, 2000), "the grandchild is still running");
  },
);
test(
  "readyLine: a child that ends first fails with its exit and what it wrote to stderr",
  { timeout: 10_000 },
  async () => {
    const pids = reaper();
    const child = begin(
      pids,
      "-e",
      'console.log("why"); console.error("boom"); process.exit(4)',
    );
    await assert.rejects(
      readyLine(child, "x"),
      /exit 4\)[\s\S]*stdout: why\n\nstderr: boom/,
    );
  },
);
test(
  "readyLine resolves with the whole line when the line arrives in pieces",
  { timeout: 10_000 },
  async () => {
    const pids = reaper();
    const child = begin(
      pids,
      "-e",
      `process.stdout.write("ready: ab"); setTimeout(() => process.stdout.write("cd\\n"), 200);`,
    );
    assert.equal(await readyLine(child, "ready: "), "ready: abcd");
  },
);
test(
  "stop on a child that has ended resolves at once, and a second stop does too",
  { timeout: 5000 },
  async () => {
    const pids = reaper();
    const child = begin(pids, "-e", "0");
    await closed(child);
    const kill = mock.method(process, "kill");
    after(() => kill.mock.restore());
    for (const n of [1, 2]) {
      const began = Date.now();
      await stop(child);
      assert.ok(Date.now() - began < 500, `stop ${n} did not resolve at once`);
      if (n === 1) kill.mock.resetCalls();
    }
    assert.equal(
      kill.mock.callCount(),
      0,
      "the second stop signalled a group that was seen gone",
    );
  },
);
test(
  "an error event of a child that did start does not turn the rejection into could-not-start",
  { timeout: 5000 },
  async () => {
    const pids = reaper();
    const child = begin(pids, "-e", "process.exit(4)");
    child.emit("error", new Error("late"));
    await assert.rejects(readyLine(child, "x"), /the program ended \(exit 4\)/);
  },
);
test(
  "stop never signals group 0, 1 or a pid that is not an integer: no call reaches kill",
  { timeout: 5000 },
  async () => {
    // kill is replaced before anything runs: a bad target must never reach the real one, which would signal our own group
    const kill = mock.method(process, "kill", () => true);
    after(() => kill.mock.restore());
    for (const pid of [0, 1, 1.5, Number.NaN]) {
      await stop({ pid } as ChildProcess, 0);
      assert.equal(kill.mock.callCount(), 0, `stop signalled the pid ${pid}`);
    }
  },
);
test(
  "a child that cannot be spawned: no throw, stop resolves at once, readyLine rejects naming the command and the error",
  { timeout: 5000 },
  async () => {
    const child = spawnGroup("/nonexistent", [], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const rejected = assert.rejects(
      readyLine(child, "x"),
      /could not start \/nonexistent: spawn \/nonexistent ENOENT/,
    );
    const began = Date.now();
    await stop(child);
    assert.ok(Date.now() - began < 500, "stop did not resolve at once");
    await rejected;
  },
);
