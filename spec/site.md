# Test site: site spec

- **Name:** the test site in `site/`, a private package that shows SvelteDT on pages a real browser can open. It is
  served by a TypeScript server on Node that uses only `node:http` (PRD section 5.3).
- **Status:** part 1 of the site spec. Later parts add their statements to this file; the trace at the end says which
  requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: serving the built site to `GET` requests, the site's imports of SvelteDT, and the list page that
  shows the table with a fixed list of rows. Other request methods, the policy header, the JSON endpoint and the
  real-browser runs come with later parts.

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before its test; until then the trace check lists it as not yet tested,
  which never counts as a pass.
- **Test layers.**
  - **HTTP**: the site server started in the test's own process and sent real requests through `node:http`, with
    each request path written to the wire exactly as the example gives it (a URL parser would remove `..` before
    sending); read as status, headers and body; no browser.
  - **component**: a site page component mounted in a simulated DOM, queried through roles, accessible names and
    visible text only. No test ids and no internals.
  - **real browser**: a site page opened in a real engine, in Chromium, Firefox and WebKit unless the statement names
    fewer and says why.
  - **static check**: a scan of the site's source, run in the gate, behind a wrapper that must find a planted canary.
- **The build folder** is the folder the site's build writes and the server serves.
- **The list page** is the site's first page; it grows into page "plain" of PRD-W5 as later parts add sort, filters
  and the pager.
- **Data.** Example data is synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group;
  SRV-02 is reserved for the policy header on every response, which arrives with the strict-policy statements. A
  requirement id from `docs/PRD.md` is written `PRD-W5`.

## 1. Serving (SRV)

**SRV-01** The site server MUST answer each file its build folder held when it started at that file's path, `/` with
`index.html`, and every other path with 404.
- Examples (the test runs every row; the build folder holds `index.html` and `assets/app.js` when the server starts,
  its parent folder holds a `package.json`, and the test adds `late.html` to the build folder afterwards; "no file"
  means the body holds the bytes of none of these files):

  | Request | Status | Body |
  |---|---|---|
  | `GET /` | 200 | the bytes of `index.html` |
  | `GET /?dir=rtl` | 200 | the bytes of `index.html` |
  | `GET /index.html` | 200 | the bytes of `index.html` |
  | `GET /assets/app.js` | 200 | the bytes of `assets/app.js` |
  | `GET /assets/` | 404 | no file |
  | `GET /no-such-page` | 404 | no file |
  | `GET /late.html` | 404 | no file |
  | `GET /../package.json` | 404 | no file |
  | `GET /%2e%2e/package.json` | 404 | no file |
  | `GET /assets/..%2f..%2fpackage.json` | 404 | no file |

- Reason: the pages must be served to be tested. A path that is not a built file is a mistake or an attack, and
  answering only the files listed at start means no request text ever becomes a file path.
- Layer: HTTP.
- Traces: PRD-W5.

**SRV-03** Each file the site server answers MUST carry the content type of its kind.
- Examples (the test runs every row, with a build folder holding one file of each kind; later parts add a row for each
  kind their build writes):

  | File | `Content-Type` |
  |---|---|
  | `index.html` | `text/html; charset=utf-8` |
  | `assets/app.js` | `text/javascript; charset=utf-8` |
  | `assets/app.css` | `text/css; charset=utf-8` |
  | `assets/notes.xyz` (a kind not listed) | `application/octet-stream` |

- Reason: browsers act on the content type, not the file name: a module script or a stylesheet of the wrong type is
  refused or ignored, and the page shows blank while every status is 200.
- Layer: HTTP.
- Traces: PRD-W5.

## 2. Imports (IMP)

**IMP-01** The site's source MUST import SvelteDT only through the package's public exports.
- Examples (the scan covers every `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` and `.svelte` file under `site/`
  except its build folder and `node_modules`, the site's Vite and TypeScript configuration included. An import of
  SvelteDT is a specifier that is `@hniedner/sveltedt` or starts with `@hniedner/sveltedt/`, or a relative path that
  resolves into the repository's `src/` folder; a relative path to anything else, such as a shared test fixture, is
  not one. It is allowed only when it is written
  `@hniedner/sveltedt` or `@hniedner/sveltedt/` plus a subpath the `exports` field of the repository's root
  `package.json` names, and when no alias or `paths` entry redirects that name. The test runs every row as a canary
  that must be found):

  | Canary |
  |---|
  | `import { DataTable } from '../../src/lib/DataTable.svelte'` in a `.ts` file |
  | `export { DataTable } from '../../src/lib/index.ts'` in a `.ts` file |
  | `await import('../../src/lib/Pagination.svelte')` in a `.ts` file |
  | `import { DataTable } from '../../src/lib/DataTable.svelte'` inside the `<script>` of a `.svelte` file |
  | `import { DataTable } from '@hniedner/sveltedt/src/lib/DataTable.svelte'`, a subpath `exports` does not name |
  | an alias in the site's Vite configuration that points `@hniedner/sveltedt` at a folder of the repository |
  | a `paths` entry in the site's TypeScript configuration that points `@hniedner/sveltedt` at a folder of the repository |

  A site that imports only `@hniedner/sveltedt` and resolves it as a consumer does, with no alias, passes. The scan
  reports how many files it read; with no root `package.json`, no `exports` field in it, or no file read, it reports
  "could not check", which blocks like a finding.
- Reason: the site may use only what a consumer can; a deep import hides a missing or broken export.
- Layer: static check.
- Traces: PRD-W1.

## 3. The list page (LIST)

**LIST-01** The list page MUST show one table, named by its caption, holding the rows of the site's fixed list.
- Example: the list page component mounted: exactly one table, whose accessible name is its caption "Orders", with
  20 body rows, one per entry of the site's fixed list of 20.
- Reason: it is the first look at the table on a site page. The pager part replaces the fixed list with the site's
  endpoint, and with it this statement.
- Layer: component.
- Traces: PRD-W5.

**LIST-02** The list page MUST show the rows in the order of the site's fixed list.
- Example: the fixed list holds "Order 07", "Order 03", "Order 15", "Order 01", "Order 20", "Order 11", "Order 05",
  "Order 18", "Order 09", "Order 13", "Order 02", "Order 17", "Order 06", "Order 14", "Order 10", "Order 19",
  "Order 04", "Order 12", "Order 16", "Order 08", in that order, and the first cells of the body rows read the same,
  in the same order. The order is neither ascending nor descending, so a table that sorts fails.
- Reason: the table keeps the order it is given (the server's order); the page proves that where a consumer uses it.
  The pager part rewrites this statement against the order of the site's endpoint.
- Layer: component.
- Traces: PRD-W5.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SRV-01 | PRD-W5 |
| SRV-03 | PRD-W5 |
| IMP-01 | PRD-W1 |
| LIST-01 | PRD-W5 |
| LIST-02 | PRD-W5 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-W1 | IMP-01 | in full |
| PRD-W5 | SRV-01, SRV-03, LIST-01, LIST-02 | in part: sort, both filter kinds, clear and reset, the pager with sizes and the fixed 48 px app bar come with later parts |

PRD musts of the site left to later parts: PRD-W2, PRD-W3, PRD-W4, PRD-W6, PRD-W7, PRD-W8, PRD-W9, PRD-W10.
