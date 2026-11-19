// Tests for scripts/setup. Each case runs the real entry point on a fixture clone, with its own HOME and global git
// configuration, as a contributor runs it; the real clone's configuration is never read or written.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const here = import.meta.dirname;
const made: string[] = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A fixture clone holding the real `scripts/setup`, and the global configuration file its git reads. */
function clone(global = ""): { root: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), "setup-test-"));
  made.push(dir);
  const root = join(dir, "clone");
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(join(here, "setup"), join(root, "scripts", "setup"));
  chmodSync(join(root, "scripts", "setup"), 0o755);
  const gitconfig = join(dir, "gitconfig");
  writeFileSync(gitconfig, global);
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
    ),
    HOME: dir,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  execFileSync("git", ["init", "-q", root], { env });
  return { root, env };
}
const hooksPath = (c: { root: string; env: NodeJS.ProcessEnv }): string =>
  spawnSync("git", ["-C", c.root, "config", "--local", "core.hooksPath"], {
    encoding: "utf8",
    env: c.env,
  }).stdout.trim();
/** Runs `./scripts/setup` of the clone, from another folder. */
const setup = (c: { root: string; env: NodeJS.ProcessEnv }) => {
  const r = spawnSync(join(c.root, "scripts", "setup"), {
    cwd: tmpdir(),
    encoding: "utf8",
    env: c.env,
  });
  return { code: r.status, out: r.stdout + r.stderr };
};

test("setup: an unset core.hooksPath is set to .githooks for this clone", () => {
  const c = clone();
  const r = setup(c);
  assert.equal(r.code, 0, r.out);
  assert.equal(hooksPath(c), ".githooks");
});
test("setup: a clone that already has .githooks is left as it is, and succeeds", () => {
  const c = clone();
  execFileSync("git", ["-C", c.root, "config", "core.hooksPath", ".githooks"], {
    env: c.env,
  });
  const r = setup(c);
  assert.equal(r.code, 0, r.out);
  assert.equal(hooksPath(c), ".githooks");
  assert.match(r.out, /already \.githooks/);
});
test("setup: another local core.hooksPath stops it, names the value and where it is set, and changes nothing", () => {
  const c = clone();
  execFileSync("git", ["-C", c.root, "config", "core.hooksPath", "/opt/mine"], {
    env: c.env,
  });
  const r = setup(c);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /"\/opt\/mine"/);
  assert.match(r.out, /file:\S*\.git\/config/);
  assert.equal(hooksPath(c), "/opt/mine");
});
test("setup: another global core.hooksPath stops it, names the value and where it is set, and changes nothing", () => {
  const c = clone("[core]\n\thooksPath = /opt/global\n");
  const r = setup(c);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /"\/opt\/global"/);
  assert.match(r.out, /gitconfig/);
  assert.equal(hooksPath(c), "");
});
