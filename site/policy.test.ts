// @vitest-environment jsdom
// The strict policy's statements at the HTTP layer (POL-03 at the gate's static check), against the site's real build
// folder (site/dist, written by `pnpm site:build`). The server listens on a port the system assigns.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { childEnv } from "../scripts/gate-step.ts";
import { get } from "../test/http.ts";
import { siteServer } from "./server.ts";

const DIST = join(import.meta.dirname, "dist");

// Every .html file of the build folder, as its path in the folder ("index.html", "canary.html", ...)
function htmlFiles(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) =>
      relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();
}

// A path on the site: one leading slash, no scheme or host
const SITE_PATH = /^\/(?!\/)/;

// @spec("POL-01", "fc99fbff")
describe("POL-01", () => {
  const pages = htmlFiles(DIST);
  let server: Server;
  beforeAll(async () => {
    server = siteServer(DIST);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  });
  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  it("finds index.html and canary.html in the build folder (otherwise: could not check)", () => {
    expect(pages).toEqual(
      expect.arrayContaining(["index.html", "canary.html"]),
    );
  });

  it.each(pages)(
    "%s loads the listener from the site before every other script",
    async (page) => {
      const answer = await get(
        server,
        page === "index.html" ? "/" : `/${page}`,
      );
      expect(answer.status).toBe(200);
      const scripts = [
        ...new DOMParser()
          .parseFromString(answer.body, "text/html")
          .querySelectorAll("script"),
      ];
      const first = scripts.findIndex(
        (script) =>
          SITE_PATH.test(script.getAttribute("src") ?? "") &&
          !["async", "defer", "type"].some((name) => script.hasAttribute(name)),
      );
      expect(first).toBeGreaterThanOrEqual(0);
      const listener = await get(
        server,
        scripts[first]?.getAttribute("src") ?? "",
      );
      expect(listener).toMatchObject({
        status: 200,
        type: "text/javascript; charset=utf-8",
      });
      // The site's script of PRD-S1 (spec conventions): the one that records each violation
      expect(listener.body).toContain("securitypolicyviolation");
      const early = scripts
        .slice(0, first)
        .filter(
          (script) =>
            script.getAttribute("type") !== "module" ||
            script.hasAttribute("async"),
        );
      expect(early).toEqual([]);
    },
  );
});

// POL-03 at its layer, the static check: the gate's `inline` step (which first proves itself on its own planted pages)
// run on a repository whose build folder holds a copy of the real built index.html with one row planted
const GATE = join(import.meta.dirname, "..", "scripts", "check-repo.ts");
function inlineStep(page: string): { code: number | null; out: string } {
  const root = mkdtempSync(join(tmpdir(), "pol-03-"));
  try {
    mkdirSync(join(root, "site", "dist"), { recursive: true });
    writeFileSync(join(root, "site", "vite.config.ts"), "export default {};\n");
    writeFileSync(join(root, "site", "dist", "index.html"), page);
    // childEnv drops git's GIT_* variables (a hook's must not reach the real repository) and the gate's own ones (the
    // step's verdict must not depend on them)
    execFileSync("git", ["init", "-q", root], { env: childEnv() });
    execFileSync("git", ["-C", root, "add", "site/vite.config.ts"], {
      env: childEnv(),
    });
    const r = spawnSync(process.execPath, [GATE, "inline", "--root", root], {
      encoding: "utf8",
      env: childEnv(),
    });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// @spec("POL-03", "c7780e46")
describe("POL-03", () => {
  const built = existsSync(join(DIST, "index.html"))
    ? readFileSync(join(DIST, "index.html"), "utf8")
    : "";
  const before = (html: string, tag: string, add: string): string =>
    html.replace(tag, `${add}${tag}`);

  it("has the built index.html to plant in (otherwise: could not check)", () => {
    expect(built).toContain("</body>");
  });

  it.each([
    ["<script>window.start = 1</script>", "a script element with text"],
    [
      "<script type=\"module\">import './assets/app.js'</script>",
      "a script element with text",
    ],
    [
      '<script type="importmap">{"imports":{}}</script>',
      "a script element with text",
    ],
    ["<style>body { margin: 0 }</style>", "a style element"],
    ['<a href="javascript:start()">Start</a>', "a javascript: URL in href"],
  ])("finds the planted %s", (canary, kind) => {
    const r = inlineStep(before(built, "</body>", canary));
    expect(r).toMatchObject({ code: 1 });
    expect(r.out).toMatch(/^FINDING inline:/m);
    expect(r.out).toContain(`index.html: ${kind}`);
  });

  it("finds the planted event-handler attribute <body onload>", () => {
    const r = inlineStep(built.replace("<body>", '<body onload="start()">'));
    expect(r).toMatchObject({ code: 1 });
    expect(r.out).toContain("index.html: the event handler onload");
  });

  it("passes a script with a src and no text, a stylesheet link and a style attribute, and counts the files", () => {
    const page = before(
      built,
      "</head>",
      '<script src="/x.js">\n</script><link rel="stylesheet" href="/assets/x.css"><p style="margin: 0"></p>',
    );
    const r = inlineStep(page);
    expect(r).toMatchObject({ code: 0 });
    expect(r.out).toMatch(/^PASS inline: .*read 1 HTML file/m);
  });
});
