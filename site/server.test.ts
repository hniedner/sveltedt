// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  linkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get } from "../test/http.ts";
import { siteServer } from "./server.ts";

const PARENT = '{ "name": "parent-of-the-build-folder" }';
const INDEX = "<!doctype html><title>index</title>";
const APP = "export const app = 1;";
const LATE = "<!doctype html><title>late</title>";

const started: { server: Server; folder: string }[] = [];
afterAll(async () => {
  for (const { server, folder } of started) {
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(folder, { recursive: true, force: true });
  }
});

function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

// A folder holding a package.json and the build folder `dist` with the given files; the server started on `dist`
async function serve(
  files: Readonly<Record<string, string>>,
  plant: (dist: string) => void = () => {},
): Promise<{ server: Server; dist: string }> {
  const folder = mkdtempSync(join(tmpdir(), "site-server-"));
  put(folder, "package.json", PARENT);
  const dist = join(folder, "dist");
  for (const [path, text] of Object.entries(files)) put(dist, path, text);
  plant(dist);
  const server = siteServer(dist);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  started.push({ server, folder });
  return { server, dist };
}

// @spec("SRV-01", "2a6879d3")
describe("SRV-01", () => {
  let server: Server;
  beforeAll(async () => {
    const site = await serve({ "index.html": INDEX, "assets/app.js": APP });
    server = site.server;
    put(site.dist, "late.html", LATE);
  });

  it.each([
    ["/", INDEX],
    ["/?dir=rtl", INDEX],
    ["/index.html", INDEX],
    ["/assets/app.js", APP],
  ])(
    "answers GET %s with 200 and the bytes of its file",
    async (path, body) => {
      expect(await get(server, path)).toMatchObject({ status: 200, body });
    },
  );

  it.each([
    "/assets/",
    "/no-such-page",
    "/late.html",
    "/../package.json",
    "/%2e%2e/package.json",
    "/assets/..%2f..%2fpackage.json",
  ])("answers GET %s with 404 and no file", async (path) => {
    const answer = await get(server, path);
    expect(answer.status).toBe(404);
    expect(
      [PARENT, INDEX, APP, LATE].filter((file) => answer.body.includes(file)),
    ).toEqual([]);
  });
});

// @spec("SRV-04", "4c9f2a74")
describe("SRV-04", () => {
  // Each row's link, its target written relative to the link, planted before its own server starts
  const symbolic = (link: string, target: string) => (dist: string) =>
    symlinkSync(target, join(dist, link));
  const hard = (dist: string) =>
    linkSync(join(dist, "assets/app.js"), join(dist, "hard.js"));
  it.each([
    [
      "linkdir to the parent",
      "/linkdir/package.json",
      404,
      null,
      symbolic("linkdir", ".."),
    ],
    [
      "outside.json to the parent's package.json",
      "/outside.json",
      404,
      null,
      symbolic("outside.json", "../package.json"),
    ],
    [
      "same.js to assets/app.js",
      "/same.js",
      404,
      null,
      symbolic("same.js", "assets/app.js"),
    ],
    [
      "same.js to assets/app.js",
      "/assets/app.js",
      200,
      APP,
      symbolic("same.js", "assets/app.js"),
    ],
    ["loop to the build folder", "/", 200, INDEX, symbolic("loop", ".")],
    [
      "loop to the build folder",
      "/loop/index.html",
      404,
      null,
      symbolic("loop", "."),
    ],
    ["hard.js, a hard link to assets/app.js", "/hard.js", 200, APP, hard],
  ] as const)(
    "with %s, answers GET %s with %i",
    async (_link, path, status, body, plant) => {
      const { server } = await serve(
        { "index.html": INDEX, "assets/app.js": APP },
        plant,
      );
      const answer = await get(server, path);
      expect(answer.status).toBe(status);
      if (body === null)
        expect(
          [PARENT, INDEX, APP].filter((file) => answer.body.includes(file)),
        ).toEqual([]);
      else expect(answer.body).toBe(body);
    },
  );
});

// @spec("SRV-03", "65a24eb7")
describe("SRV-03", () => {
  const kinds = [
    ["index.html", "text/html; charset=utf-8"],
    ["assets/app.js", "text/javascript; charset=utf-8"],
    ["assets/app.css", "text/css; charset=utf-8"],
    ["assets/notes.xyz", "application/octet-stream"],
  ] as const;
  let server: Server;
  beforeAll(async () => {
    server = (
      await serve(Object.fromEntries(kinds.map(([path]) => [path, path])))
    ).server;
  });

  it.each(kinds)("answers %s with the content type %s", async (path, type) => {
    expect((await get(server, `/${path}`)).type).toBe(type);
  });
});

const STRICT = "default-src 'self'; script-src 'self'; style-src 'self'";

// @spec("SRV-02", "e2b280d6")
describe("SRV-02", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX, "assets/app.js": APP }))
      .server;
  });

  it.each([
    ["GET", "/", 200],
    ["GET", "/assets/app.js", 200],
    ["GET", "/no-such-page", 404],
    ["GET", "/../package.json", 404],
    ["POST", "/", null],
  ] as const)(
    "answers %s %s with exactly one strict policy header",
    async (method, path, status) => {
      const answer = await get(server, path, method);
      if (status !== null) expect(answer.status).toBe(status);
      expect(answer.policies).toEqual([STRICT]);
    },
  );
});
