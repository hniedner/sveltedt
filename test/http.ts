// The site's HTTP tests' one request helper (spec/site.md, layer HTTP): a request to a server listening on 127.0.0.1,
// read as status, content type, body and every Content-Security-Policy header.
import { request, type Server } from "node:http";

export interface Answer {
  status: number;
  type: string | undefined;
  body: string;
  // Every Content-Security-Policy header of the answer, in order
  policies: string[];
}

// One request (GET unless named), with the path written to the wire exactly as given (a URL parser would remove `..`
// before sending)
export function get(
  server: Server,
  path: string,
  method = "GET",
): Promise<Answer> {
  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : 0;
  return new Promise((resolve, reject) => {
    request(
      { host: "127.0.0.1", port, path, method, agent: false },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            type: response.headers["content-type"],
            body: Buffer.concat(chunks).toString(),
            policies: response.rawHeaders.filter(
              (_value, index, raw) =>
                index % 2 === 1 &&
                raw[index - 1]?.toLowerCase() === "content-security-policy",
            ),
          }),
        );
      },
    )
      .on("error", reject)
      .end();
  });
}
