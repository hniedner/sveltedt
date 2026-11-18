// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spec } from "../test/spec.ts";
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
): Promise<{ server: Server; dist: string }> {
  const folder = mkdtempSync(join(tmpdir(), "site-server-"));
  put(folder, "package.json", PARENT);
  const dist = join(folder, "dist");
  for (const [path, text] of Object.entries(files)) put(dist, path, text);
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

describe(spec("SRV-01", "a3f33248"), () => {
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
