// @vitest-environment node
// The site server's start (SRV-05 to SRV-07), performed in this process as the spec's start note says: every test
// here runs one at a time, checks first that 127.0.0.1:4173 is free, and closes what it started even when it fails.
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { request, type Server } from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSite } from "./server.ts";

const INDEX = "<!doctype html><title>index</title>";
const HOST = "127.0.0.1";
const PORT = 4173;

let folder = "";
let dist = "";
let closers: (() => Promise<void>)[] = [];
let out: string[] = [];
let err: string[] = [];
let savedExitCode: typeof process.exitCode;

// True when a connection to 127.0.0.1:4173 is refused: nothing listens there
function refused(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(PORT, HOST);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

beforeEach(async () => {
  if (!(await refused()))
    throw new Error(
      `could not check: ${HOST}:${PORT} is held by another process`,
    );
  folder = mkdtempSync(join(tmpdir(), "site-start-"));
  dist = join(folder, "dist");
  closers = [];
  out = [];
  err = [];
  savedExitCode = process.exitCode;
  process.exitCode = undefined;
  // Everything written to standard output and standard error, through the streams and every console method
  const into = (lines: string[]) => (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(into(out));
  vi.spyOn(process.stderr, "write").mockImplementation(into(err));
  for (const method of ["log", "info", "debug"] as const)
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      out.push(`${args.join(" ")}\n`);
    });
  for (const method of ["warn", "error", "trace"] as const)
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      err.push(`${args.join(" ")}\n`);
    });
});

afterEach(async () => {
  try {
    for (const close of closers.reverse()) await close();
  } finally {
    vi.restoreAllMocks();
    process.exitCode = savedExitCode;
    rmSync(folder, { recursive: true, force: true });
  }
});

function closeLater(server: Server | ReturnType<typeof createServer>): void {
  closers.push(() => new Promise((done) => server.close(() => done())));
}

// The start for the build folder; whatever it starts is closed after the test
async function start(): Promise<Server | null> {
  const server = await startSite(dist);
  if (server) closeLater(server);
  return server;
}

// The test's own listener on 127.0.0.1:4173: the control that the port is taken
async function holdPort(): Promise<void> {
  const holder = createServer();
  await new Promise<void>((done) => holder.listen(PORT, HOST, done));
  closeLater(holder);
}

const withIndex = (): void => {
  mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), INDEX);
};
const emptyFolder = (): void => mkdirSync(dist);

function get(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request({ host: HOST, port: PORT, path, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
        }),
      );
    })
      .on("error", reject)
      .end();
  });
}

const noFolder = () =>
  `The site: no build folder at ${dist}; build the site first.\n`;
const noFile = () =>
  `The site: the build folder ${dist} holds no file; build the site first.\n`;
const inUse = () => `The site: ${HOST}:${PORT} is in use.\n`;

// SRV-06's rows: what is there before the start, and the one line expected on standard error
const refusals: [string, () => void | Promise<void>, () => string][] = [
  ["no folder", () => {}, noFolder],
  ["an empty folder", emptyFolder, noFile],
  [
    "a folder holding only an empty folder assets",
    () => mkdirSync(join(dist, "assets"), { recursive: true }),
    noFile,
  ],
  [
    "a folder holding only a symbolic link index.html to a file outside it",
    () => {
      mkdirSync(dist);
      writeFileSync(join(folder, "outside.html"), INDEX);
      symlinkSync(join(folder, "outside.html"), join(dist, "index.html"));
    },
    noFile,
  ],
  ["no folder, and the port held", holdPort, noFolder],
  [
    "an empty folder, and the port held",
    async () => {
      emptyFolder();
      await holdPort();
    },
    noFile,
  ],
  [
    "the build folder of SRV-05, and the port held",
    async () => {
      withIndex();
      await holdPort();
    },
    inUse,
  ],
];

// @spec("SRV-05", "1d362e8c")
describe("SRV-05", () => {
  it("listens on 127.0.0.1 port 4173, IPv4", async () => {
    withIndex();
    const server = await start();
    expect(server?.address()).toEqual({
      address: HOST,
      family: "IPv4",
      port: PORT,
    });
  });
  it("answers GET http://127.0.0.1:4173/ with 200 and the bytes of index.html", async () => {
    withIndex();
    await start();
    expect(await get("/")).toEqual({ status: 200, body: INDEX });
  });
});

// @spec("SRV-06", "11469a48")
describe("SRV-06", () => {
  it.each(refusals)(
    "with %s before the start, refuses with its one line",
    async (_, before, line) => {
      await before();
      const holding = !(await refused());
      expect(await start()).toBeNull();
      expect(err).toEqual([line()]);
      expect(process.exitCode).toBe(1);
      // Nothing of the site's server listens: the port is free again, unless the test's own listener holds it
      expect(await refused()).toBe(!holding);
    },
  );
  // Regression: the start's own error handler once outlived the start, so a later server error was taken for "in use"
  it("leaves a later error of the listening server to Node, not to the start's refusal", async () => {
    withIndex();
    const server = await start();
    const later = Object.assign(new Error("later"), { code: "EADDRINUSE" });
    expect(() => server?.emit("error", later)).toThrow(later);
    expect(err).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });
});

// @spec("SRV-07", "5655c5f2")
describe("SRV-07", () => {
  it("writes exactly the address line to standard output when it listens", async () => {
    withIndex();
    await start();
    expect(out).toEqual(["The site: http://127.0.0.1:4173/\n"]);
  });
  it.each(refusals)(
    "with %s before the start, writes nothing to standard output",
    async (_, before) => {
      await before();
      await start();
      expect(out).toEqual([]);
    },
  );
});
