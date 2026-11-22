// Tests for check-repo.ts: the hooks and the commit-range steps. Fixtures in check-repo.fixture.ts.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { test } from "node:test";
import { GATE_VARS } from "./gate-step.ts";
import {
  GIT_ENV,
  PACKAGE,
  type RunOptions,
  SUPPRESSIONS,
  branch,
  commit,
  edit,
  expect,
  fakeLint,
  fakePnpm,
  fakeVersion,
  fakeZizmor,
  git,
  here,
  isolatedHome,
  put,
  remove,
  repo,
  run,
  scanBranch,
  sitePackage,
  tempDir,
} from "./check-repo.fixture.ts";

/** Makes `root` sign with a new ssh key and show signatures in its log, as a contributor's configuration may. */
function signing(root: string): void {
  const key = join(tempDir(), "key");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
  git(root, "config", "gpg.format", "ssh");
  git(root, "config", "user.signingkey", key);
  git(root, "config", "log.showSignature", "true");
}
const notApplicable = (args: string[], opts?: RunOptions): void => {
  const r = run(args, opts);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1) ?? "",
    /^NOT APPLICABLE /,
    r.out,
  );
};

test("secrets: passes when the wrapper passes the branch's range, and names it", () => {
  assert.match(
    expect("secrets", scanBranch(0), 0),
    /scan-secrets git \S+ [0-9a-f]{40}\.\.HEAD/,
  );
});
test("secrets: a finding of the wrapper is a finding", () => {
  assert.match(expect("secrets", scanBranch(1), 1), /^ {2}scan-secrets git /m);
});
test("secrets: a wrapper that could not check cannot be checked", () => {
  expect("secrets", scanBranch(3), 3);
});
test("secrets: a branch with no commit after origin/main is not applicable", () => {
  notApplicable(["secrets", "--root", repo()]);
});
test("secrets: a repository without origin/main cannot be checked", () => {
  const root = scanBranch(0);
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  expect("secrets", root, 3);
});
test("secrets: CI's range from GATE_BASE and GATE_HEAD is the one scanned", () => {
  const root = scanBranch(0);
  const base = git(root, "rev-parse", "HEAD~1").trim();
  const out = expect("secrets", root, 0, {
    extraEnv: { GATE_BASE: base, GATE_HEAD: "HEAD" },
  });
  assert.ok(out.includes(`${base}..HEAD`), out);
});
test("secrets: a GATE_BASE of all zeros cannot be checked", () => {
  const root = scanBranch(0);
  const out = expect("secrets", root, 3, {
    extraEnv: { GATE_BASE: "0".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /all zeros/);
});
test("secrets: a GATE_BASE git does not know cannot be checked", () => {
  const out = expect("secrets", scanBranch(0), 3, {
    extraEnv: { GATE_BASE: "1".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /git cannot read the range/);
});
test("secrets: in CI, a missing GATE_BASE cannot be checked (no fallback to the local range)", () => {
  const out = expect("secrets", scanBranch(0), 3, {
    extraEnv: { GITHUB_ACTIONS: "true" },
  });
  assert.match(out, /GATE_BASE/);
});
test("secrets: in CI, an empty range cannot be checked, never NOT APPLICABLE", () => {
  const root = scanBranch(0);
  expect("secrets", root, 3, {
    extraEnv: { GITHUB_ACTIONS: "true", GATE_BASE: "HEAD", GATE_HEAD: "HEAD" },
  });
});

test("commits: passes when every commit after origin/main has a conventional header", () => {
  expect(
    "commits",
    branch("feat: add a thing", "fix(table)!: change a thing"),
    0,
  );
});
test("commits: a type outside the list is a finding", () => {
  expect("commits", branch("feature: add a thing"), 1);
});
test("commits: a header over 100 characters is a finding", () => {
  expect("commits", branch(`feat: ${"x".repeat(95)}`), 1);
});
/** Makes `side` from `from` with one commit `subject`, then merges it into the branch with git's own header. */
function mergeSide(root: string, from: string, subject: string): void {
  git(root, "checkout", "-q", "-b", "side", from);
  commit(root, subject);
  git(root, "checkout", "-q", "-");
  git(
    root,
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.org",
    "-c",
    "core.hooksPath=/dev/null",
    "merge",
    "-q",
    "--no-ff",
    "-m",
    "Merge branch 'side'",
    "side",
  );
}
test("commits: a merge commit is not checked", () => {
  const root = branch("feat: on the branch");
  mergeSide(root, "HEAD~1", "fix: on the side");
  expect("commits", root, 0);
});
test("commits: a branch that merged main is not judged by main's plain subjects", () => {
  // Older main history has plain subjects. Only commits after the merge base with origin/main count.
  const root = branch("feat: on the branch");
  mergeSide(root, "refs/remotes/origin/main", "Add a plain subject on main");
  git(root, "update-ref", "refs/remotes/origin/main", "side");
  const main = git(root, "rev-parse", "side").trim();
  assert.match(expect("commits", root, 0), /^PASS commits: 1 commit\(s\)/m);
  expect("commits", root, 0, {
    extraEnv: { GATE_BASE: main, GATE_HEAD: "HEAD" },
  });
});
test("commits: a branch with no commit after origin/main is not applicable", () => {
  notApplicable(["commits", "--root", repo()]);
});
test("commits: in CI, an empty range cannot be checked, never NOT APPLICABLE", () => {
  expect("commits", repo(), 3, {
    extraEnv: { GITHUB_ACTIONS: "true", GATE_BASE: "HEAD", GATE_HEAD: "HEAD" },
  });
});
test("commits: a repository without origin/main cannot be checked", () => {
  const root = branch("feat: x");
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  expect("commits", root, 3);
});
test("commits: CI's range from GATE_BASE and GATE_HEAD is the one checked", () => {
  const root = branch("Add a thing", "feat: fine");
  const base = git(root, "rev-parse", "HEAD~1").trim();
  expect("commits", root, 0, {
    extraEnv: { GATE_BASE: base, GATE_HEAD: "HEAD" },
  });
});
// Pins: the step never judges commits it cannot read. A base of all zeros (a new branch pushed in CI) and a base git
// does not know (a shallow clone, a force-pushed base) both stop the step.
test("commits: a GATE_BASE of all zeros cannot be checked", () => {
  const out = expect("commits", branch("feat: x"), 3, {
    extraEnv: { GATE_BASE: "0".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /GATE_BASE is all zeros/);
});
test("commits: a GATE_BASE git does not know cannot be checked", () => {
  const out = expect("commits", branch("feat: x"), 3, {
    extraEnv: { GATE_BASE: "1".repeat(40), GATE_HEAD: "HEAD" },
  });
  assert.match(out, /^COULD NOT CHECK commits: git log /m);
});
// Pins: a refusal names the bad commit only, counts it against the range, and prints the allowed types.
test("commits: a refused header is named alone, with the count and the allowed types", () => {
  const out = expect("commits", branch("feat: fine", "Add the thing"), 1);
  assert.match(out, /^FINDING commits: 1 of 2 commit\(s\)$/m);
  assert.match(
    out,
    /build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test/,
  );
  assert.doesNotMatch(out, /feat: fine/);
});
// Pins: only a real merge is left out; a one-parent commit that only looks like one is judged.
test("commits: a commit headed like a merge but with one parent is a finding", () => {
  expect("commits", branch("Merge the thing"), 1);
});
// Pins: the header is the first line as git reads it. A body line right below the subject is not part of it (git's
// %s would join them).
test("commits: the header is the first line, even with a body line right below it", () => {
  expect("commits", branch(`feat: one\n${"x".repeat(100)}`), 0);
});
// Pins: git's own revert headers are judged by the header they wrap; autosquash commits never reach a pull request.
test("commits: git's Revert and Reapply headers pass when the header they wrap does", () => {
  expect(
    "commits",
    branch('Revert "feat: a thing"', 'Reapply "feat: a thing"'),
    0,
  );
  expect("commits", branch('Revert "Add a thing"'), 1);
});
test("commits: a fixup, squash or amend commit is a finding", () => {
  for (const h of ["fixup! feat: x", "squash! feat: x", "amend! feat: x"]) {
    const out = expect("commits", branch(h), 1);
    assert.match(out, /squash it before the pull request/);
  }
});
// Pins: the header prefixes configured for Dependabot (.github/dependabot.yml) pass the grammar.
test("commits: Dependabot's headers pass", () => {
  expect(
    "commits",
    branch(
      "ci(deps): bump actions/checkout from 4 to 5",
      "build(deps-dev): bump x from 1.0.0 to 1.0.1",
    ),
    0,
  );
});
// Pins: the length limit is at most 100 characters, not fewer.
test("commits: a header of exactly 100 characters passes", () => {
  expect("commits", branch(`feat: ${"x".repeat(94)}`), 0);
});

// Pins: a commit with an empty message (`--allow-empty-message`) is refused, shown as an empty header.
test("commits: a commit with an empty message is a finding", () => {
  const root = repo();
  commit(root, "", "--allow-empty-message");
  assert.match(expect("commits", root, 1), /^ {2}\w+ "": not /m);
});
// Pins: a first line starting with "#" is the header, not a comment the step skips.
test("commits: a stored first line starting with # is refused, whatever follows", () => {
  expect("commits", branch("#123 fix the thing\n\nfeat: in the body"), 1);
});
test("commits: git's Revert of a merge header and a nested Revert pass", () => {
  expect(
    "commits",
    branch(
      'Revert "Merge pull request #43 from a/b"',
      'Revert "Revert "feat: x""',
    ),
    0,
  );
});
test("commits: a message holding a control separator is judged, not a crash", () => {
  expect("commits", branch("feat: a\u001eb"), 0);
});
test("commits: the finding names the bad commit's own hash", () => {
  // The bad commit is the older one: git log lists the newest first, so naming the first record would be wrong.
  const root = branch(
    "Add the thing\n\nA body line.",
    "feat: fine\n\nAnother body line.",
  );
  const out = expect("commits", root, 1);
  assert.match(
    out,
    new RegExp(
      `^  ${git(root, "rev-parse", "--short", "HEAD~1").trim()} "Add the thing"`,
      "m",
    ),
  );
});
// Pins: every type of TYPES passes the step.
test("commits: every allowed type passes", () => {
  const types = [
    "build",
    "chore",
    "ci",
    "docs",
    "feat",
    "fix",
    "perf",
    "refactor",
    "revert",
    "style",
    "test",
  ];
  expect("commits", branch(...types.map((t) => `${t}: a change`)), 0);
});
// Pins: the header grammar. Each is a normal contributor's slip, refused, and so are a leading space or byte-order
// mark, which git keeps in the stored header.
test("commits: a malformed header is a finding", () => {
  const slips = [
    "feat(): x",
    "fix(Table): x",
    "fix(a/b): x",
    "feat:x",
    "feat:  x",
    " feat: x",
    "\uFEFFfeat: x",
  ];
  assert.match(
    expect("commits", branch(...slips), 1),
    new RegExp(
      `^FINDING commits: ${slips.length} of ${slips.length} commit\\(s\\)$`,
      "m",
    ),
  );
});
// Pins: a bad first line is not rescued by a conventional line below it.
test("commits: a bad first line is a finding even with a conventional line below it", () => {
  expect("commits", branch("Add a thing\n\nfeat: in the body"), 1);
});
// Pins: in a message stored as written (`--cleanup=verbatim`, or a commit made through an API), blank lines before
// the header, trailing blanks and a Windows line end are not part of it; git's own clean-up would remove them first.
test("commits: blank lines before the header, trailing blanks and CRLF are not part of it", () => {
  const root = repo();
  commit(root, `\n \t\nfeat: ${"x".repeat(94)}   \r\n`, "--cleanup=verbatim");
  expect("commits", root, 0);
});
// Pins: only ASCII blanks make a line blank, as in git; a line of a no-break space or a byte-order mark is the header.
test("commits: a first line of a no-break space or a byte-order mark is the header", () => {
  const out = expect(
    "commits",
    branch("\u00a0\nfeat: x", "\ufeff\nfeat: y"),
    1,
  );
  assert.match(out, /2 of 2 commit\(s\)/);
});
// Pins: the 100 characters count the header as written, a revert's wrapping included; nesting and quotes inside are
// judged by the innermost header.
test("commits: git's Revert headers: nesting, quotes, and the length as written", () => {
  expect(
    "commits",
    branch('Revert "fix: stop "null" ids"', `Revert "feat: ${"x".repeat(85)}"`),
    0,
  );
  const out = expect(
    "commits",
    branch('Revert "Revert "Add x""', `Revert "feat: ${"x".repeat(86)}"`),
    1,
  );
  assert.match(out, /2 of 2 commit\(s\)/);
});
// Pins: a refused header is printed with its control characters escaped.
test("commits: control characters in a refused header are printed escaped", () => {
  const raw = [
    "\u001b",
    "\u007f",
    "\u009b",
    "\u00ad",
    "\u061c",
    "\u200b",
    "\u200f",
    "\u2028",
    "\u202e",
    "\u2060",
    "\u2066",
    "\ufeff",
  ];
  const out = expect("commits", branch(`Add x${raw.join("")}[2K\rspoof`), 1);
  for (const c of raw) {
    assert.ok(!out.includes(c), JSON.stringify(c));
    assert.ok(
      out.includes(`\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`),
      JSON.stringify(c),
    );
  }
});
// Pins: a contributor's `log.showSignature` does not change what the step reads: a signed commit is judged by its
// header, not by the signature text git prints before it.
test("commits: a signed commit is judged by its header when git shows signatures", () => {
  const root = repo();
  signing(root);
  commit(root, "feat: signed", "-S");
  expect("commits", root, 0);
});
// Pins: GATE_BASE is read as a revision, never as a git option.
test("commits and secrets: a GATE_BASE shaped like a git option cannot be checked", () => {
  for (const step of ["commits", "secrets"]) {
    const written = join(tempDir(), "written");
    expect(step, branch("feat: x"), 3, {
      extraEnv: { GATE_BASE: `--output=${written}`, GATE_HEAD: "HEAD" },
    });
    assert.ok(!existsSync(`${written}..HEAD`), step);
  }
});
// Pins: a header is read in time linear in its length, so a long run of blanks cannot stall the gate.
test("commits: a header of 200,000 blanks and one character is judged at once", () => {
  const root = branch(`${" ".repeat(200_000)}x`);
  const start = Date.now();
  expect("commits", root, 1);
  assert.ok(Date.now() - start < 5000, `${Date.now() - start} ms`);
});
// Pins: a header too long to read is shown cut short, with its full length named.
test("commits: a very long header is shown shortened, with its length", () => {
  const out = expect("commits", branch(`feat: ${"x".repeat(19994)}`), 1);
  assert.match(out, /20000 characters, more than 100/);
  assert.ok(out.length < 1000, `${out.length} characters of output`);
});

/** Runs the commit-msg entry on a message file holding `text`. */
function commitMsg(text: string, code: number): string {
  const file = join(tempDir(), "COMMIT_EDITMSG");
  writeFileSync(file, text);
  // The scanner on the PATH is the pinned one: a passing message is scanned by the real gitleaks.
  const r = run(["commit-msg", file], { gitleaks: "" });
  assert.equal(r.code, code, r.out);
  return r.out;
}
/** A token of GitHub's personal-access-token shape, built at run time so this file holds none. */
const fakeToken = (): string =>
  `ghp_${randomBytes(27).toString("base64url").replace(/[-_]/g, "x").slice(0, 36)}`;
// Pins: a secret in the body of a message is a finding, so it never reaches the history (the range scan of a push
// cannot see it: it was measured to pass gitleaks' git scan).
test("commit-msg: a secret in the message body is a finding that names no value", () => {
  const out = commitMsg(`feat: add a thing\n\nThe key is ${fakeToken()}\n`, 1);
  assert.match(out, /^ +FINDING scan-secrets: /m);
  assert.match(out, /^FINDING commit-msg: secrets in the message$/m);
  assert.doesNotMatch(out, /ghp_/);
});
// Pins: the hook passes a conventional header and refuses one that is not, by the step's rule.
test("commit-msg: a conventional header passes, one without a type is a finding", () => {
  commitMsg("feat: add a thing\n\nThe body.\n", 0);
  assert.match(commitMsg("Add a thing\n", 1), /^FINDING commit-msg: /m);
});
// Pins: a header starting with `Merge ` or with an autosquash prefix (--fixup, --squash, --fixup=amend:) passes the
// hook before any other rule, the 100 characters included; the gate refuses the autosquash ones (above).
test("commit-msg: git's merge header and fixup, squash and amend headers pass, whatever they hold", () => {
  commitMsg("Merge branch 'main' into chore/hooks\n", 0);
  for (const h of ["fixup!", "squash!", "amend!"])
    commitMsg(`${h} feat: ${"x".repeat(95)}\n`, 0);
  commitMsg("fixup! Add a thing\n", 0);
});
// Pins: the scan reads the message whatever its header, a merge or autosquash one included, and the comment lines
// that `commit -m` keeps.
test("commit-msg: a secret under a merge header or in a comment line is a finding too", () => {
  for (const text of [
    `Merge branch 'main'\n\n${fakeToken()}\n`,
    `fixup! feat: x\n\n${fakeToken()}\n`,
    `feat: x\n# ${fakeToken()}\n`,
  ])
    assert.match(
      commitMsg(text, 1),
      /^FINDING commit-msg: secrets in the message$/m,
    );
});
// Pins: nothing below the scissors line is the message, so a diff there that holds a token is not scanned.
test("commit-msg: a token below the scissors line passes", () => {
  commitMsg(
    `feat: x\n\n# ------------------------ >8 ------------------------\n+${fakeToken()}\n`,
    0,
  );
});
// Pins: the folder the message was scanned in is gone afterwards, on a pass and on a finding.
test("commit-msg: the temporary folder of the scan is removed", () => {
  for (const [token, code] of [
    ["", 0],
    [fakeToken(), 1],
  ] as const) {
    const tmp = tempDir();
    const file = join(tempDir(), "COMMIT_EDITMSG");
    writeFileSync(file, `feat: x\n\n${token}\n`);
    const r = run(["commit-msg", file], {
      gitleaks: "",
      extraEnv: { TMPDIR: tmp },
    });
    assert.equal(r.code, code, r.out);
    assert.deepEqual(readdirSync(tmp), [], r.out);
  }
});
// Pins: git hands the hook its editor template (lines starting with #) and, with -v, a scissors line and the diff
// below it (measured): comment lines are not the header, and nothing below the scissors line is read.
test("commit-msg: comment lines and everything below the scissors line are not read", () => {
  commitMsg("# a comment\nfeat: x\n# another\n", 0);
  commitMsg(
    "feat: x\n# ------------------------ >8 ------------------------\nAdd y\n",
    0,
  );
  commitMsg(
    "# ------------------------ >8 ------------------------\nfeat: below\n",
    1,
  );
});
// Pins: a message of nothing but comments or blanks is refused as empty, with the reason, not as a bad header.
test("commit-msg: an empty message is a finding that says so", () => {
  for (const text of ["", "\n\n", "# Please enter the commit message\n#\n"])
    assert.match(
      commitMsg(text, 1),
      /^FINDING commit-msg: the message is empty \(lines starting with # are comments\)$/m,
    );
});
// Pins: the hook escapes what it prints when it passes and when it cannot read the file (a finding's text comes from
// the headerProblem the `commits` rows pin).
test("commit-msg: control characters are printed escaped when it passes and when it cannot read", () => {
  const passed = commitMsg("feat: a‮x\n", 0);
  assert.ok(!passed.includes("‮"), passed);
  assert.match(passed, /^PASS commit-msg: "feat: a\\u202ex"$/m);
  const r = run(["commit-msg", join(tempDir(), "absent‮x")]);
  assert.equal(r.code, 2, r.out);
  assert.ok(!r.out.includes("‮"), r.out);
  assert.match(
    r.out,
    /^USAGE commit-msg: cannot read the message file ".*absent\\u202ex": ENOENT$/m,
  );
});
// Pins: a hook run without its argument says so, never "undefined".
test("commit-msg: no message file is a usage error that says so", () => {
  const r = run(["commit-msg"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /^USAGE commit-msg: no message file given$/m);
});
test("hooks: passes when core.hooksPath is .githooks and every hook is the executable shim", () => {
  const out = expect("hooks", repo(), 0);
  assert.match(
    out,
    /^PASS hooks: core\.hooksPath \.githooks; pre-commit, commit-msg, pre-push as shims$/m,
  );
});
test("hooks: a local .githooks over another global core.hooksPath passes", () => {
  const root = repo();
  expect("hooks", root, 0, {
    extraEnv: isolatedHome("[core]\n\thooksPath = /opt/global\n"),
  });
});
test("hooks: an empty core.hooksPath is a finding that shows the empty value", () => {
  const root = repo();
  git(root, "config", "core.hooksPath", "");
  assert.match(expect("hooks", root, 1), /core\.hooksPath is "" \(file:/);
});
test("hooks: an unset core.hooksPath is a finding that gives the command", () => {
  const root = repo();
  git(root, "config", "--unset", "core.hooksPath");
  assert.match(
    expect("hooks", root, 1, { extraEnv: isolatedHome() }),
    /core\.hooksPath is unset: run \.\/scripts\/setup/,
  );
});
test("hooks: another local core.hooksPath is a finding that says setup will not replace it and how to proceed", () => {
  const root = repo();
  git(root, "config", "core.hooksPath", "/opt/mine");
  const out = expect("hooks", root, 1);
  assert.match(
    out,
    /core\.hooksPath is "\/opt\/mine" \(file:\S*\.git\/config\)/,
  );
  assert.match(out, /\.\/scripts\/setup will not replace it/);
  assert.match(out, /git config core\.hooksPath \.githooks/);
  assert.match(out, /whose hooks then stop running in this clone/);
  assert.doesNotMatch(out, /unset/);
});
test("hooks: another global core.hooksPath is a finding that names the global file", () => {
  const root = repo();
  git(root, "config", "--unset", "core.hooksPath");
  const out = expect("hooks", root, 1, {
    extraEnv: isolatedHome("[core]\n\thooksPath = /opt/global\n"),
  });
  assert.match(
    out,
    /core\.hooksPath is "\/opt\/global" \(file:\S*\.gitconfig\)/,
  );
  assert.match(out, /\.\/scripts\/setup will not replace it/);
});
test("hooks: a git that cannot read its configuration is COULD NOT CHECK, not an unset path", () => {
  const root = repo();
  // A git first on the PATH that fails `config` (as it does on a broken configuration file) and is git otherwise.
  const bin = tempDir();
  const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  put(
    bin,
    "git",
    `#!/bin/sh\ncase " $* " in *" config "*) echo "fatal: bad config line 1" >&2; exit 128;; esac\nexec ${real} "$@"\n`,
  );
  chmodSync(join(bin, "git"), 0o755);
  const out = expect("hooks", root, 3, {
    extraEnv: { PATH: `${bin}${delimiter}${GIT_ENV.PATH ?? ""}` },
  });
  assert.match(out, /git cannot read core\.hooksPath: fatal: bad config/);
  assert.doesNotMatch(out, /unset/);
});
test("hooks: a hook that is not executable is a finding", () => {
  const out = expect(
    "hooks",
    repo((root) => chmodSync(join(root, ".githooks", "commit-msg"), 0o644)),
    1,
  );
  assert.match(out, /\.githooks\/commit-msg: not executable/);
});
test("hooks: a hook that cannot be opened is COULD NOT CHECK, naming the reason", () => {
  const root = repo();
  // A link to itself fails to open for every user, root included
  const f = join(root, ".githooks", "commit-msg");
  rmSync(f);
  symlinkSync("commit-msg", f);
  const out = expect("hooks", root, 3);
  assert.match(out, /\.githooks\/commit-msg cannot be opened: ELOOP/);
});
test("hooks: a hook that is not the shim is a finding", () => {
  const out = expect(
    "hooks",
    repo(edit(".githooks/pre-commit", "exec ", "true || exec ")),
    1,
  );
  assert.match(out, /\.githooks\/pre-commit: not the two-line shim/);
});
test("hooks: a missing hook is a finding", () => {
  const out = expect("hooks", repo(remove(".githooks/pre-commit")), 1);
  assert.match(out, /\.githooks\/pre-commit: missing/);
});
const inCI = { extraEnv: { GITHUB_ACTIONS: "true" } };
test("hooks: in CI only the shims are checked, and the pass line names core.hooksPath as not checked", () => {
  const root = repo();
  git(root, "config", "--unset", "core.hooksPath");
  const out = expect("hooks", root, 0, inCI);
  assert.match(
    out,
    /^PASS hooks: pre-commit, commit-msg, pre-push as shims; core\.hooksPath not checked \(CI has no clone-local git configuration\)$/m,
  );
});
test("hooks: in CI a shim that is not executable is a finding", () => {
  const out = expect(
    "hooks",
    repo((root) => chmodSync(join(root, ".githooks", "pre-commit"), 0o644)),
    1,
    inCI,
  );
  assert.match(out, /\.githooks\/pre-commit: not executable/);
});
test("hooks: a file in .githooks that is not a known shim is a finding, in CI and in a clone", () => {
  for (const opts of [inCI, undefined]) {
    const out = expect(
      "hooks",
      repo((root) => put(root, ".githooks/post-checkout", "#!/bin/sh\n")),
      1,
      opts,
    );
    assert.match(out, /\.githooks\/post-checkout: not a known hook/);
  }
});
test("hooks: an untracked file in .githooks (a Finder .DS_Store) is not a finding", () => {
  const root = repo();
  put(root, ".githooks/.DS_Store", "x"); // untracked: a listing by readdir would see it
  const out = expect("hooks", root, 0);
  assert.doesNotMatch(out, /DS_Store/);
});

/**
 * A fixture holding its own hook shims, configs and canaries, so git runs the real hooks and gate there. The runner
 * the shims call is this repository's own file (a symlink): the fixture runs the code under test, never a copy, and
 * the coverage report counts its lines.
 */
function hooked(change: (root: string) => void = () => {}): string {
  const root = repo((r) => {
    mkdirSync(join(r, "scripts"), { recursive: true });
    for (const f of [
      "scripts/check-repo.ts",
      "scripts/gate-step.ts",
      "scripts/pinned.ts",
      "scripts/trace.ts",
    ])
      symlinkSync(join(here, "..", f), join(r, f));
    for (const f of [
      "eslint.config.mjs",
      "tsconfig.json", // leaves the canaries to ESLint's default project
    ])
      put(r, f, readFileSync(join(here, "..", f)));
    cpSync(join(here, "canaries"), join(r, "scripts", "canaries"), {
      recursive: true,
    });
    change(r);
  });
  commit(root, "chore: add the runner");
  return root;
}
/** git with the hooks on, as a contributor runs it; the tools are the run() fakes. */
function hookGit(
  root: string,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): { code: number | null; out: string } {
  const env: NodeJS.ProcessEnv = {
    ...GIT_ENV,
    // The hook runs `node` from PATH: this test's own Node goes first. No global or system git configuration
    // (a core.commentChar or commit.template there changes what git hands the hook).
    PATH: `${dirname(process.execPath)}${delimiter}${GIT_ENV.PATH ?? ""}`,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    ACTIONLINT_BIN: fakeLint(),
    PNPM_BIN: fakePnpm(),
    ZIZMOR_BIN: fakeZizmor(),
    GITLEAKS_BIN: fakeVersion("gitleaks", "9.9.9"),
    ...extraEnv,
  };
  for (const k of GATE_VARS) delete env[k];
  const r = spawnSync(
    "git",
    [
      ...["-C", root, "-c", "user.name=Fixture"],
      ...["-c", "user.email=fixture@example.org", "-c", "commit.gpgsign=false"],
      ...args,
    ],
    // Bounded: an editor git opened by mistake would otherwise wait for input forever.
    { encoding: "utf8", env, timeout: 30_000 },
  );
  return { code: r.status, out: r.stdout + r.stderr };
}
const gitCommit = (root: string, ...args: string[]) =>
  hookGit(root, ["commit", "-q", ...args]);
const head = (root: string): string =>
  git(root, "log", "-1", "--format=%s").trim();
/** The secret scan replaced by one that names every file of the folder it is given and passes, or finds `leak`. */
const listingScan = (root: string): void =>
  put(
    root,
    "scripts/scan-secrets.ts",
    `import { readdirSync, readFileSync } from "node:fs";
const [mode, dir] = process.argv.slice(2);
const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
console.log("scan-secrets " + mode + " " + files.map((e) => e.name).sort().join(","));
if (files.some((e) => readFileSync(e.parentPath + "/" + e.name, "utf8").includes("leak"))) {
  console.log("FINDING scan-secrets: 1 leak(s)");
  process.exitCode = 1;
}
`,
  );

test("pre-commit: a formatted staged file commits; the scan sees only the staged files; stages without a file of their kind are not applicable", () => {
  const root = hooked(listingScan);
  put(root, "notes/a.md", "# A note\n");
  put(root, "notes/unstaged.md", "#  Not staged\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: add a note");
  assert.equal(r.code, 0, r.out);
  assert.equal(head(root), "docs: add a note");
  assert.match(r.out, /^PASS format: /m);
  assert.match(r.out, /^PASS text: .*in 1 staged file\(s\)/m);
  assert.match(r.out, /^NOT APPLICABLE lint: /m);
  assert.match(r.out, /^NOT APPLICABLE lockfile: /m);
  assert.match(r.out, /^NOT APPLICABLE workflows: /m);
  assert.match(r.out, /^\s*scan-secrets dir a\.md$/m);
  assert.match(r.out, /^PASS pre-commit: /m);
});
test("pre-commit: an unformatted staged file blocks the commit", () => {
  const root = hooked();
  put(root, "notes/a.md", "#  A note\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: add a note");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING format: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: git commit -a checks the changes -a stages", () => {
  const root = hooked();
  put(root, "README.md", "#  Fixture\n");
  const r = gitCommit(root, "-a", "-m", "docs: reword the readme");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^\s*README\.md\b/m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: git commit -a scans the content of the files -a stages, and only those", () => {
  const root = hooked(listingScan);
  put(root, "README.md", "# Fixture\n\nA leak.\n");
  put(root, "notes/untracked.md", "# Untracked\n");
  const r = gitCommit(root, "-a", "-m", "docs: reword the readme");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^\s*scan-secrets dir README\.md$/m);
  assert.match(r.out, /^FINDING secrets: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: git commit <path> checks that path only, whatever else is changed or staged", () => {
  const root = hooked();
  put(root, "README.md", "#  Fixture\n");
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: add a note", "--", "notes/a.md");
  assert.equal(r.code, 0, r.out);
  assert.equal(head(root), "docs: add a note");
  const bad = gitCommit(root, "-m", "docs: reword", "--", "README.md");
  assert.notEqual(bad.code, 0, bad.out);
  assert.match(bad.out, /^\s*README\.md\b/m);
  assert.equal(head(root), "docs: add a note");
});
test("pre-commit: a staged file changed again before the commit cannot be checked, and is named", () => {
  const root = hooked();
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  put(root, "notes/a.md", "#  A note\n");
  const r = gitCommit(root, "-m", "docs: add a note");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^COULD NOT CHECK pre-commit: .*changed after staging/m);
  assert.match(r.out, /^\s*notes\/a\.md$/m);
});
test("pre-commit: a lockfile edited and not staged beside a staged package.json cannot be checked, and is named", () => {
  const root = hooked();
  put(
    root,
    "package.json",
    `${JSON.stringify({ ...PACKAGE, description: "x" }, null, 2)}\n`,
  );
  git(root, "add", "package.json");
  put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n# edited\n");
  const r = gitCommit(root, "-m", "build: describe the package");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^COULD NOT CHECK lockfile: /m);
  assert.match(r.out, /^\s*pnpm-lock\.yaml$/m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a workspace package's manifest edited and not staged beside a staged package.json cannot be checked, and is named", () => {
  const root = hooked(sitePackage({ devDependencies: { vite: "8.3.8" } }));
  put(
    root,
    "package.json",
    `${JSON.stringify({ ...PACKAGE, description: "x" }, null, 2)}\n`,
  );
  git(root, "add", "package.json");
  put(root, "site/package.json", '{ "devDependencies": { "vite": "8.3.9" } }');
  const r = gitCommit(root, "-m", "build: describe the package");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^COULD NOT CHECK lockfile: /m);
  assert.match(r.out, /^\s*site\/package\.json$/m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a workflow edited and not staged beside a staged one cannot be checked, and is named", () => {
  const root = hooked((r) => {
    put(r, ".github/workflows/a.yml", "on: [push]\n");
    put(r, ".github/workflows/b.yml", "on: [push]\n");
  });
  put(root, ".github/workflows/a.yml", "on: [push, pull_request]\n");
  git(root, "add", ".github/workflows/a.yml");
  put(root, ".github/workflows/b.yml", "on: [push, pull_request]\n");
  const r = gitCommit(root, "-m", "ci: run on pull requests");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^COULD NOT CHECK workflows: /m);
  assert.match(r.out, /^\s*\.github\/workflows\/b\.yml$/m);
});
test("pre-commit: a secret in a staged file blocks the commit", () => {
  const root = hooked(listingScan);
  put(root, "notes/a.md", "# A leak\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: add a note");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING secrets: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("commit-msg: git refuses a commit whose message holds a secret, and makes no commit", () => {
  const root = hooked(listingScan);
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(
    root,
    "-m",
    "docs: add a note",
    "-m",
    "a leak in the body",
  );
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING commit-msg: secrets in the message$/m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a suppression comment in a staged script blocks the commit, though no staged file is of a plain class", () => {
  const root = hooked();
  put(root, "scripts/x.ts", `// ${SUPPRESSIONS[1]}\nexport const x = 1;\n`);
  git(root, "add", "scripts/x.ts");
  const r = gitCommit(root, "-m", "chore: add x");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING text: /m);
  assert.match(r.out, /scripts\/x\.ts:1: suppression comment/);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a staged workflow and a staged package.json run the workflow and lockfile checks", () => {
  const root = hooked();
  put(root, ".github/workflows/scorecard.yml", "on: [push, pull_request]\n");
  put(
    root,
    "package.json",
    `${JSON.stringify({ ...PACKAGE, description: "x" }, null, 2)}\n`,
  );
  git(root, "add", "-A");
  const r = gitCommit(root, "-m", "ci: run on pull requests");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS workflows: /m);
  assert.match(r.out, /^PASS lockfile: /m);
});
test("pre-commit: a whole-repository listing that fails cannot be checked, and is not narrowed to the staged files", () => {
  const root = hooked();
  put(
    root,
    "package.json",
    `${JSON.stringify({ ...PACKAGE, description: "x" }, null, 2)}\n`,
  );
  git(root, "add", "package.json");
  // The hook run directly, with a git first on the PATH that fails `ls-files` and is git otherwise (git's own hook
  // runs put git's executable folder ahead of the PATH, so a stand-in cannot be reached through `git commit`).
  const bin = tempDir();
  const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  put(
    bin,
    "git",
    `#!/bin/sh\ncase " $* " in *" ls-files "*) exit 1;; esac\nexec ${real} "$@"\n`,
  );
  chmodSync(join(bin, "git"), 0o755);
  const r = spawnSync(
    process.execPath,
    [join(root, "scripts", "check-repo.ts"), "pre-commit"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...GIT_ENV, PATH: `${bin}${delimiter}${GIT_ENV.PATH ?? ""}` },
    },
  );
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /^COULD NOT CHECK lockfile: /m);
});
test("pre-commit: a commit of only empty files has no secret scan to run, and is not blocked", () => {
  const root = hooked(listingScan);
  put(root, "notes/empty.md", "");
  git(root, "add", "notes/empty.md");
  const r = gitCommit(root, "-m", "docs: add an empty note");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE secrets: /m);
  assert.doesNotMatch(r.out, /scan-secrets dir/);
  assert.equal(head(root), "docs: add an empty note");
});
test("pre-commit: a commit of only a new symlink has no secret scan to run, and is not blocked", () => {
  const root = hooked(listingScan);
  symlinkSync("README.md", join(root, "link.md"));
  git(root, "add", "link.md");
  const r = gitCommit(root, "-m", "docs: link the readme");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE secrets: /m);
  assert.doesNotMatch(r.out, /scan-secrets dir/);
  assert.equal(head(root), "docs: link the readme");
});
test("pre-commit: git commit <path> scans the content of that path, not the index's other staged files", () => {
  const root = hooked(listingScan);
  put(root, "README.md", "# Fixture\n\nA leak.\n");
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: reword the readme", "--", "README.md");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^\s*scan-secrets dir README\.md$/m);
  assert.match(r.out, /^FINDING secrets: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a symlink staged beside a regular file does not hide the file from the scan", () => {
  const root = hooked(listingScan);
  symlinkSync("README.md", join(root, "link.md"));
  put(root, "notes/a.md", "# A leak\n");
  git(root, "add", "link.md", "notes/a.md");
  const r = gitCommit(root, "-m", "docs: add a note and a link");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^\s*scan-secrets dir a\.md$/m);
  assert.match(r.out, /^FINDING secrets: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a file that replaces a symlink is scanned", () => {
  const root = hooked((r) => {
    listingScan(r);
    symlinkSync("a.md", join(r, "notes-link.md"));
    put(r, "a.md", "# A note\n");
  });
  rmSync(join(root, "notes-link.md"));
  put(root, "notes-link.md", "# A leak\n");
  git(root, "add", "notes-link.md");
  const r = gitCommit(root, "-m", "docs: make the link a note");
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^\s*scan-secrets dir notes-link\.md$/m);
  assert.match(r.out, /^FINDING secrets: /m);
  assert.equal(head(root), "chore: add the runner");
});
test("pre-commit: a commit that only deletes files has nothing to check", () => {
  const root = hooked();
  git(root, "rm", "-q", "AGENTS.md");
  const r = gitCommit(root, "-m", "docs: drop the agents file");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE pre-commit: /m);
});

// Pins: git really runs the hook from .githooks, with pre-commit active too: it refuses a bad header and an editor
// message left empty, and takes a conventional one, git's own revert wording and a fixup.
test("commit-msg: git runs the hook from .githooks and commits only what it passes", () => {
  const root = hooked();
  put(root, "notes/a.md", "# A note\n");
  git(root, "add", "notes/a.md");
  const refused = gitCommit(root, "-m", "Add a note");
  assert.notEqual(refused.code, 0, refused.out);
  assert.match(refused.out, /^FINDING commit-msg: /m);
  // The editor leaves git's template as it is: only comment lines reach the hook.
  const empty = hookGit(root, ["commit", "-q"], { GIT_EDITOR: "true" });
  assert.notEqual(empty.code, 0, empty.out);
  assert.match(empty.out, /^FINDING commit-msg: the message is empty/m);
  assert.equal(head(root), "chore: add the runner");
  const taken = gitCommit(root, "-m", "docs: add a note");
  assert.equal(taken.code, 0, taken.out);
  assert.equal(head(root), "docs: add a note");
  // `revert --no-edit` alone runs no commit-msg hook, so the revert is committed by `commit --no-edit`.
  for (const want of [
    /^Revert "docs: add a note"$/,
    /^(Reapply "docs: add a note"|Revert "Revert "docs: add a note"")$/,
  ]) {
    assert.equal(hookGit(root, ["revert", "--no-commit", "HEAD"]).code, 0);
    const r = gitCommit(root, "--no-edit");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^PASS commit-msg: /m);
    assert.match(head(root), want);
  }
  const fixup = gitCommit(root, "--allow-empty", "--fixup", "HEAD");
  assert.equal(fixup.code, 0, fixup.out);
  assert.match(head(root), /^fixup! /);
});

/**
 * The secret scan replaced by one that finds a `leak`: a line added in the range (git mode, which names the range and,
 * like the real one, cannot check a range adding no text) or in a file of the folder (dir mode).
 */
const rangeScan = (root: string): void =>
  put(
    root,
    "scripts/scan-secrets.ts",
    // Formatted and typed like any script of the repository.
    `import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
const [mode, target, range] = process.argv.slice(2) as [string, string, string];
const text =
  mode === "dir"
    ? readdirSync(target)
        .map((f) => readFileSync(target + "/" + f, "utf8"))
        .join("\\n")
    : String(execFileSync("git", ["-C", target, "log", "-p", range]));
console.log("scan-secrets " + mode + " " + (mode === "dir" ? "" : range));
if (mode === "git" && !/^\\+(?!\\+\\+)/m.test(text)) {
  console.log("COULD NOT CHECK scan-secrets: no text added");
  process.exitCode = 3;
} else if ((mode === "dir" ? /leak/ : /^\\+.*leak/m).test(text)) {
  console.log("FINDING scan-secrets: 1 leak(s)");
  process.exitCode = 1;
}
`,
  );
/** A hooked fixture with a real remote holding main, on a branch with one new commit. */
function pushable(): string {
  const root = hooked(rangeScan);
  const remote = tempDir();
  execFileSync("git", ["init", "-q", "--bare", remote], { env: GIT_ENV });
  git(root, "remote", "add", "origin", remote);
  git(
    root,
    "-c",
    "core.hooksPath=/dev/null",
    "push",
    "-q",
    "origin",
    "HEAD:refs/heads/main",
  ); // set-up, no hook
  git(root, "fetch", "-q", "origin");
  git(root, "checkout", "-q", "-b", "feat/x");
  put(root, "notes/a.md", "# A note\n");
  commit(root, "docs: add a note");
  return root;
}
const gitPush = (root: string, args: string[], env?: Record<string, string>) =>
  hookGit(root, ["push", "-q", "origin", ...args], env);
/** The stages of a push, in the order they ran (each reports one line, whatever its result). */
const stages = (out: string): string[] =>
  [
    ...out.matchAll(
      /^(?:PASS|FINDING|COULD NOT CHECK|NOT APPLICABLE) (secrets|messages|words|gate)\b/gm,
    ),
  ].map((m) => m[1]);
const sha = (root: string, rev = "HEAD"): string =>
  git(root, "rev-parse", rev).trim();
test("pre-push: a new branch scans its commits after origin/main and runs the scans only", () => {
  const root = pushable();
  put(root, "notes/b.md", "# B note\n");
  commit(root, "docs: add another note");
  const base = sha(root, "origin/main");
  const r = gitPush(root, ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`scan-secrets git ${base}\\.\\.${sha(root)}`));
  assert.match(
    r.out,
    /^NOT APPLICABLE words .*: word scan not set up in this clone/m,
  );
  assert.deepEqual(stages(r.out), ["secrets", "messages", "words"], r.out);
  assert.match(r.out, /^PASS pre-push: /m);
});
test("pre-push: an update scans only the commits after the remote's sha", () => {
  const root = pushable();
  assert.equal(gitPush(root, ["feat/x"]).code, 0);
  const old = sha(root);
  put(root, "notes/b.md", "# B note\n");
  commit(root, "docs: add another note");
  const r = gitPush(root, ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`scan-secrets git ${old}\\.\\.${sha(root)}`));
});
test("pre-push: a push whose gate would fail goes through after clean scans, the gate is not run", () => {
  const root = pushable();
  const r = gitPush(root, ["feat/x"], { PNPM_BIN: fakePnpm("0.0.1") });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /gate/);
  assert.notEqual(git(root, "ls-remote", "origin", "feat/x"), "");
});
test("pre-push: a secret in a pushed commit blocks the push", () => {
  const root = pushable();
  put(root, "notes/b.md", "# A leak\n");
  commit(root, "docs: add a note");
  const r = gitPush(root, ["feat/x"]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING secrets /m);
  assert.deepEqual(stages(r.out), ["secrets"], r.out);
});
test("pre-push: a secret in the message of a pushed commit blocks the push, though the commit skipped the hook", () => {
  const root = pushable();
  put(root, "notes/b.md", "# B note\n");
  commit(root, "docs: add a note\n\nthe leak is in this body\n");
  const r = gitPush(root, ["feat/x"]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(r.out, /^FINDING messages /m);
  assert.deepEqual(stages(r.out), ["secrets", "messages"], r.out);
  assert.equal(git(root, "ls-remote", "origin", "feat/x"), "");
});
test("pre-push: a tag on commits no remote ref holds is scanned, a tag pushed as a branch is a branch", () => {
  const root = pushable();
  put(root, "notes/b.md", "# A leak\n");
  commit(root, "docs: add a note");
  git(root, "tag", "v1");
  for (const ref of ["v1", "v1:refs/heads/x"]) {
    const r = gitPush(root, [ref]);
    assert.notEqual(r.code, 0, `${ref}: ${r.out}`);
    assert.match(r.out, /^FINDING secrets /m);
  }
  assert.equal(git(root, "ls-remote", "origin", "v1", "x"), "");
});
test("pre-push: a range that only deletes passes its secret stage and says no text was added", () => {
  const root = pushable();
  assert.equal(gitPush(root, ["feat/x"]).code, 0);
  git(root, "rm", "-q", "notes/a.md");
  commit(root, "docs: drop the note");
  const r = gitPush(root, ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS secrets \S+: .*no text added/m);
});
test("pre-push: a force-push after a rebase scans after main, not after the remote's old tip", () => {
  const root = pushable();
  assert.equal(gitPush(root, ["feat/x"]).code, 0);
  git(root, "checkout", "-q", "-B", "feat/x", "origin/main");
  put(root, "notes/c.md", "# C note\n");
  commit(root, "docs: add a rebased note");
  const r = gitPush(root, ["--force", "feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    new RegExp(
      `scan-secrets git ${sha(root, "origin/main")}\\.\\.${sha(root)}`,
    ),
  );
});
test("pre-push: a remote whose main is not fetched cannot be checked, and the message says to fetch it", () => {
  const root = pushable();
  git(root, "update-ref", "-d", "refs/remotes/origin/main");
  const r = gitPush(root, ["feat/x"]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(
    r.out,
    /^COULD NOT CHECK pre-push: .*origin\/main must be fetched/m,
  );
});
/** A pushable fixture whose word scan is a script running `body`, with its two lists as real files. */
function withWordScan(body: string): string {
  const root = pushable();
  const dir = tempDir();
  writeFileSync(join(dir, "scan-words.ts"), body);
  writeFileSync(join(dir, "words.txt"), "x\n");
  writeFileSync(join(dir, "allow.txt"), "x\n");
  git(root, "config", "sveltedt.wordScan", join(dir, "scan-words.ts"));
  git(root, "config", "sveltedt.wordList", join(dir, "words.txt"));
  git(root, "config", "sveltedt.wordAllow", join(dir, "allow.txt"));
  return root;
}
const echoWords =
  'console.log("scan-words " + process.argv.slice(2).join(" "));\n';
test("pre-push: the word scan set up in git config runs on the range and its finding blocks the push", () => {
  const root = withWordScan(
    `${echoWords}console.log("FINDING scan-words: 1 hit(s)");\nprocess.exitCode = 1;\n`,
  );
  const r = gitPush(root, ["feat/x"]);
  assert.notEqual(r.code, 0, r.out);
  assert.match(
    r.out,
    /scan-words git \S+ \S+\.\.\S+ --list \S+words\.txt --allow \S+allow\.txt/,
  );
  assert.match(r.out, /^FINDING words /m);
});
test("pre-push: a word scan that passes is a pass of the words stage", () => {
  const r = gitPush(withWordScan(echoWords), ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS words \S+: /m);
});
test("pre-push: a word scan that crashes or exits 1 without its FINDING line cannot be checked", () => {
  for (const code of [1, 2]) {
    const root = withWordScan(
      `console.error("boom");\nprocess.exitCode = ${code};\n`,
    );
    const r = gitPush(root, ["feat/x"]);
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /^COULD NOT CHECK words /m);
  }
});
test("pre-push: a word scan whose list is unset or not a readable file cannot be checked, naming the key", () => {
  for (const [key, value] of [
    ["wordList", ""],
    ["wordAllow", "/nowhere/allow.txt"],
  ]) {
    const root = withWordScan(echoWords);
    git(root, "config", `sveltedt.${key}`, value);
    const r = gitPush(root, ["feat/x"]);
    assert.notEqual(r.code, 0, r.out);
    assert.match(
      r.out,
      new RegExp(`^COULD NOT CHECK words .*sveltedt\\.${key}`, "m"),
    );
  }
});
test("pre-push: a changed tracked file or an untracked file does not matter, the scans read the pushed commits", () => {
  const root = pushable();
  put(root, "README.md", "# Changed\n");
  put(root, "scratch.txt", "notes\n");
  const r = gitPush(root, ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS secrets /m);
});
test("pre-push: a branch other than the one checked out is pushed after its own scans", () => {
  const root = pushable();
  const pushed = sha(root);
  git(root, "checkout", "-q", "-b", "feat/y", "HEAD~1");
  const r = gitPush(root, ["feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, new RegExp(`scan-secrets git \\S+\\.\\.${pushed}`));
});
test("pre-push: a push of several refs judges each line: a deletion beside the branch is skipped, a second branch with new commits is scanned too", () => {
  const root = pushable();
  assert.equal(gitPush(root, ["feat/x", "HEAD:refs/heads/old"]).code, 0);
  put(root, "notes/b.md", "# B note\n");
  commit(root, "docs: add another note");
  let r = gitPush(root, ["feat/x", ":old"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS secrets /m);
  assert.equal(git(root, "ls-remote", "origin", "old"), "");
  git(root, "branch", "feat/y", "HEAD~1");
  git(root, "-c", "core.hooksPath=/dev/null", "checkout", "-q", "feat/y");
  put(root, "notes/c.md", "# C note\n");
  commit(root, "docs: add a third note");
  git(root, "checkout", "-q", "feat/x");
  put(root, "notes/d.md", "# D note\n");
  commit(root, "docs: add a fourth note");
  r = gitPush(root, ["feat/x", "feat/y"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out.match(/^PASS secrets /gm)?.length, 2, r.out);
  assert.notEqual(git(root, "ls-remote", "origin", "feat/y"), "");
});
test("pre-push: a deletion, a tag and a branch with no new commit have nothing to check", () => {
  const root = pushable();
  assert.equal(gitPush(root, ["feat/x"]).code, 0);
  let r = gitPush(root, [":feat/x"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE pre-push: .*deletion/m);
  git(root, "tag", "v0.0.1", "origin/main");
  r = gitPush(root, ["v0.0.1"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE pre-push: .*tag, nothing new/m);
  r = gitPush(root, ["origin/main:refs/heads/copy"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE pre-push: .*no new commit/m);
});
test("secrets: a wrapper that crashes cannot be checked, never a finding", () => {
  // node exits 1 on an uncaught error, the wrapper's own code for leaks
  const root = branch("feat: a commit to scan");
  put(root, "scripts/scan-secrets.ts", 'throw new Error("crash");\n');
  commit(root, "test: plant a crashing wrapper");
  assert.match(expect("secrets", root, 3), /no FINDING line/);
});
