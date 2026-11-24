# 003: The gate's children run in their own process groups

Library-first evaluation (method section 8) for ending the child processes that tests and gate scripts start. Facts
were read on 2026-11-24 from the pages named, or measured on Node 26.13.1 with the command named; each is marked
fetched or measured.

## Ending a child and everything it started

- **Need:** issue #238, items 1 and 3: a child that a test starts is ended on every way out (a pass, a failure, a
  timeout, a signal to the test, `process.exit`), together with what it started, and a wait for a child races the
  child's exit.
- **Constraints:** Node 26.13.1 (`.node-version`), macOS and Linux (Windows is not a gate platform); no new dependency
  without a reason (method section 6). Port 4173 stays fixed: the site's address is a spec statement (SRV-05 to SRV-07),
  so the rule against fixed ports does not apply to it.
- **Candidates:**
  - execa 10.2.1 (MIT): 12 direct dependencies, more transitively (registry, fetched). `killDescendants` runs the child
    in its own group and signals the group, so Ctrl-C no longer reaches it. Its page docs/termination.md (fetched) says
    that descendant processes that create their own process group or session (for example, daemons calling `setsid()`)
    escape termination. Not taken: a dependency tree and a second process API for 8 call sites, and it has the same
    nested-group limit.
  - tree-kill 1.2.2 (MIT, no dependencies; registry, fetched): kills a tree by walking the process table. Not taken: it
    kills and starts nothing, forwards no signal and has no exit hook; a table walk is also racier than one group
    signal.
  - signal-exit 4.1.0 (ISC, no dependencies; registry, fetched): an exit and signal hook that fires only when no other
    listener exists. Not taken: inside `consumer-serve`, which has its own handler, it would not forward the signal, the
    case we need.
  - Playwright's `launchProcess` (read from its source): detached, group SIGTERM then SIGKILL, an `exit` handler. Not
    taken: internal, not a public API. Its practice is followed.
  - Node built-ins: `spawn` with `detached`, `process.kill(-pid, signal)`, and `process.on`. `scripts/children.ts` is
    141 lines (measured with `wc -l`; 118 without comments and blank lines).
- **Limits:**
  - Synchronous calls (`spawnSync`, `execFileSync`) are not covered, and a `timeout` bounds them. Measured: a
    `spawnSync` whose child had already exited still blocked 4.18 s, until a grandchild holding the inherited stdout
    ended; with `timeout: 1000` it returned at 1003 ms with ETIMEDOUT. 92 of the 94 synchronous child calls have no
    `timeout`; that is a theme-list line, not part of this decision.
  - `consumer-serve`'s servers stay in its own process group until its own issue moves them onto the helper, so that
    Playwright's group SIGKILL still reaches them.
  - From that move on, a group SIGKILL of `consumer-serve` with no SIGTERM before it (Playwright's exit handler after a
    runner crash, `kill -9`, the out-of-memory killer) does not reach the servers, which then lead groups of their own.
    execa has the same limit (inferred, not tested). Free ports make such a leak harmless to the next run.
  - A child that ignores SIGTERM survives its parent's exit, because the exit handler only signals; `stop` escalates to
    SIGKILL, the exit handler does not.
  - A program that starts a detached child and then returns normally does not exit while the child holds its pipes, so
    its `exit` handler never runs; `--test-force-exit` would cover that case for test files (nothing uses it today; #241
    adds it).
  - `close` waits for a child's stdio to end, so a grandchild that holds the pipes defers `readyLine`'s rejection and
    the close handler's SIGTERM to the group.
- A child with no pid (a spawn that failed) is not registered, but no test can show that check missing: `groupGone` and
  `send` handle a missing pid themselves, so removing the check in `spawnGroup` or in `signalGroup` changes no outcome.
  They are second guards: `-undefined` is NaN, which `send`'s integer guard refuses. `stop` has no check of its own. The
  check in `signalGroup` also narrows `child.pid` to `number` (removing it is a type error), while it changes no runtime
  outcome.
- `stop` throws when a group is still there 2 s after SIGKILL (a process the kernel cannot end). No test pins that
  throw: it needs an unkillable process, and none is built.
- `send` reports every failure as "not sent", and `groupGone` therefore reads EPERM as gone. Measured on macOS (Node
  26.13.1, 2026-11-24): a group that holds only a zombie leader answers EPERM, and ESRCH once it is reaped. A group that
  is alive but not ours cannot occur while the group still exists: the helper only signals groups it started. Once a
  group has no member its id may be reused, so a group that was seen gone is never signalled again (`stop` returns at
  once).
- `send` refuses a target of 0, 1, -1 or one that is not an integer: `kill(-0)` signals the caller's own process group
  (measured: `process.kill(-Number(""), 0)` returns true). That guard is pinned by a test that replaces `process.kill`
  with a mock before it calls `stop` for the bad pids, so none reaches the real call. The same guard on the pid file
  that the test hook reads stays unpinned: pinning it would send SIGKILL to group 0, which would end the gate.
- An `error` event on a child that did start is dropped without a record, because `couldNotStart` is kept only for a
  child with no pid. No caller passes `signal` or `timeout` today, so no such event is expected.
- The test that a second `stop` makes no call proves the skip through the close handler's marking (the child had ended),
  not through `stop`'s own marking after its SIGTERM or SIGKILL.
- The cleanup hooks in `children.test.ts` (the reaper and the pid-file hook) still send SIGKILL to `-pid` when the group
  is gone, so a pid reused within one test would be hit. That is very unlikely and is not guarded.
- EPERM is a permanent "gone" for a child: a group that still had live members and answered EPERM would be abandoned.
  That is unverified and none was seen; the only EPERM case measured is a zombie-only leader on macOS.
- **Decision:** build the helper on Node's built-ins, in `scripts/children.ts`. Reopen it if Windows becomes a gate
  platform, or if `scripts/children.ts` grows past about 150 lines (141 now: a margin of 9; the trigger is already
  close, so raising it, or reopening on the next addition, is for the reviewer to decide).
