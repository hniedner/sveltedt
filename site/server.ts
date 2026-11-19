// The test site's server, on Node's own http module. At start it reads every file of the build folder into a map
// from URL path to contents; a request is answered only by a lookup in that map, so no request text ever becomes a
// file path. Start it after the site's build with: node site/server.ts (it serves the folder dist beside this file)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, relative, sep } from "node:path";

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

function serve(files: ReadonlyMap<string, BuiltFile>): Server {
  return createServer((request, response) => {
    const [path = ""] = (request.url ?? "").split("?", 1);
    const file = files.get(path);
    response.setHeader("Content-Security-Policy", POLICY);
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
