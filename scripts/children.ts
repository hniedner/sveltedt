// The child processes that tests and gate scripts start. Each leads its own process group, so one signal reaches it and
// everything it started, and a group still running is signalled when this process is told to end or ends itself.
// docs/decisions/003-child-process-groups.md holds the evaluation and the limits.
import {
  spawn,
  type ChildProcess,
  type ChildProcessByStdio,
  type SpawnOptions,
  type SpawnOptionsWithStdioTuple,
} from "node:child_process";
import type { Readable } from "node:stream";

type Piped = ChildProcessByStdio<null, Readable, Readable>;
const running = new Set<ChildProcess>();
const notStarted = new WeakMap<ChildProcess, Error>();
// Children whose group was seen gone: a group id that is free may be reused, so such a group is never signalled again
const gone = new WeakSet<ChildProcess>();
let installed = false;

// A signal to a process that is gone, or one that is not ours, is not an error here: false says it was not sent. EPERM
// counts as gone: on macOS a group that holds only a zombie leader answers EPERM (measured by the adversary)
function send(target: number, signal: NodeJS.Signals | 0): boolean {
  // kill(0) and kill(-0) reach this process's own group, kill(1) and kill(-1) every process we may signal
  if (!Number.isInteger(target) || Math.abs(target) <= 1) return false;
  try {
    return process.kill(target, signal);
  } catch {
    return false;
  }
}
function groupGone(child: ChildProcess): boolean {
  if (child.pid === undefined || gone.has(child)) return true;
  if (send(-child.pid, 0)) return false;
  gone.add(child);
  return true;
}
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Sends `signal` to `child`'s group; does nothing for a child with no pid or a group that is gone. */
export function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid !== undefined && !groupGone(child)) send(-child.pid, signal);
}

function install(): void {
  if (installed) return;
  installed = true;
  process.on("exit", () => {
    for (const c of running) signalGroup(c, "SIGTERM");
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const forward = (): void => {
      for (const c of running) signalGroup(c, signal);
      // Without another listener the signal would have ended this process: it still does, by the same signal
      if (process.listenerCount(signal) === 1) {
        process.off(signal, forward);
        send(process.pid, signal);
      }
    };
    process.on(signal, forward);
  }
}

/** Starts `cmd` as the leader of its own process group; the group is signalled on SIGINT, SIGTERM, SIGHUP and exit. */
export function spawnGroup(
  cmd: string,
  args: string[],
  options: Omit<
    SpawnOptionsWithStdioTuple<"ignore", "pipe", "pipe">,
    "detached"
  >,
): Piped;
export function spawnGroup(
  cmd: string,
  args: string[],
  options?: Omit<SpawnOptions, "detached">,
): ChildProcess;
export function spawnGroup(
  cmd: string,
  args: string[],
  options: Omit<SpawnOptions, "detached"> = {},
): ChildProcess {
  install();
  const child = spawn(cmd, args, { ...options, detached: true });
  // A child that cannot be started has no pid and ends with `close`; its `error` must not end this process
  child.on("error", (e) => notStarted.set(child, e));
  if (child.pid !== undefined) {
    running.add(child);
    // `close` waits for the stdio to end: a grandchild that holds the pipes defers this signal to the group
    child.on("close", () => {
      signalGroup(child, "SIGTERM");
      running.delete(child);
    });
  }
  return child;
}

/** SIGTERM to the group, polls until the group is gone, SIGKILL to the group after `ms`, then polls up to 2 s more;
 * resolves once the group is gone, and throws if it is still there. */
export async function stop(child: ChildProcess, ms = 5000): Promise<void> {
  const { pid } = child;
  if (groupGone(child)) return;
  signalGroup(child, "SIGTERM");
  for (let waited = 0; waited < ms && !groupGone(child); waited += 50)
    await sleep(50);
  if (groupGone(child)) return;
  signalGroup(child, "SIGKILL");
  for (let waited = 0; waited < 2000 && !groupGone(child); waited += 50)
    await sleep(50);
  if (!groupGone(child))
    throw new Error(`process group ${pid} still running after SIGKILL`);
}

/** The first COMPLETE stdout line starting with `prefix`; rejects, with exit and both streams, when `child` closes first.
 * `close` waits for the child's stdio to end, so a grandchild that holds the pipes defers the rejection. */
export function readyLine(child: Piped, prefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += String(d);
      const line = out
        .split("\n")
        .slice(0, -1)
        .find((l) => l.startsWith(prefix));
      if (line !== undefined) resolve(line);
    });
    child.stderr.on("data", (d: Buffer) => (err += String(d)));
    child.on("close", (code, signal) =>
      reject(
        new Error(
          notStarted.has(child)
            ? `could not start ${child.spawnfile}: ${notStarted.get(child)?.message}`
            : `the program ended (exit ${code ?? signal}) before "${prefix}"\nstdout: ${out}\nstderr: ${err}`,
        ),
      ),
    );
  });
}
