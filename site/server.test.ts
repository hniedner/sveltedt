// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { siteServer } from "./server.ts";

interface Answer {
  status: number;
  type: string | undefined;
  body: string;
}

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
  links: Readonly<Record<string, string>> = {},
): Promise<{ server: Server; dist: string }> {
  const folder = mkdtempSync(join(tmpdir(), "site-server-"));
  put(folder, "package.json", PARENT);
  const dist = join(folder, "dist");
  for (const [path, text] of Object.entries(files)) put(dist, path, text);
  for (const [path, target] of Object.entries(links))
    symlinkSync(target, join(dist, path));
  const server = siteServer(dist);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  started.push({ server, folder });
  return { server, dist };
}

// One GET, with the path written to the wire exactly as given (a URL parser would remove `..` before sending)
function get(server: Server, path: string): Promise<Answer> {
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  return new Promise((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          type: response.headers["content-type"],
          body: Buffer.concat(chunks).toString(),
        }),
      );
    })
      .on("error", reject)
      .end();
  });
}

// @spec("SRV-01", "a3f33248")
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

describe("SRV-01: a link in the build folder leads nowhere outside it", () => {
  it("answers a file reached through a folder link, or a link loop, with 404", async () => {
    const { server } = await serve(
      { "index.html": INDEX },
      { parent: "..", loop: "." },
    );
    for (const path of ["/parent/package.json", "/loop/index.html"]) {
      const answer = await get(server, path);
      expect(answer.status).toBe(404);
      expect(answer.body).not.toContain(PARENT);
    }
  });
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
