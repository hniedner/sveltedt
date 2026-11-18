// The test site's server (stub: answers every request with 500 until SRV-01).
import { createServer, type Server } from "node:http";

export function siteServer(): Server {
  return createServer((_request, response) => response.writeHead(500).end());
}
