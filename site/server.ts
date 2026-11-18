// The test site's server, on Node's own http module. At start it reads every file of the build folder into a map
// from URL path to contents; a request is answered only by a lookup in that map, so no request text ever becomes a
// file path. Start it after the site's build with: node site/server.ts
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, relative, sep } from "node:path";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

interface BuiltFile {
  body: Buffer;
  type: string;
}

export function siteServer(buildFolder: string): Server {
  const files = new Map<string, BuiltFile>();
  // withFileTypes reports a symbolic link as a link, not a file, so no link leads out of the folder
  for (const entry of readdirSync(buildFolder, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(`/${relative(buildFolder, path).split(sep).join("/")}`, {
      body: readFileSync(path),
      type: TYPES[extname(path)] ?? "application/octet-stream",
    });
  }
  const index = files.get("/index.html");
  if (index) files.set("/", index);

  return createServer((request, response) => {
    const [path = ""] = (request.url ?? "").split("?", 1);
    const file = files.get(path);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": file.type }).end(file.body);
  });
}

if (import.meta.main) {
  siteServer(join(import.meta.dirname, "dist")).listen(
    4173,
    "127.0.0.1",
    () => {
      process.stdout.write("The site: http://127.0.0.1:4173/\n");
    },
  );
}
