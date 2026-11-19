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

// POL-03 at its layer, the static check: the gate's `inline` step run on a repository whose build folder holds a copy
// of the real built index.html with one canary planted
const GATE = join(import.meta.dirname, "..", "scripts", "check-repo.ts");
function inlineStep(page: string): { code: number | null; out: string } {
  const root = mkdtempSync(join(tmpdir(), "pol-03-"));
  try {
    mkdirSync(join(root, "site", "dist"), { recursive: true });
    writeFileSync(join(root, "site", "vite.config.ts"), "export default {};\n");
    writeFileSync(join(root, "site", "dist", "index.html"), page);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "site/vite.config.ts"]);
    const r = spawnSync(process.execPath, [GATE, "inline", "--root", root], {
      encoding: "utf8",
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
    "<script>window.start = 1</script>",
    "<script type=\"module\">import './assets/app.js'</script>",
    '<script type="importmap">{"imports":{}}</script>',
    "<style>body { margin: 0 }</style>",
    '<a href="javascript:start()">Start</a>',
  ])("finds the planted %s", (canary) => {
    const r = inlineStep(before(built, "</body>", canary));
    expect(r).toMatchObject({ code: 1 });
    expect(r.out).toMatch(/^FINDING inline:/m);
    expect(r.out).toContain("index.html");
  });

  it("finds the planted event-handler attribute <body onload>", () => {
    const r = inlineStep(built.replace("<body>", '<body onload="start()">'));
    expect(r).toMatchObject({ code: 1 });
    expect(r.out).toContain("index.html");
  });

  it("passes a script with a src and no text and a stylesheet link, and counts the files", () => {
    const page = before(
      built,
      "</head>",
      '<script src="/x.js"></script><link rel="stylesheet" href="/assets/x.css">',
    );
    const r = inlineStep(page);
    expect(r).toMatchObject({ code: 0 });
    expect(r.out).toMatch(/^PASS inline: .*read 1 HTML file/m);
  });
});
