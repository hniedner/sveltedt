# 003: The gate's children run in their own process groups

Library-first evaluation (method section 8) for ending the child processes that tests and gate scripts start. Facts
were read on 2026-11-24 from the pages named, or measured on Node 26.13.1 with the command named; each is marked
fetched or measured.

## Ending a child and everything it started

- **Need:** issue #238, items 1 and 3: a child that a test starts is ended on every way out (a pass, a failure, a
  timeout, a signal to the test, `process.exit`), together with what it started, and a wait for a child races the
  child's exit.
- **Constraints:** Node 26.13.1 (`.node-version`), macOS and Linux (Windows is not a gate platform); no new
  dependency without a reason (method section 6).
- **Candidates:**
  - execa 10.2.1 (MIT): 12 direct dependencies, more transitively (registry, fetched). `killDescendants` runs the
    child in its own group and signals the group, so Ctrl-C no longer reaches it. Its docs say "Descendants that call
    setsid() ... escape termination" (docs/termination.md, fetched). Not taken: a dependency tree and a second process
    API for 8 call sites, to replace about 40 lines, and it has the same nested-group limit.
  - tree-kill 1.2.2 (MIT, no dependencies; registry, fetched): kills a tree by walking the process table. Not taken: it
    kills and starts nothing, forwards no signal and has no exit hook; a table walk is also racier than one group
    signal.
  - signal-exit 4.1.0 (ISC, no dependencies; registry, fetched): an exit and signal hook that fires only when no other
    listener exists. Not taken: inside `consumer-serve`, which has its own handler, it would not forward the signal,
    the case we need.
  - Playwright's `launchProcess` (measured by reading its source): detached, group SIGTERM then SIGKILL, an `exit`
    handler. Not taken: internal, not a public API. Its practice is followed.
  - Node built-ins: `spawn` with `detached`, `process.kill(-pid, signal)`, and `process.on`. About 90 lines.
- **Limits:**
  - Synchronous calls (`spawnSync`, `execFileSync`) are not covered, and a `timeout` bounds them. Measured: a
    `spawnSync` whose child had already exited still blocked 4.18 s, until a grandchild holding the inherited stdout
    ended; with `timeout: 1000` it returned at 1003 ms with ETIMEDOUT. 92 of the 94 synchronous child calls have no
    `timeout`; that is a theme-list line, not part of this decision.
  - `consumer-serve`'s servers stay in its own process group until its own issue moves them onto the helper, so that
    Playwright's group SIGKILL still reaches them.
  - From that move on, a group SIGKILL of `consumer-serve` with no SIGTERM before it (Playwright's exit handler after a
    runner crash, `kill -9`, the out-of-memory killer) does not reach the servers, which then lead groups of their own.
    execa has the same limit. Free ports make such a leak harmless to the next run.
  - A child that ignores SIGTERM survives its parent's exit, because the exit handler only signals; `stop` escalates to
    SIGKILL, the exit handler does not.
  - A program that starts a detached child and then returns normally does not exit while the child holds its pipes, so
    its `exit` handler never runs; `--test-force-exit` covers that case for test files.
- A child with no pid (a spawn that failed) is not registered, but no test can show that check missing: `signalGroup`
  guards a missing pid itself, so removing the check in `spawnGroup` changes no outcome. It is a second guard, not a
  behaviour a test could pin.
- `stop` throws when a group is still there 2 s after SIGKILL (a process the kernel cannot end). No test pins that throw:
  it needs an unkillable process, and none is built.
- **Decision:** build the helper on Node's built-ins, in `scripts/children.ts`. Reopen it if Windows becomes a gate
  platform, or if the helper grows past about 150 lines.
