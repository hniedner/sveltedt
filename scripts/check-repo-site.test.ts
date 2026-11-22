// Tests for check-repo.ts: the site, inline, test and browser steps. Fixtures in check-repo.fixture.ts.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  PASSING_VITEST,
  PINS,
  canaryDir,
  expect,
  git,
  here,
  put,
  repo,
  run,
  tempDir,
  vitestTest,
} from "./check-repo.fixture.ts";

test("test: with no test file and no code under src/ or site/ the step is not applicable, after vitest failed its canary", () => {
  const r = run(["test", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out.trim().split("\n").at(-1) ?? "",
    /^NOT APPLICABLE test: vitest failed the canary; no test file and no code under src\/ or site\/$/,
    r.out,
  );
});
test("test: passes when vitest fails its canary and every tracked test file runs and passes", () => {
  const out = expect("test", repo(vitestTest(PASSING_VITEST)), 0);
  assert.match(out, /1 test\(s\) in 1 file\(s\) passed/);
});
test("test: a failing test is a finding that names the file and the test", () => {
  const out = expect(
    "test",
    repo(vitestTest(PASSING_VITEST.replace("toBe(2)", "toBe(3)"))),
    1,
  );
  assert.match(out, /src\/a\.test\.ts: failed/);
  assert.match(out, / {2}adds$/m);
});
test("test: without a tracked vitest.config.ts the step cannot be checked", () => {
  const untracked = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    put(root, ".git/info/exclude", "vitest.config.ts\n");
  };
  assert.match(
    expect("test", repo(untracked), 3),
    /vitest\.config\.ts is not tracked/,
  );
});
test("test: a canary that vitest passes cannot be checked", () => {
  const dir = canaryDir("test", {
    "canary.test.ts": `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
  });
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "test", "node_modules"),
  );
  const out = expect("test", repo(vitestTest(PASSING_VITEST)), 3, {
    canaries: dir,
  });
  assert.match(out, /did not report the planted failing test/);
  assert.doesNotMatch(out, /JSON report written/);
});
test("test: a canary run that writes no report cannot be checked, even with no test file to run", () => {
  const dir = canaryDir("test", {
    "canary.test.ts": `import { expect, test } from "vitest";\n${PASSING_VITEST.replace("toBe(2)", "toBe(3)")}`,
    "vitest.config.ts": "export default { test: { include: [,,] } ;\n",
  });
  symlinkSync(
    join(here, "..", "node_modules"),
    join(dir, "test", "node_modules"),
  );
  const out = expect("test", repo(), 3, { canaries: dir });
  assert.match(out, /did not report the planted failing test/);
});
const LATE =
  'test("p", () => {\n  void Promise.reject(new Error("late failure"));\n  expect(1).toBe(1);\n});\n';
test("test: an unhandled rejection is a finding, though the report counts no failed test", () => {
  const out = expect("test", repo(vitestTest(LATE)), 1);
  assert.match(out, /vitest exited 1/);
  assert.match(out, /late failure/);
});
test("test: a test skipped at run time beside a passing one is a finding that names it", () => {
  const partly = `${PASSING_VITEST}test.skipIf(!process.env.NEVER_SET)("the real check", () => {\n  expect(1).toBe(2);\n});\n`;
  const out = expect("test", repo(vitestTest(partly)), 1);
  assert.match(out, /1 test\(s\) skipped/);
  assert.match(out, /^ {4}the real check$/m);
  assert.doesNotMatch(out, /^ {4}adds$/m);
});
test("test: a skipped test in an untracked file the config includes is a finding that names the file", () => {
  const root = repo(vitestTest(PASSING_VITEST));
  put(
    root,
    "src/wip.test.ts",
    `import { test } from "vitest";\ntest.todo("later");\n`,
  );
  assert.match(
    expect("test", root, 1),
    /^ {2}src\/wip\.test\.ts:\n {4}later$/m,
  );
});
test("test: a test.todo beside a passing test is a finding that names it", () => {
  const out = expect(
    "test",
    repo(vitestTest(`${PASSING_VITEST}test.todo("the real check");\n`)),
    1,
  );
  assert.match(out, /1 test\(s\) skipped/);
  assert.match(out, /^ {4}the real check$/m);
});
/** A tracked vitest.config.ts with `options` added to the fixture's include. */
const vitestConfig =
  (options: string) =>
  (root: string): void =>
    put(
      root,
      "vitest.config.ts",
      `export default { test: { include: ["src/**/*.test.ts"], ${options} } };\n`,
    );
test("test: a tracked config that ignores unhandled errors does not hide one: the step overrides it", () => {
  const ignoring = (root: string): void => {
    vitestTest(LATE)(root);
    vitestConfig("dangerouslyIgnoreUnhandledErrors: true")(root);
  };
  assert.match(expect("test", repo(ignoring), 1), /late failure/);
});
test("test: a tracked config that turns assertions off does not let an empty test pass", () => {
  const off = (root: string): void => {
    vitestTest('test("nothing", () => {});\n')(root);
    vitestConfig("expect: { requireAssertions: false }")(root);
  };
  assert.match(expect("test", repo(off), 1), /^ {4}nothing$/m);
});
test("test: a tracked config that only type-checks the tests does not stop them from running", () => {
  const typecheckOnly = (root: string): void => {
    vitestTest(PASSING_VITEST.replace("toBe(2)", "toBe(3)"))(root);
    vitestConfig(
      'typecheck: { enabled: true, only: true, include: ["src/**/*.test.ts"] }',
    )(root);
  };
  assert.match(expect("test", repo(typecheckOnly), 1), /^ {4}adds$/m);
});
test("test: an onUnhandledError handler in vitest.config.ts cannot be checked (no flag overrides it)", () => {
  const handler = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    vitestConfig("onUnhandledError: () => false")(root);
  };
  assert.match(
    expect("test", repo(handler), 3),
    /lets an unhandled error pass/,
  );
});
test("test: a config with projects cannot be checked (the step's flags do not reach a project)", () => {
  const projects = (root: string): void => {
    vitestTest('test("nothing", () => {});\n')(root);
    put(
      root,
      "vitest.config.ts",
      'export default { test: { projects: [{ extends: true, test: { name: "unit", include: ["src/**/*.test.ts"] } }] } };\n',
    );
  };
  assert.match(expect("test", repo(projects), 3), /names "projects"/);
});
test("test: a snapshot with nothing stored is a finding, and the run writes no file", () => {
  const root = repo(
    vitestTest(
      'test("renders", () => {\n  expect("<p>6</p>").toMatchSnapshot();\n});\ntest("renders inline", () => {\n  expect("<p>9</p>").toMatchInlineSnapshot();\n});\n',
    ),
  );
  // CI emptied: outside CI vitest writes a missing snapshot and passes, the case the step must refuse
  const out = expect("test", root, 1, { extraEnv: { CI: "" } });
  assert.match(out, /^ {4}renders$/m);
  assert.match(out, /^ {4}renders inline$/m);
  assert.equal(git(root, "diff", "--name-only"), "");
  assert.equal(git(root, "ls-files", "--others", "--exclude-standard"), "");
});
/** A stand-in for vitest at `version`: the canary run reports a failed test; the real run prints more than the step buffers. */
function fakeVitest(version = PINS.vitest): string {
  const bin = join(tempDir(), "vitest");
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
const out = process.argv.find((a) => a.startsWith("--outputFile.json="));
if (process.argv[2] === "--version") {
  console.log("vitest/${version} darwin-arm64 node-v26.0.0");
} else if (!process.argv.includes("--config")) {
  writeFileSync(out.split("=")[1], JSON.stringify({ numFailedTests: 1 }));
} else {
  process.stdout.write(\`\${"x".repeat(1023)}\\n\`.repeat(65 * 1024));
}
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
test("test: a real run that vitest cannot finish cannot be checked, and says why", () => {
  const out = expect("test", repo(vitestTest(PASSING_VITEST)), 3, {
    extraEnv: { VITEST_BIN: fakeVitest() },
  });
  assert.match(out, /cannot run .*vitest: ENOBUFS/);
});
test("test: a vitest other than the pinned one cannot be checked, and says which", () => {
  const out = expect("test", repo(vitestTest(PASSING_VITEST)), 3, {
    extraEnv: { VITEST_BIN: fakeVitest("0.0.1") },
  });
  assert.match(
    out,
    new RegExp(
      `vitest 0\\.0\\.1 is installed \\("vitest/0\\.0\\.1 [^"]*"\\), package.json pins ${PINS.vitest}`,
    ),
  );
});
test("test: a vitest that cannot be started cannot be checked, and says why", () => {
  const out = expect("test", repo(vitestTest(PASSING_VITEST)), 3, {
    extraEnv: { VITEST_BIN: join(tempDir(), "no-vitest") },
  });
  assert.match(out, /cannot run .*no-vitest: ENOENT/);
});
test("test: the reason shown for an unhandled TypeError names it and the file it came from", () => {
  const typeError =
    'test("adds", () => {\n  void Promise.resolve().then(() => (undefined as unknown as { x: { y: 1 } }).x.y);\n  expect(1).toBe(1);\n});\n';
  const out = expect("test", repo(vitestTest(typeError)), 1);
  assert.match(out, /TypeError/);
  assert.match(out, /src\/a\.test\.ts/);
  assert.ok(!out.includes(`${String.fromCharCode(27)}[`), out);
});
test("test: a test file that fails to load is a finding that names it, and is counted", () => {
  const both = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    put(root, "src/b.test.ts", 'import "./missing.ts";\n');
  };
  const out = expect("test", repo(both), 1);
  assert.match(out, /src\/b\.test\.ts: .*missing\.ts/);
  assert.match(out, /1 file\(s\) failed/);
});
test("test: a tracked test file whose tests were all skipped cannot be checked, and is named", () => {
  const skipped = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    put(
      root,
      "src/b.test.ts",
      `import { describe, expect, test } from "vitest";\ndescribe.skipIf(!process.env.NEVER_SET)("s", () => {\n  ${PASSING_VITEST}});\n`,
    );
  };
  const out = expect("test", repo(skipped), 3);
  assert.match(out, /^ {2}src\/b\.test\.ts$/m);
  assert.match(out, /no test passed/);
});
test("test: a tracked test file outside src/ and site/, or named .spec.ts, must run too", () => {
  for (const path of ["test/extra.test.ts", "src/a.spec.ts"]) {
    const outside = (root: string): void => {
      vitestTest(PASSING_VITEST)(root);
      put(
        root,
        path,
        `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
      );
    };
    const out = expect("test", repo(outside), 3);
    assert.ok(out.split("\n").includes(`  ${path}`), out);
    assert.match(out, /did not run/);
  }
});
test("test: a Playwright spec under site/browser/ is left to the browser step", () => {
  const browserSpec = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    put(
      root,
      "site/browser/a.spec.ts",
      'import { test } from "@playwright/test";\n',
    );
  };
  expect("test", repo(browserSpec), 0);
});
// A tracked Playwright config and spec, with @playwright/test pinned; the fixture reaches the real one through its
// node_modules link
const browserSite =
  (webServer = "") =>
  (root: string): void => {
    const pkg = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as {
      devDependencies: Record<string, string>;
    };
    pkg.devDependencies["@playwright/test"] = PINS["@playwright/test"];
    put(root, "package.json", `${JSON.stringify(pkg, null, 2)}\n`);
    put(
      root,
      "playwright.config.ts",
      `import { defineConfig } from "@playwright/test";\nexport default defineConfig({ testDir: "site/browser", projects: [{ name: "chromium", use: { browserName: "chromium" } }]${webServer} });\n`,
    );
    put(
      root,
      "site/browser/a.spec.ts",
      'import { expect, test } from "@playwright/test";\ntest("opens", async ({ page }) => {\n  await page.setContent("<p>x</p>");\n  await expect(page.locator("p")).toHaveText("x");\n});\n',
    );
  };
// A fake playwright that writes `report` (or, given a string, that text) for the real run, and for the canary run
// (told apart by a working folder whose path holds "canaries") its one test with the status `canary` at `canaryLine`
// (the marked test( line of canary.spec.ts); FAKE_EXIT sets the real run's exit code
function fakePlaywright(
  report: object | string,
  version = PINS["@playwright/test"],
  canary = "unexpected",
  canaryLine = 4,
): string {
  const bin = join(tempDir(), "playwright");
  const planted = {
    stats: { unexpected: 1 },
    errors: [],
    suites: [
      {
        file: "canary.spec.ts",
        specs: [
          {
            title: "fails on purpose",
            line: canaryLine,
            tests: [{ projectName: "", status: canary, results: [{}] }],
          },
        ],
      },
    ],
  };
  const real = typeof report === "string" ? report : JSON.stringify(report);
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const out = process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;
if (process.argv[2] === "--version") console.log("Version ${version}");
else require("node:fs").writeFileSync(out, process.cwd().includes("canaries") ? ${JSON.stringify(JSON.stringify(planted))} : ${JSON.stringify(real)});
if (process.argv[2] === "test" && !process.cwd().includes("canaries")) process.exitCode = Number(process.env.FAKE_EXIT ?? 0);
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
// Playwright's messages are coloured and span lines; the step shows them without the colour codes
const BOOM = "\u001b[31mError: boom\u001b[39m\n\nExpected: 1\nReceived: 2";
/** A report of the spec file `a.spec.ts` whose test "opens" (at `line`) ended with `status` in each of `engines`. */
const pwReport = (
  status: string,
  errors: object[] = [],
  file = "a.spec.ts",
  engines = ["chromium", "firefox", "webkit"],
  line = 3,
) => ({
  stats: { [status]: engines.length },
  errors,
  suites: [
    {
      file,
      specs: [
        {
          title: "opens",
          line,
          tests: engines.map((projectName) => ({
            projectName,
            status,
            results: [{ error: { message: BOOM } }],
          })),
        },
      ],
    },
  ],
});
const withPw = (
  report: object | string,
  version?: string,
  canary?: string,
  canaryLine?: number,
) => ({
  extraEnv: {
    PLAYWRIGHT_BIN: fakePlaywright(report, version, canary, canaryLine),
  },
});
test("browser: without a tracked spec the step is not applicable; a spec without the config cannot be checked", () => {
  const r = run(["browser", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE browser:/m);
  const noConfig = repo((root) => {
    browserSite()(root);
    rmSync(join(root, "playwright.config.ts"));
  });
  assert.match(
    expect("browser", noConfig, 3),
    /playwright\.config\.ts is not tracked/,
  );
});
test("browser: left to the CI job browser by GATE_BROWSER in CI only", () => {
  const site = repo(browserSite());
  const pw = withPw(pwReport("unexpected")).extraEnv;
  const ci = run(["browser", "--root", site], {
    extraEnv: { ...pw, GITHUB_ACTIONS: "true", GATE_BROWSER: "job" },
  });
  assert.equal(ci.code, 0, ci.out);
  assert.match(ci.out, /^NOT APPLICABLE browser: left to the CI job browser/m);
  // Locally, in CI without the variable, and in the job browser whatever its variables, nothing is left out
  for (const env of [
    { GATE_BROWSER: "job" },
    { GITHUB_ACTIONS: "true" },
    { GITHUB_ACTIONS: "true", GATE_BROWSER: "job", GITHUB_JOB: "browser" },
  ] as Record<string, string>[])
    assert.match(
      expect("browser", site, 1, { extraEnv: { ...pw, ...env } }),
      /^FINDING browser: /m,
    );
});
test("browser: passes when every tracked spec ran and passed in each engine, and counts the tests", () => {
  const out = expect(
    "browser",
    repo(browserSite()),
    0,
    withPw(pwReport("expected")),
  );
  assert.match(
    out,
    /3 test\(s\) in 1 file\(s\) passed; 0 marker\(s\) with passing tests in every engine \(ids and hashes: trace\)$/m,
  );
});
// a.spec.ts with a marked test: the marker on line 2, its test( on line 3
const markedSite = (root: string): void => {
  browserSite()(root);
  put(
    root,
    "site/browser/a.spec.ts",
    'import { expect, test } from "@playwright/test";\n// @spec("TST-01", "aaaaaaaa")\ntest("opens", () => {\n  expect(1).toBe(1);\n});\n',
  );
};
test("browser: a marked test that passed in every engine counts its marker", () => {
  const out = expect(
    "browser",
    repo(markedSite),
    0,
    withPw(pwReport("expected")),
  );
  assert.match(
    out,
    /3 test\(s\) in 1 file\(s\) passed; 1 marker\(s\) with passing tests in every engine \(ids and hashes: trace\)$/m,
  );
});
test("browser: a tracked helper under site/browser/ is not a spec, so it need not be in the report", () => {
  const site = (root: string): void => {
    markedSite(root);
    put(root, "site/browser/helper.ts", "export const one = 1;\n");
  };
  assert.match(
    expect("browser", repo(site), 0, withPw(pwReport("expected"))),
    /3 test\(s\) in 1 file\(s\) passed; 1 marker\(s\)/,
  );
});
test("browser: a marker with no test under it in the report is a finding", () => {
  const report = pwReport("expected", [], "a.spec.ts", undefined, 9);
  assert.match(
    expect("browser", repo(markedSite), 1, withPw(report)),
    /^ {2}site\/browser\/a\.spec\.ts:2: TST-01: no test ran under the marker \(lines 3-5\)$/m,
  );
});
test("browser: a marker without a test is a finding even beside one whose tests missed an engine", () => {
  const site = (root: string): void => {
    markedSite(root);
    put(
      root,
      "site/browser/a.spec.ts",
      'import { expect, test } from "@playwright/test";\n// @spec("TST-01", "aaaaaaaa")\ntest("opens", () => {\n  expect(1).toBe(1);\n});\n// @spec("TST-02", "aaaaaaaa")\ntest("closes", () => {\n  expect(1).toBe(1);\n});\n',
    );
  };
  // TST-01's test ran in chromium only; TST-02's not at all; a test on line 20 keeps the file in every engine
  const marked = pwReport("expected", [], "a.spec.ts", ["chromium"]);
  const other = pwReport("expected", [], "a.spec.ts", undefined, 20);
  const report = {
    ...marked,
    stats: { expected: 4 },
    suites: [
      {
        file: "a.spec.ts",
        specs: [...marked.suites[0].specs, ...other.suites[0].specs],
      },
    ],
  };
  assert.match(
    expect("browser", repo(site), 1, withPw(report)),
    /^ {2}site\/browser\/a\.spec\.ts:6: TST-02: no test ran under the marker \(lines 7-9\)$/m,
  );
});
test("browser: a marker whose tests did not run in every engine cannot be checked, though its file did", () => {
  const marked = pwReport("expected", [], "a.spec.ts", ["chromium"]);
  const other = pwReport("expected", [], "a.spec.ts", undefined, 9);
  const report = {
    ...marked,
    stats: { expected: 4 },
    suites: [
      {
        file: "a.spec.ts",
        specs: [...marked.suites[0].specs, ...other.suites[0].specs],
      },
    ],
  };
  assert.match(
    expect("browser", repo(markedSite), 3, withPw(report)),
    /^ {2}site\/browser\/a\.spec\.ts:2: TST-01: not in firefox, webkit$/m,
  );
});
test("browser: a failed or skipped test is a finding that names it, its engine and its reason", () => {
  for (const status of ["unexpected", "skipped"]) {
    const out = expect(
      "browser",
      repo(browserSite()),
      1,
      withPw(pwReport(status)),
    );
    assert.match(
      out,
      /^ {2}a\.spec\.ts > opens \[webkit\]: (?:Error: boom \/ Expected: 1 \/ Received: 2|skipped)$/m,
    );
  }
});
test("browser: a failed test inside a describe block is found", () => {
  const report = pwReport("unexpected");
  const nested = {
    ...report,
    suites: [{ file: "a.spec.ts", suites: report.suites }],
  };
  assert.match(
    expect("browser", repo(browserSite()), 1, withPw(nested)),
    /a\.spec\.ts > opens \[chromium\]/,
  );
});
test("browser: a test that passed only as an expected failure (test.fail) is a finding", () => {
  const report = pwReport("expected");
  report.suites[0].specs[0].tests[0] = {
    ...report.suites[0].specs[0].tests[0],
    annotations: [{ type: "fail" }],
  } as (typeof report.suites)[0]["specs"][0]["tests"][0];
  assert.match(
    expect("browser", repo(browserSite()), 1, withPw(report)),
    /opens \[chromium\]: marked test\.fail/,
  );
});
test("browser: a spec that did not run in every engine, a canary that passed or another version cannot be checked", () => {
  const site = repo(browserSite());
  assert.match(
    expect("browser", site, 3, withPw(pwReport("expected", [], "b.spec.ts"))),
    /^ {2}site\/browser\/a\.spec\.ts: not in chromium, firefox, webkit$/m,
  );
  assert.match(
    expect(
      "browser",
      site,
      3,
      withPw(pwReport("expected", [], "a.spec.ts", ["chromium"])),
    ),
    /^ {2}site\/browser\/a\.spec\.ts: not in firefox, webkit$/m,
  );
  assert.match(
    expect("browser", site, 3, withPw(pwReport("expected"), "0.0.1")),
    /playwright 0\.0\.1 is installed/,
  );
  // The canary is judged before the real run, whose failure must not show instead
  assert.match(
    expect(
      "browser",
      site,
      3,
      withPw(pwReport("unexpected"), undefined, "expected"),
    ),
    /did not report the planted failing test/,
  );
  // A marker reading that finds no test under the canary's marker would pass every marker
  assert.match(
    expect(
      "browser",
      site,
      3,
      withPw(pwReport("expected"), undefined, undefined, 9),
    ),
    /the planted failing test's marker was not reported \(canary\.spec\.ts\)/,
  );
});
test("browser: a report whose totals differ from its tests, or that cannot be read, cannot be checked", () => {
  const site = repo(browserSite());
  const report = { ...pwReport("expected"), stats: { expected: 2 } };
  assert.match(
    expect("browser", site, 3, withPw(report)),
    /the report counts 2 test\(s\), 3 were read/,
  );
  assert.match(
    expect("browser", site, 3, withPw('{"stats":')),
    /playwright wrote no readable report/,
  );
});
test("browser: a run that exits non-zero with every test passed cannot be checked", () => {
  const pw = withPw(pwReport("expected")).extraEnv;
  assert.match(
    expect("browser", repo(browserSite()), 3, {
      extraEnv: { ...pw, FAKE_EXIT: "1" },
    }),
    /playwright exited 1 with every test passed/,
  );
});
test("browser: an error outside the tests that the step does not know cannot be checked, and is shown", () => {
  const out = expect(
    "browser",
    repo(browserSite()),
    3,
    withPw(pwReport("expected", [{ message: "Error: odd" }])),
  );
  assert.match(out, /Error: odd/);
});
// The two could-not-check rows with the real Playwright: neither starts a browser
test("browser: a taken 127.0.0.1:4173 cannot be checked (the web server refuses a running one)", async () => {
  // A child process holds 127.0.0.1:4173 while the gate runs. The row needs that port free (stop pnpm site:serve, no
  // second gate run at once): a port already taken fails the row, never hangs it
  const holder = spawn(process.execPath, [
    "-e",
    'require("node:http").createServer((q, s) => s.end("held")).listen(4173, "127.0.0.1", () => console.log("up"))',
  ]);
  try {
    await new Promise((up, down) => {
      holder.stdout.once("data", up);
      holder.once("error", down);
      holder.once("exit", () =>
        down(new Error("the holder could not listen on 4173")),
      );
    });
    const site = repo(
      browserSite(
        ', webServer: { command: "node -e 0", url: "http://127.0.0.1:4173/", reuseExistingServer: false }',
      ),
    );
    assert.match(
      expect("browser", site, 3),
      /127\.0\.0\.1:4173 is held by another process \(stop pnpm site:serve\)/,
    );
  } finally {
    holder.kill();
  }
});
test("browser: a browser that is not installed cannot be checked, and says how to install it", () => {
  const out = expect("browser", repo(browserSite()), 3, {
    extraEnv: { PLAYWRIGHT_BROWSERS_PATH: tempDir() },
  });
  assert.match(
    out,
    /a browser is not installed: run pnpm exec playwright install/,
  );
  assert.match(out, /^ {2}chromium$/m);
});
test("test: tracked source under src/ or site/ with no test file cannot be checked", () => {
  for (const path of ["src/lib/a.ts", "site/src/App.svelte"]) {
    const code = (root: string): void => put(root, path, "<p>a</p>\n");
    assert.match(expect("test", repo(code), 3), /no test file/);
  }
});
test("test: a config vitest cannot load cannot be checked, and says why", () => {
  const broken = (root: string): void => {
    vitestTest(PASSING_VITEST)(root);
    put(
      root,
      "vitest.config.ts",
      "export default { test: { include: [,,] } ;\n",
    );
  };
  const out = expect("test", repo(broken), 3);
  assert.match(out, /vitest wrote no report/);
  assert.match(out, /vitest\.config\.ts/);
  assert.ok(!out.includes(`${String.fromCharCode(27)}[`), out);
  assert.doesNotMatch(out, /^\s+at /m); // a stack frame is not a reason
});

// A site the real vite builds: a config with no plugin and a page with no script
const siteFiles =
  (config = "export default { root: import.meta.dirname };\n") =>
  (root: string): void => {
    put(root, "site/vite.config.ts", config);
    put(root, "site/index.html", "<!doctype html><title>site</title>\n");
  };
test("site: without a tracked site/vite.config.ts the step is not applicable", () => {
  const r = run(["site", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.out,
    /^NOT APPLICABLE site: no tracked site\/vite\.config\.ts/m,
  );
});
test("site: an untracked site/vite.config.ts is not applicable either", () => {
  const untracked = (root: string): void => {
    siteFiles()(root);
    put(root, ".git/info/exclude", "site/\n");
  };
  const r = run(["site", "--root", repo(untracked)]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE site:/m);
});
test("site: passes when vite builds the site into site/dist, and counts the files", () => {
  assert.match(
    expect("site", repo(siteFiles()), 0),
    /vite build wrote 1 page\(s\) to site\/dist/,
  );
});
test("site: a build that fails is a finding that says why", () => {
  assert.match(
    expect("site", repo(siteFiles('throw new Error("broken config");\n')), 1),
    /broken config/,
  );
});
test("site: a build that leaves site/dist missing or empty cannot be checked", () => {
  const elsewhere = siteFiles(
    'export default { root: import.meta.dirname, build: { outDir: "../out" } };\n',
  );
  assert.match(
    expect("site", repo(elsewhere), 3),
    /no HTML page in site\/dist/,
  );
  const empty = (root: string): void => {
    elsewhere(root);
    mkdirSync(join(root, "site", "dist"));
  };
  assert.match(expect("site", repo(empty), 3), /no HTML page in site\/dist/);
  // A site/dist left from an earlier build does not pass for this one
  const stale = (root: string): void => {
    elsewhere(root);
    put(root, "site/dist/index.html", "<!doctype html><title>old</title>\n");
  };
  assert.match(expect("site", repo(stale), 3), /no HTML page in site\/dist/);
});
test("site: a build that writes no HTML page cannot be checked", () => {
  const scriptOnly = (root: string): void => {
    siteFiles(
      'export default { root: import.meta.dirname, build: { rollupOptions: { input: import.meta.dirname + "/main.js" } } };\n',
    )(root);
    put(root, "site/main.js", "export const a = 1;\n");
  };
  assert.match(
    expect("site", repo(scriptOnly), 3),
    /no HTML page in site\/dist/,
  );
});

// The inline step's own contract; POL-03's rows run in site/policy.test.ts against the real build
const builtPage = (html: string) => (root: string) => {
  put(root, "site/vite.config.ts", "export default {};\n");
  put(root, "site/dist/index.html", html);
};
test("inline: without a tracked site/vite.config.ts the step is not applicable", () => {
  const r = run(["inline", "--root", repo()]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^NOT APPLICABLE inline:/m);
});
test("inline: a site/dist with no HTML file cannot be checked", () => {
  const none = (root: string) =>
    put(root, "site/vite.config.ts", "export default {};\n");
  assert.match(expect("inline", repo(none), 3), /no HTML file in site\/dist/);
});
test("inline: a planted canary the scan misses, or none planted, cannot be checked", () => {
  const dir = tempDir();
  const clean = "<!doctype html><title>c</title><script src=/a.js></script>\n";
  const site = repo(builtPage(clean));
  const none = expect("inline", site, 3, { canaries: dir });
  assert.match(none, /missed a planted canary/);
  assert.match(none, /^ {2}handler\.html: the event handler onload$/m);
  // A canary that raises another kind than its own is missed too
  put(dir, "inline/style.html", "<!doctype html><p onclick=x()>\n");
  const other = expect("inline", site, 3, { canaries: dir });
  assert.match(other, /^ {2}style\.html: a style element$/m);
});
test("inline: names each file and kind it finds", () => {
  const two =
    "<!doctype html><style>p{}</style><a href=' JAVASCRIPT:x()'>x</a><script src=/a.js>\n</script>\n";
  const out = expect("inline", repo(builtPage(two)), 1);
  assert.match(out, /^ {2}index\.html: a style element$/m);
  assert.match(out, /^ {2}index\.html: a javascript: URL in href$/m);
  assert.match(out, /^ {2}index\.html: a script element with text$/m);
  assert.match(out, /in 3 place\(s\)/);
});
test("inline: looks for javascript: and vbscript: in each URL attribute it lists, in nested pages too", () => {
  for (const [scheme, tag, attr] of [
    ["javascript", "img", "src"],
    ["vbscript", "form", "action"],
    ["javascript", "button", "formaction"],
    ["vbscript", "object", "data"],
  ]) {
    const page = (root: string) => {
      put(root, "site/vite.config.ts", "export default {};\n");
      put(root, "site/dist/sub/page.html", `<${tag} ${attr}="${scheme}:x()">`);
    };
    const out = expect("inline", repo(page), 1);
    assert.match(
      out,
      new RegExp(`^ {2}sub/page\\.html: a ${scheme}: URL in ${attr}$`, "m"),
    );
  }
});
test("site: a vite that cannot be started cannot be checked, and says why", () => {
  assert.match(
    expect("site", repo(siteFiles()), 3, {
      extraEnv: { VITE_BIN: "/no/such/vite" },
    }),
    /cannot run \/no\/such\/vite: ENOENT/,
  );
});
