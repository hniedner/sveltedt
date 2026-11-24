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

// B of spec/site.md section 7: the request the helper builds for the columns id and name, the query { limit: 10 } and
// draw 1, as pairs in the helper's own encoding. A change replaces a pair, adds one, or removes it (null).
const B: [string, string][] = [
  ["draw", "1"],
  ["start", "0"],
  ["length", "10"],
  ["search[value]", ""],
  ["search[regex]", "false"],
  ...["id", "name"].flatMap((name, i): [string, string][] => [
    [`columns[${i}][data]`, name],
    [`columns[${i}][name]`, name],
    [`columns[${i}][searchable]`, "true"],
    [`columns[${i}][orderable]`, "true"],
    [`columns[${i}][search][value]`, ""],
    [`columns[${i}][search][regex]`, "false"],
  ]),
];
const route = (changes: Record<string, string | null> = {}): string => {
  const pairs = new Map(B);
  for (const [key, value] of Object.entries(changes))
    if (value === null) pairs.delete(key);
    else pairs.set(key, value);
  return `/api/orders?${new URLSearchParams([...pairs]).toString()}`;
};
const FIXED = "07 03 15 01 20 11 05 18 09 13 02 17 06 14 10 19 04 12 16 08"
  .split(" ")
  .map((number) => `o${number}`);
const rowsOf = (ids: string[]) =>
  ids.map((id) => ({ id, name: `Order ${id.slice(1)}` }));

// @spec("API-01", "70b6d18c")
describe("API-01", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX })).server;
  });

  it.each([
    [0, 10, FIXED.slice(0, 10)],
    [10, 10, FIXED.slice(10)],
    [15, 10, FIXED.slice(15)],
    [20, 10, []],
    [0, 1000, FIXED],
  ])(
    "answers start %i, length %i with 200, JSON and its rows",
    async (start, length, ids) => {
      const answer = await get(
        server,
        route({ start: String(start), length: String(length) }),
      );
      expect(answer.status).toBe(200);
      expect(answer.type).toBe("application/json");
      expect(JSON.parse(answer.body)).toEqual(
        expect.objectContaining({
          recordsTotal: 20,
          recordsFiltered: 20,
          data: rowsOf(ids),
        }),
      );
    },
  );
});

// @spec("API-02", "6212b706")
describe("API-02", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX })).server;
  });

  it.each([
    ["1", 1],
    ["7", 7],
    ["007", 7],
  ])("answers draw=%s with the number %i", async (draw, number) => {
    const answer = await get(server, route({ draw }));
    expect((JSON.parse(answer.body) as { draw?: unknown }).draw).toBe(number);
  });
});

const ASC = FIXED.toSorted();

// @spec("API-03", "57953d80")
describe("API-03", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX })).server;
  });
  const ordered = (column: string, dir: string) => ({
    "order[0][column]": column,
    "order[0][dir]": dir,
  });

  it.each([
    ["column 1 asc", ordered("1", "asc"), ASC.slice(0, 10)],
    ["column 1 desc", ordered("1", "desc"), ASC.toReversed().slice(0, 10)],
    [
      "column 1 asc from start 10",
      { ...ordered("1", "asc"), start: "10" },
      ASC.slice(10),
    ],
    ["column 0 desc", ordered("0", "desc"), ASC.toReversed().slice(0, 10)],
    [
      "column 1 asc, sent as not orderable",
      { ...ordered("1", "asc"), "columns[1][orderable]": "false" },
      FIXED.slice(0, 10),
    ],
    [
      "column 1 asc, with no orderable pair sent",
      { ...ordered("1", "asc"), "columns[1][orderable]": null },
      FIXED.slice(0, 10),
    ],
  ])("orders by %s", async (_row, changes, ids) => {
    const answer = await get(server, route(changes));
    expect((JSON.parse(answer.body) as { data?: unknown }).data).toEqual(
      rowsOf(ids),
    );
  });

  // The answer ssp.class.php ad98978 gives to the helper's first request for a sorted page, as read from its source
  it("answers the helper's own sorted request with the body ssp.class.php gives", async () => {
    const answer = await get(
      server,
      route({ ...ordered("1", "asc"), "order[0][name]": "name" }),
    );
    expect(JSON.parse(answer.body)).toEqual({
      draw: 1,
      recordsTotal: 20,
      recordsFiltered: 20,
      data: rowsOf(ASC.slice(0, 10)),
    });
  });
});

// @spec("API-04", "c0ffa84c")
describe("API-04", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX })).server;
  });
  const order = (column: string | null, dir: string | null) => ({
    "order[0][column]": column,
    "order[0][dir]": dir,
  });
  const desc = order("1", "desc");

  it.each([
    ["draw removed", route({ draw: null })],
    ["draw empty", route({ draw: "" })],
    ["draw=1a", route({ draw: "1a" })],
    ["draw=-1", route({ draw: "-1" })],
    ["draw=0x1", route({ draw: "0x1" })],
    ["start=1.0", route({ start: "1.0" })],
    ["length=1e1", route({ length: "1e1" })],
    ["start empty", route({ start: "" })],
    ["start=-1", route({ start: "-1" })],
    ["start=1.5", route({ start: "1.5" })],
    ["start=%201, raw", `${route({ start: null })}&start=%201`],
    ["start=%2B1, raw", `${route({ start: null })}&start=%2B1`],
    ["start=9007199254740992", route({ start: "9007199254740992" })],
    ["length removed", route({ length: null })],
    ["length=0", route({ length: "0" })],
    ["length=-1", route({ length: "-1" })],
    ["length=1001", route({ length: "1001" })],
    ["column 2 asc", route(order("2", "asc"))],
    ["column x asc", route(order("x", "asc"))],
    ["column 1 ASC", route(order("1", "ASC"))],
    ["column 1 and no direction", route(order("1", null))],
    ["asc and no column", route(order(null, "asc"))],
    ["draw twice", `${route()}&draw=2`],
    ["start twice", `${route()}&start=5`],
    ["length twice", `${route()}&length=0`],
    ["order[0][column] twice", `${route(desc)}&order[0][column]=0`],
    ["order[0][dir] twice", `${route(desc)}&order[0][dir]=asc`],
    ["columns[0][orderable] twice", `${route(desc)}&columns[0][orderable]=x`],
    ["columns[1][orderable] twice", `${route(desc)}&columns[1][orderable]=x`],
  ])("refuses %s with 400 and an empty body", async (_row, path) => {
    const answer = await get(server, path);
    expect(answer.status).toBe(400);
    expect(answer.body).toBe("");
  });

  it.each([
    ["start=9007199254740991", { start: "9007199254740991" }, []],
    ["length=1000", { length: "1000" }, FIXED],
    ["length=1", { length: "1" }, FIXED.slice(0, 1)],
  ])("answers %s with 200 and its rows", async (_row, changes, ids) => {
    const answer = await get(server, route(changes));
    expect(answer.status).toBe(200);
    expect((JSON.parse(answer.body) as { data?: unknown }).data).toEqual(
      rowsOf(ids),
    );
  });
});

// @spec("API-05", "808081f5")
describe("API-05", () => {
  let server: Server;
  beforeAll(async () => {
    server = (await serve({ "index.html": INDEX })).server;
  });

  it.each([
    ["B", route(), 200],
    ["B with length=0", route({ length: "0" }), 400],
  ])(
    "answers %s with exactly one strict policy",
    async (_row, path, status) => {
      const answer = await get(server, path);
      expect(answer.status).toBe(status);
      expect(answer.policies).toEqual([STRICT]);
    },
  );
});
