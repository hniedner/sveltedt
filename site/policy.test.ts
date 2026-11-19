// @vitest-environment jsdom
// The strict policy's statements at the HTTP layer, against the site's real build folder (site/dist, written by
// `pnpm site:build`). The server listens on a port the system assigns.
import { existsSync, readdirSync } from "node:fs";
import type { Server } from "node:http";
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
