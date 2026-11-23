// Tests for check-consumer.ts. The statements are pure functions of what the copy of the consumer project holds, so
// they are called on a synthetic good state; the install, build and server run once through the script.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { HERE } from "./gate-step.ts";
import { PASS } from "./pinned.ts";
import {
  analyse,
  CANARIES,
  parsePeerReport,
  parseTypeReport,
  verdict,
} from "./check-consumer.ts";
import type { State } from "./check-consumer.ts";

const OK = "No peer dependency issues found";
const UNMET = [
  "Issues with peer dependencies found",
  "",
  "✕ unmet peer svelte",
  "  Installed: 5.57.3",
  "  Wanted:",
  "    ^6.0.0:",
  "      @hniedner/sveltedt@0.0.0",
].join("\n");
const COPY = "/tmp/copy";
const FILES = new Map([
  ["package.json", Buffer.from('{"name":"@hniedner/sveltedt"}')],
  ["dist/index.js", Buffer.from("export {};\n")],
]);
const GOOD: State = {
  before: {
    manifest: '{"devDependencies":{"svelte":"5.57.3"}}\n',
    lock: "lockfileVersion: '9.0'\n",
  },
  after: {
    manifest: '{"devDependencies":{"svelte":"5.57.3"}}\n',
    lock: "lockfileVersion: '9.0'\n",
  },
  copy: {
    dir: COPY,
    real: `${COPY}/node_modules/.pnpm/@hniedner+sveltedt@file+x.tgz/node_modules/@hniedner/sveltedt`,
    files: FILES,
    tarball: FILES,
    lock: "'@hniedner/sveltedt@file:../x/hniedner-sveltedt-0.0.0.tgz':\n",
    tarballName: "hniedner-sveltedt-0.0.0.tgz",
  },
  peers: {
    real: { status: 0, text: OK },
    planted: { status: 1, text: UNMET },
  },
  types: {
    real: { files: 170, errors: [] },
    planted: {
      files: 170,
      errors: [
        "src/routes/+page.svelte 8:12 \"Type 'number' is not assignable\"",
      ],
    },
  },
};
const found = (s: State, id: string): string[] =>
  analyse(s)
    .filter((f) => f.id === id)
    .map((f) => f.message);

test("the synthetic good state gives no finding", () => {
  assert.deepEqual(analyse(GOOD), []);
});
for (const k of CANARIES)
  test(`${k.id} row: ${k.row} is ${k.found ? "a finding" : "not a finding"}`, () => {
    assert.equal(found(k.plant(GOOD), k.id).length > 0, k.found);
  });

test("CON-01: each finding names what is wrong", () => {
  const outside: State = {
    ...GOOD,
    copy: { ...GOOD.copy, real: "/repo/dist", files: new Map(), lock: "x" },
  };
  assert.deepEqual(found(outside, "CON-01"), [
    "the installed package resolves to /repo/dist, outside /tmp/copy/node_modules/.pnpm/",
    "the installed package lacks package.json",
    "the installed package lacks dist/index.js",
    "the copy's lockfile does not record hniedner-sveltedt-0.0.0.tgz as the source of @hniedner/sveltedt",
  ]);
});

test("CON-09: each type error is a finding that names file, position and message", () => {
  const bad: State = {
    ...GOOD,
    types: { ...GOOD.types, real: GOOD.types.planted },
  };
  assert.deepEqual(found(bad, "CON-09"), [
    "src/routes/+page.svelte 8:12 \"Type 'number' is not assignable\"",
  ]);
});
test("CON-09: svelte-check's machine output is read: files, errors, and none when it did not report", () => {
  const out = [
    '1795455601305 START "/x"',
    '1795455601305 ERROR "src/routes/+page.svelte" 8:12 "Type \'number\' is not assignable"',
    '1795455601305 WARNING "src/a.svelte" 1:1 "unused"',
    "1795455601305 COMPLETED 170 FILES 1 ERRORS 1 WARNINGS 2 FILES_WITH_PROBLEMS",
  ].join("\n");
  assert.deepEqual(parseTypeReport(out), {
    files: 170,
    errors: [
      "src/routes/+page.svelte 8:12 \"Type 'number' is not assignable\"",
    ],
  });
  assert.equal(parseTypeReport('1795 START "/x"\n'), undefined);
});
test("CON-09: a type check that read no file cannot be checked", () => {
  const none: State = {
    ...GOOD,
    types: { real: { files: 0, errors: [] }, planted: GOOD.types.planted },
  };
  const r = verdict(none);
  assert.equal(r.code, 3);
  assert.match(r.summary, /type check read no file/);
});
test("CON-11: an issue that names the package is a finding; an issue naming only others is not this statement's", () => {
  const bad: State = {
    ...GOOD,
    peers: { ...GOOD.peers, real: GOOD.peers.planted },
  };
  assert.deepEqual(found(bad, "CON-11"), [
    "pnpm peers check reports an issue that names @hniedner/sveltedt: ✕ unmet peer svelte",
  ]);
  const other: State = {
    ...GOOD,
    peers: {
      ...GOOD.peers,
      real: { status: 1, text: UNMET.replace("@hniedner/sveltedt", "other") },
    },
  };
  assert.deepEqual(found(other, "CON-11"), []);
});
test("CON-11: the peer report is read, and none when pnpm gave no report", () => {
  assert.deepEqual(parsePeerReport({ status: 0, stdout: `${OK}\n` }), {
    status: 0,
    text: `${OK}\n`,
  });
  assert.equal(
    parsePeerReport({ status: 1, stdout: "error: unknown command\n" }),
    undefined,
  );
  assert.equal(parsePeerReport({ status: null, stdout: "" }), undefined);
});
test("the verdict: pass on the good state, finding on a real defect even when a canary misses", () => {
  assert.equal(verdict(GOOD).code, PASS);
  const bad: State = {
    ...GOOD,
    after: { ...GOOD.after, lock: "@hniedner/sveltedt\n" },
  };
  const r = verdict(bad);
  assert.equal(r.code, 1);
  assert.ok(
    r.details.some((d) => d.startsWith("CON-01 consumer/pnpm-lock.yaml names")),
  );
});
test("the script installs the real packed package into a copy of the real consumer, and passes", () => {
  const r = spawnSync(
    process.execPath,
    [join(HERE, "check-consumer.ts"), "--root", join(HERE, "..")],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /^PASS check-consumer: /m);
});
