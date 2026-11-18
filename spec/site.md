# Test site: site spec

- **Name:** the test site in `site/`, a private package that shows SvelteDT on pages a real browser can open. It is
  served by a TypeScript server on Node that uses only `node:http` (PRD section 5.3).
- **Status:** part 1 of the site spec. Later parts add their statements to this file; the trace at the end says which
  requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: serving the built site, and the list page that shows the table with synthetic rows.

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before its test; until then the trace check lists it as not yet tested,
  which never counts as a pass.
- **Test layers.**
  - **HTTP**: the site server started in the test's own process, sent real requests, and read as status, headers and
    body; no browser.
  - **component**: a site page component mounted in a simulated DOM, queried through roles, accessible names and
    visible text only. No test ids and no internals.
  - **real browser**: a site page opened in a real engine, in Chromium, Firefox and WebKit unless the statement names
    fewer and says why.
  - **static check**: a scan of the site's source, run in the gate, behind a wrapper that must find a planted canary.
- **The build folder** is the folder the site's build writes and the server serves.
- **Data.** Example data is synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group;
  SRV-02 is reserved for the policy header on every response, which arrives with the strict-policy statements. A
  requirement id from `docs/PRD.md` is written `PRD-W5`.

## 1. Serving (SRV)

**SRV-01** The site server MUST answer each file its build folder held when it started at that file's path, `/` with
`index.html`, and every other path with 404.
- Examples (the test runs every row; the build folder holds `index.html` and `assets/app.js` when the server starts,
  and the test adds `late.html` to it afterwards):

  | Request | Status | Body |
  |---|---|---|
  | `GET /` | 200 | the bytes of `index.html` |
  | `GET /index.html` | 200 | the bytes of `index.html` |
  | `GET /assets/app.js` | 200 | the bytes of `assets/app.js` |
  | `GET /assets/` | 404 | |
  | `GET /no-such-page` | 404 | |
  | `GET /late.html` | 404 | |
  | `GET /../package.json` | 404 | |
  | `GET /%2e%2e/package.json` | 404 | |
  | `GET /assets/..%2fapp.js` | 404 | |

- Reason: the pages must be served to be tested. A path that is not a built file is a mistake or an attack, and
  answering only the files listed at start means no request text ever becomes a file path.
- Layer: HTTP.
- Traces: PRD-W5, PRD-W9.

## 2. The list page (LIST)

**LIST-01** The list page MUST show 20 synthetic rows in a table named by a caption, in the order the site gives them.
- Example: the list page component mounted: one table whose caption is "Orders", with 20 body rows whose first cells
  read "Order 01" to "Order 20" in that order.
- Reason: it is the first look at the table on a real page, and the order of its rows shows that the table keeps the
  order it is given.
- Layer: component.
- Traces: PRD-W5.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SRV-01 | PRD-W5, PRD-W9 |
| LIST-01 | PRD-W5 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-W5 | SRV-01, LIST-01 | in part: sort, both filter kinds, clear and reset, the pager with sizes and the fixed 48 px app bar come with later parts |
| PRD-W9 | SRV-01 | in part: the real-browser runs in three engines in CI come with later parts |

PRD musts of the site left to later parts: PRD-W1, PRD-W2, PRD-W3, PRD-W4, PRD-W6, PRD-W7, PRD-W8, PRD-W10.
