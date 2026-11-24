// The test site's server, on Node's own http module. At start it reads every file of the build folder into a map
// from URL path to contents; a request is answered only by a lookup in that map, so no request text ever becomes a
// file path. The one exception is the route /api/orders, which answers from the site's fixed list and reads no file.
// Start it after the site's build with: node site/server.ts (it serves the folder dist beside this file)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, join, relative, sep } from "node:path";
import { orders, type Order } from "./src/orders.ts";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

// The strict policy (PRD section 4.4), on every answer: the browser enforces it only where it is sent (SRV-02)
const POLICY = "default-src 'self'; script-src 'self'; style-src 'self'";

interface BuiltFile {
  body: Buffer;
  type: string;
}

// Every file of the build folder by URL path. One folder level at a time: withFileTypes reports a symbolic link as a
// link, neither file nor folder, so a link to a file or to a folder is never followed (a recursive read would enter
// linked folders)
function readBuild(buildFolder: string): Map<string, BuiltFile> {
  const files = new Map<string, BuiltFile>();
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile())
        files.set(`/${relative(buildFolder, path).split(sep).join("/")}`, {
          body: readFileSync(path),
          type: TYPES[extname(path)] ?? "application/octet-stream",
        });
    }
  };
  walk(buildFolder);
  const index = files.get("/index.html");
  if (index) files.set("/", index);
  return files;
}

// The fixed list ordered by `order[0]` when it names column 0 or 1 as `asc` or `desc` and sends that column as
// orderable, else as it is. The literals are matched first, so no request text is ever used as a key.
function ordered(query: URLSearchParams): readonly Order[] {
  const column = query.get("order[0][column]");
  const direction = query.get("order[0][dir]");
  if (
    (column !== "0" && column !== "1") ||
    (direction !== "asc" && direction !== "desc") ||
    query.get(`columns[${column}][orderable]`) !== "true"
  )
    return orders;
  const key: keyof Order = column === "0" ? "id" : "name";
  const ascending = orders.toSorted((a, b) => a[key].localeCompare(b[key]));
  return direction === "asc" ? ascending : ascending.toReversed();
}

// A count the route accepts: the decimal text of a safe non-negative integer, else undefined
function count(text: string | null): number | undefined {
  const number = Number(text);
  return text !== null && /^\d+$/.test(text) && Number.isSafeInteger(number)
    ? number
    : undefined;
}

// The keys of the request the route reads
const READ = [
  "draw",
  "start",
  "length",
  "order[0][column]",
  "order[0][dir]",
  "columns[0][orderable]",
  "columns[1][orderable]",
];

const refuseRequest = (response: ServerResponse): void => {
  response.writeHead(400).end();
};

// The route's answer: `draw` as a number, the ordered list from `start`, at most `length` rows, both counts the whole
// list. A request that is malformed, or asks for an unknown column or direction or a size of 0 or over 1000, is
// refused with 400 and an empty body before any of it is used. So is a request that sends a key the route reads more
// than once: PHP's `$_GET` keeps the last value and `get` the first, so neither is picked for an ambiguous request.
function answerOrders(query: URLSearchParams, response: ServerResponse): void {
  if (READ.some((key) => query.getAll(key).length > 1)) {
    refuseRequest(response);
    return;
  }
  const draw = count(query.get("draw"));
  const start = count(query.get("start"));
  const length = count(query.get("length"));
  const column = query.get("order[0][column]");
  const direction = query.get("order[0][dir]");
  const named = column !== null || direction !== null;
  if (
    draw === undefined ||
    start === undefined ||
    length === undefined ||
    length < 1 ||
    length > 1000 ||
    (named &&
      ((column !== "0" && column !== "1") ||
        (direction !== "asc" && direction !== "desc")))
  ) {
    refuseRequest(response);
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" }).end(
    JSON.stringify({
      draw,
      recordsTotal: orders.length,
      recordsFiltered: orders.length,
      data: ordered(query).slice(start, start + length),
    }),
  );
}

function serve(files: ReadonlyMap<string, BuiltFile>): Server {
  return createServer((request, response) => {
    const url = request.url ?? "";
    const [path = ""] = url.split("?", 1);
    const file = files.get(path);
    response.setHeader("Content-Security-Policy", POLICY);
    if (path === "/api/orders") {
      answerOrders(new URLSearchParams(url.slice(path.length + 1)), response);
      return;
    }
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": file.type }).end(file.body);
  });
}

/** The server for a build folder, not yet listening. */
export function siteServer(buildFolder: string): Server {
  return serve(readBuild(buildFolder));
}

// One line on standard error and exit code 1; nothing listens, so the program then ends with status 1
function refuse(cause: string): null {
  process.stderr.write(`The site: ${cause}\n`);
  process.exitCode = 1;
  return null;
}

/**
 * The site's start: listens on 127.0.0.1 port 4173 only and writes its address, or refuses with the cause when the
 * build folder is missing or holds no file, or the port is in use (spec/site.md, SRV-05 to SRV-07).
 */
export function startSite(buildFolder: string): Promise<Server | null> {
  if (!existsSync(buildFolder))
    return Promise.resolve(
      refuse(`no build folder at ${buildFolder}; build the site first.`),
    );
  const files = readBuild(buildFolder);
  if (!files.size)
    return Promise.resolve(
      refuse(
        `the build folder ${buildFolder} holds no file; build the site first.`,
      ),
    );
  const server = serve(files);
  return new Promise((resolve, reject) => {
    // Only the listen's own error is the start's: once it listens, a server error is Node's to report
    const failed = (error: NodeJS.ErrnoException): void => {
      if (error.code === "EADDRINUSE")
        resolve(refuse("127.0.0.1:4173 is in use."));
      else reject(error);
    };
    server.once("error", failed);
    server.listen(4173, "127.0.0.1", () => {
      server.off("error", failed);
      process.stdout.write("The site: http://127.0.0.1:4173/\n");
      resolve(server);
    });
  });
}

// The program's entry, one call; import.meta.main is false when the file is imported, so an import starts nothing
if (import.meta.main) void startSite(join(import.meta.dirname, "dist"));
