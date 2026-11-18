# Test site: site spec

- **Name:** the test site in `site/`, a private package that shows SvelteDT on pages a real browser can open. It is
  served by a TypeScript server on Node that uses only `node:http` (PRD section 5.3).
- **Status:** parts 1 to 3 of the site spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: serving the built site to `GET` requests, the site's imports of SvelteDT, and the list page that
  shows the table with a fixed list of rows. Part 2: the strict policy on the site (the header, SRV-02; the listener,
  the canary page, no inline bootstrap, no violation on any page of the build). Other request methods (beyond the
  header SRV-02 puts on every response), the JSON endpoint, the dataset and the views by URL parameter come with
  later parts. Part 3: the site server's start (SRV-05 to SRV-07).

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before the test that proves it; what an untested statement blocks is
  the method's rule (section 2, step 7).
- **Queries.** A test finds elements by role, accessible name and visible text, may read the tag, the ARIA and HTML
  attributes, the ancestors and the descendants of an element so found, and may assert that the component holds no
  element of a named tag or selector; never a test id or a class.
- **Test layers.**
  - **HTTP**: the site server started in the test's own process and sent real requests through `node:http`, with
    each request path written to the wire exactly as the example gives it (a URL parser would remove `..` before
    sending); read as status, headers and body; no browser.
    *The start note.* SRV-01 to SRV-04 start a server for a build folder, listening where the test chooses. SRV-05
    to SRV-07 test the site server's start, the one `node site/server.ts` performs for the folder `dist` beside the
    server file, by performing it in the test's own process for a folder the test names; they read what is written
    to standard output and standard error (through the streams and every console method), the process's exit code
    once the start has settled (the start sets 1 when it refuses, so the program then ends with status 1), restored
    afterwards even when the test fails, and the address the server listens on. Every HTTP test that binds
    127.0.0.1:4173 is in one test file and runs one at a time; before its start it checks that 127.0.0.1:4173 is
    free and otherwise fails as "could not check: 127.0.0.1:4173 is held by another process".
  - **component**: a site page component mounted in a simulated DOM.
  - **real browser**: a site page opened in a real engine, in Chromium, Firefox and WebKit unless the statement names
    fewer and says why.
  - **static check**: a scan of the site's source or of its build folder, run in the gate, behind a wrapper that must
    find a planted canary.
- **The build folder** is the folder the site's build writes and the server serves.
- **The strict policy** is the one of PRD section 4.4, sent as the value
  `default-src 'self'; script-src 'self'; style-src 'self'`.
- **The listener** is the site's script of PRD-S1: it adds each `securitypolicyviolation` event of its page, one entry
  per event, to the array `window.__csp`, which it creates and a test reads. "The listener's list" is that array.
- **The canary page** is a site page that breaks the strict policy on purpose (PRD-W4), served at `/canary.html`. It
  is built and served like every other page.
- **Loaded.** A page has loaded when its `load` event has fired.
- **The list page** is the site's first page, the build's `index.html`, served at `/`; it grows into page "plain" of
  PRD-W5 as later parts add sort, filters and the pager.
- **Data.** Example data is synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group. A
  requirement id from `docs/PRD.md` is written `PRD-W5`.
- **One milestone per statement.** Every example of a statement can be run inside the milestone that owns the
  statement. A part written for a later milestone never adds a row, a page or a view to an earlier statement; it
  writes a new statement with the next free id in its own group, which may cite the earlier one ("as POL-04, for
  page full"). A statement's test arrives with the pull request that makes its last example runnable.
- **What a statement covers.** A statement covers what its examples show; an earlier statement is never widened to
  anticipate a later part's pages. POL-01 and POL-04 are the deliberate exception: their rows name every `.html` file
  of the build, so a page joins them by existing. A later part whose page cannot meet their rows (a page with no
  table) changes their rows before that page is built, by a reviewer's ruling, knowing that this changes their hashes
  and makes their tests stale on purpose.

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

**SRV-02** Every response of the site server MUST carry exactly one `Content-Security-Policy` header, whose value is
the strict policy.
- Examples (the test runs every row, with the build folder of SRV-01; the value is compared as a string, exactly):

  | Request | Status | `Content-Security-Policy` |
  |---|---|---|
  | `GET /` | 200 | `default-src 'self'; script-src 'self'; style-src 'self'` |
  | `GET /assets/app.js` | 200 | `default-src 'self'; script-src 'self'; style-src 'self'` |
  | `GET /no-such-page` | 404 | `default-src 'self'; script-src 'self'; style-src 'self'` |
  | `GET /../package.json` | 404 | `default-src 'self'; script-src 'self'; style-src 'self'` |
  | `POST /` | any (not asserted here) | `default-src 'self'; script-src 'self'; style-src 'self'` |

  A `Content-Security-Policy-Report-Only` header in its place fails: the browser then reports and blocks nothing.
  Break that turns it red: the header set only on answers with status 200.
- Reason: the policy is proven only where the browser enforces it, and that is every response, a 404 page included.
- Layer: HTTP.
- Traces: PRD-W4.

**SRV-03** Each file the site server answers MUST carry the content type of its kind.
- Examples (the test runs every row, with a build folder holding one file of each kind):

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

**SRV-04** The site server MUST NOT answer a file that it reaches through a symbolic link in its build folder.
- Examples (the test runs every row; the build folder and its parent are those of SRV-01; each row plants its link in
  the build folder, a symbolic link's target written relative to the link, and then starts its own server; "no
  file" as in SRV-01):

  | Link planted | Request | Status | Body |
  |---|---|---|---|
  | `linkdir`, to the build folder's parent | `GET /linkdir/package.json` | 404 | no file |
  | `outside.json`, to the parent's `package.json` | `GET /outside.json` | 404 | no file |
  | `same.js`, to `assets/app.js` | `GET /same.js` | 404 | no file |
  | `same.js`, to `assets/app.js` | `GET /assets/app.js` | 200 | the bytes of `assets/app.js` |
  | `loop`, to the build folder itself | the server starts, then `GET /` | 200 | the bytes of `index.html` |
  | `loop`, to the build folder itself | `GET /loop/index.html` | 404 | no file |
  | `hard.js`, a hard link to `assets/app.js` | `GET /hard.js` | 200 | the bytes of `assets/app.js` |

  A symbolic link is not a file the build folder holds (SRV-01); a hard link is one: it is the file under a second
  name. A symbolic link that points back into the build folder is refused too; its target is answered only at the
  target's own path. Break that turns it red: the server follows links and answers a file at the link's path.
- Reason: a build tool or a careless copy can leave a link in the build folder, and a server that follows it serves
  files outside the build folder, up to the whole repository, or never starts when the link loops.
- Layer: HTTP.
- Traces: PRD-W5.

**SRV-05** The site server's start, for a build folder that holds a file, MUST listen on `127.0.0.1` port 4173 only.
- Examples (the test runs every row, as the Conventions' start note says, for a build folder holding `index.html`,
  and closes the server afterwards):

  | Check | Result |
  |---|---|
  | the address the listening server reports | address `127.0.0.1`, family IPv4, port 4173 |
  | `GET http://127.0.0.1:4173/` | 200, the bytes of `index.html` |

  Break that turns it red: the server listens on all addresses (`0.0.0.0` or `::`) or on `localhost`.
- Reason: the tests and the maintainer find the site at one known address, and a test site that will serve test
  switches (PRD-W2) must not be reachable from the network; the real-browser runs of PRD-W9 need that address. Vite's
  `preview` listens on `localhost` by default and on all addresses only when asked, on port 4173 (FETCHED
  https://vite.dev/config/preview-options and https://vite.dev/config/server-options, 2026-11-18); SvelteKit's
  adapter-node listens on `0.0.0.0` by default (FETCHED https://svelte.dev/docs/kit/adapter-node, 2026-11-18), which
  suits a production server, not a test site. The port is fixed: no requirement asks for a setting. The real program,
  `node site/server.ts`, first runs in the tests of the real-browser statements of this file (POL-02, POL-04), which
  start the site with the site's build, then `node site/server.ts`.
- Layer: HTTP.
- Traces: PRD-W9.

**SRV-06** The site server's start MUST refuse when its build folder is missing or holds no file, or when
127.0.0.1:4173 is in use, checking the folder before the port, and name the cause.
- Examples (the test runs every row, as the Conventions' start note says; `<build folder>` is the path of the folder
  as the test passed it; "refused" means: exactly the one line named on standard error, nothing of the site's server
  listening on 127.0.0.1:4173 afterwards, and the exit code 1):

  | Before the start | The line on standard error |
  |---|---|
  | no folder at `<build folder>` | "The site: no build folder at <build folder>; build the site first." |
  | an empty folder at `<build folder>` | "The site: the build folder <build folder> holds no file; build the site first." |
  | a folder holding only an empty folder `assets` | the same line as the row above |
  | a folder holding only a symbolic link `index.html` to a file outside it (not a file, SRV-04) | the same line as the row above |
  | no folder at `<build folder>`, and the test itself listening on 127.0.0.1:4173 | the no-folder line |
  | the build folder of SRV-05, and the test itself listening on 127.0.0.1:4173 | "The site: 127.0.0.1:4173 is in use." |

  In the last two rows the test's own listener is what still holds the port: the control that the port was taken.
  Break that turns it red: the server tries the next free port when 4173 is in use.
- Reason: a site with no files serves nothing, and the real-browser tests would chase a missing page instead of a
  missing build (a folder that holds files but no `index.html` is a build mistake this rule does not catch); a server
  that moved to another port would leave the tests talking to whatever holds 4173. Refusing at once with the cause
  follows the stricter practice: Vite's `preview` refuses a missing output folder from its command line ("The
  directory … does not exist. Did you build your project?") and tries the next port unless `strictPort` is set
  (FETCHED https://vite.dev/config/preview-options and
  https://github.com/vitejs/vite/blob/main/packages/vite/src/node/preview.ts, 2026-11-18); adapter-node documents
  neither case (FETCHED https://svelte.dev/docs/kit/adapter-node, 2026-11-18). Refusing a folder that holds no file
  is this site's own rule.
- Layer: HTTP.
- Traces: PRD-W9.

**SRV-07** The site server's start MUST write exactly one line to standard output, "The site:
http://127.0.0.1:4173/", when it listens, and nothing when it refuses.
- Examples (the test runs every row, as the Conventions' start note says): the build folder of SRV-05: standard
  output holds exactly that line; each row of SRV-06: standard output holds nothing.
  Break that turns it red: the line is written before the checks, so a refused start shows it.
- Reason: the maintainer starts the site and needs its address; a line from a start that then refuses would send the
  maintainer to an address where nothing answers.
- Layer: HTTP.
- Traces: PRD-W9.

## 2. Imports (IMP)

**IMP-01** The site's source MUST import SvelteDT only through the package's public exports.
- Examples (the scan covers every `.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` and `.svelte` file under `site/` except
  its build folder and `node_modules`, the site's Vite and TypeScript configuration included, and every `.css` file
  there, whose path-taking at-rules (`@import`, `@source`, `@plugin`, `@config`, `@reference`) and `source(...)`
  arguments it reads as imports; `source(none)`, `@source not` and `@source inline(...)` name no path and are not
  imports. An import of SvelteDT is a specifier that is `@hniedner/sveltedt` or starts with `@hniedner/sveltedt/`, or a
  relative path that resolves, as written and without following links, into the repository's `src/` folder or into the
  package's build output (`dist/`), or to the repository root or a folder above it (which holds the repository's own
  `src/`); a relative path to anything else, such as a shared test fixture, is not one. It is allowed only when it is
  written `@hniedner/sveltedt` or `@hniedner/sveltedt/` plus a subpath the `exports` field of the repository's root
  `package.json` names, and when no alias or `paths` entry redirects that name. A `@source` path or `source(...)`
  argument into the installed package (`node_modules/@hniedner/sveltedt`, a link to the repository root while the
  package is a workspace member) is allowed only when, resolved as a path (so `./`, `..` and a trailing slash do not
  count), it names exactly the deepest folder that contains, at any depth, every file the `exports` field points at
  under every condition (with one target, that file's folder); a folder above it or below it, or a glob, is a
  finding. The test runs every row as a canary that must be found; each
  file canary is planted in `site/src/`, where `../../` reaches the repository root, and the rows that name the
  installed package run against a root `package.json` whose `exports` targets all lie in `src/lib`):

  | Canary |
  |---|
  | `import { DataTable } from '../../src/lib/DataTable.svelte'` in a `.ts` file |
  | `export { DataTable } from '../../src/lib/index.ts'` in a `.ts` file |
  | `await import('../../src/lib/Pagination.svelte')` in a `.ts` file |
  | `import { DataTable } from '../../dist/index.js'` in a `.ts` file |
  | `import { DataTable } from '../../src/lib/DataTable.svelte'` inside the `<script>` of a `.svelte` file |
  | `import { DataTable } from '@hniedner/sveltedt/src/lib/DataTable.svelte'`, a subpath `exports` does not name |
  | an alias in the site's Vite configuration that points `@hniedner/sveltedt` at a folder of the repository |
  | a `paths` entry in the site's TypeScript configuration that points `@hniedner/sveltedt` at a folder of the repository |
  | `@source '../../src';` in a `.css` file |
  | `@source '../../';` in a `.css` file (the repository root, which holds `src/`) |
  | `@source '../node_modules/@hniedner/sveltedt';` in a `.css` file (the installed package's own folder) |
  | `@source '../node_modules/@hniedner/sveltedt/src';` in a `.css` file (above `src/lib`) |
  | `@source '../node_modules/@hniedner/sveltedt/src/lib/parts';` in a `.css` file (below `src/lib`) |
  | `@source '../node_modules/@hniedner/sveltedt/src/lib/**/*.svelte';` in a `.css` file (a glob) |
  | `@import 'tailwindcss' source('../node_modules/@hniedner/sveltedt');` in a `.css` file |
  | `@import 'tailwindcss' source('../../src');` in a `.css` file |

  A site that imports only `@hniedner/sveltedt` and resolves it as a consumer does, with no alias, passes, and so does a
  `@source` that names that deepest folder through the installed name
  (`@source '../node_modules/@hniedner/sveltedt/src/lib';`, or the same with a trailing slash), and one that names the
  site's own folder (`@source '../';`). The scan reports how many files it read; with no root `package.json`, no
  `exports` field in it, an `exports` field whose deepest folder would be the package's own folder, or no file read,
  it reports "could not check", which blocks like a finding.
- Reason: the site may use only what a consumer can; a deep import hides a missing or broken export. A `@source` on
  the whole installed package reaches the repository root through the workspace link: the site's built stylesheet was
  46.89 kB with it against 5.18 kB with `@source` on `src/lib` (MEASURED 2026-11-18, the site's Vite build, by the
  build that found it), so the site's CSS would also change with unrelated text (INFERRED); a folder below the deepest
  one can leave out component files, whose classes would then be missing. A consumer's installed package holds only the
  packed files, so the whole-package `@source` a consumer writes is proven in the consumer project (CON-10).
- Layer: static check.
- Traces: PRD-W1.

## 3. The list page (LIST)

**LIST-01** The list page MUST show one table, named by its caption, holding the rows of the site's fixed list.
- Example: the list page component mounted: exactly one table, whose accessible name is its caption "Orders", with
  20 body rows, one per entry of the site's fixed list of 20.
- Reason: it is the first look at the table on a site page.
- Layer: component.
- Traces: PRD-W5.

**LIST-02** The list page MUST show the rows in the order of the site's fixed list.
- Example: the fixed list holds "Order 07", "Order 03", "Order 15", "Order 01", "Order 20", "Order 11", "Order 05",
  "Order 18", "Order 09", "Order 13", "Order 02", "Order 17", "Order 06", "Order 14", "Order 10", "Order 19",
  "Order 04", "Order 12", "Order 16", "Order 08", in that order, and the first cells of the body rows read the same,
  in the same order. The order is neither ascending nor descending, so a table that sorts fails.
- Reason: the table keeps the order it is given (the server's order); the page proves that where a consumer uses it.
- Layer: component.
- Traces: PRD-W5.

## 4. The strict policy on the site (POL)

**POL-01** Each HTML page the build folder holds MUST load the listener from the site's own origin so that it runs
before every other script of the page.
- Examples (the test runs every row against the site's real build; it lists the build folder's `.html` files, reads
  each as the server answers it at its path, and reports "could not check" when the list lacks `index.html` or
  `canary.html`):

  | Page | The listener | Every other `script` element |
  |---|---|---|
  | `index.html` (`GET /`) | present | after the listener, or a module script without `async` |
  | `canary.html` (`GET /canary.html`) | present | after the listener, or a module script without `async` |
  | any other `.html` file of the build, at its path | present | after the listener, or a module script without `async` |

  "The listener" here means: a `script` element with a `src` that is a path on the site (it starts with one `/` and
  names no scheme or host), which the server answers with 200 and `text/javascript; charset=utf-8`, and which has no
  `async`, no `defer` and no `type` attribute. Such a script runs as the parser reaches it, and a module script
  without `async` runs only after parsing ends, so either way the listener runs first. Break that turns it red: the
  listener's element given `defer`, or a classic script placed before it.
- Reason: the listener must record every violation the bundle causes from its first statement; a listener that
  starts late misses them, and the 0 of POL-04 would then prove nothing.
- Layer: HTTP.
- Traces: PRD-W4, PRD-S1.

**POL-02** On the canary page, the listener's list MUST hold at least one policy violation once the page has loaded.
- Example: the canary page, whose own script, a file of the build loaded by `src`, calls `setAttribute('style', ...)`
  on one of its elements when it starts (a write the strict policy blocks; a write to one property of `element.style`
  is not blocked and would not do). In each engine, in this order: the response carries the strict policy (SRV-02); the
  listener's list exists; after the page has loaded, the list holds at least one entry. Break that turns it red: the
  canary's write removed.
- Reason: it proves the proof can fail. A violation raised by a script that runs as the page starts is in the list once
  the page has loaded, so a listener that records late, or never, shows up here before it can make POL-04's 0
  meaningless.
- Layer: real browser.
- Traces: PRD-W4, PRD-S1.

**POL-03** The HTML files of the site's build MUST NOT hold an inline script (a `script` element with text, an
event-handler attribute or a `javascript:` URL) or an inline `style` element.
- Examples (the scan reads every `.html` file of the build folder; the test runs every row as a canary planted in a
  copy of the built `index.html`, which must be found):

  | Canary |
  |---|
  | `<script>window.start = 1</script>` |
  | `<script type="module">import './assets/app.js'</script>` |
  | `<script type="importmap">{"imports":{}}</script>` |
  | `<style>body { margin: 0 }</style>` |
  | `<body onload="start()">` (an event-handler attribute) |
  | `<a href="javascript:start()">Start</a>` |

  A `script` element with a `src` and no text, and a `link rel="stylesheet"` to a file of the build, pass. A `style`
  attribute is not this scan's: POL-04 finds it in the browser. The scan reports how many HTML files it read; when it
  reads none, it reports "could not check", which blocks like a finding. Break that turns it red: the build writes
  its entry script into `index.html` instead of a file.
- Reason: the strict policy blocks inline script and style, so an inline bootstrap either leaves the page blank or
  pushes someone to add `'unsafe-inline'`, which voids the policy; the scan names the file before a browser run does.
- Layer: static check.
- Traces: PRD-W4.

**POL-04** Each HTML page the build folder holds, other than the canary page, MUST raise no policy violation by the
time it has loaded and its table has rendered.
- Examples (the test lists the build folder's `.html` files and reports "could not check" when the list lacks
  `index.html`; it runs every row in each engine, in this order: the response carries the strict policy (SRV-02);
  the listener's list exists; the page has loaded; the page shows what the row names; then the list holds 0 entries.
  A page that does not show it within the test's time limit fails):

  | Page | The page shows |
  |---|---|
  | `index.html` (`GET /`) | the table's 20 body rows (LIST-01) |
  | any other `.html` file of the build except `canary.html`, at its path | at least one region of a table (A11Y-09) or the alert of RND-05 |

  Break that turns it red: a `style` attribute on an element inside the `body` of the list page's `index.html`.
- Reason: the component claims 0 violations under the strict policy on a client-rendered page (PRD-S1); the order of
  the reads means a 0 cannot come from a page without the header, without the listener or without the table.
- Layer: real browser.
- Traces: PRD-S1, PRD-W4.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| SRV-01 | PRD-W5 |
| SRV-02 | PRD-W4 |
| SRV-03 | PRD-W5 |
| SRV-04 | PRD-W5 |
| SRV-05 | PRD-W9 |
| SRV-06 | PRD-W9 |
| SRV-07 | PRD-W9 |
| IMP-01 | PRD-W1 |
| LIST-01 | PRD-W5 |
| LIST-02 | PRD-W5 |
| POL-01 | PRD-W4, PRD-S1 |
| POL-02 | PRD-W4, PRD-S1 |
| POL-03 | PRD-W4 |
| POL-04 | PRD-S1, PRD-W4 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-W1 | IMP-01 | in full |
| PRD-W4 | SRV-02, POL-01, POL-02, POL-03, POL-04 | in part: SRV-02 binds every response, the JSON endpoint's included, but its examples show page paths only; the endpoint part proves the header on the endpoint's responses in a statement of its own |
| PRD-W5 | SRV-01, SRV-03, SRV-04, LIST-01, LIST-02 | in part: sort, both filter kinds, clear and reset, the pager with sizes and the fixed 48 px app bar come with later parts |
| PRD-S1 | POL-01, POL-02, POL-04 | in part: the client-rendered half, on every HTML page of the site's build; the server-rendered half comes with the consumer project (PRD-W8) |
| PRD-W9 | SRV-05, SRV-06, SRV-07 | in part, enabling only: SRV-05 to SRV-07 give the real-browser runs one known address; none of W9's own text (the runs, the three engines, CI, the consumer project's journeys, P2) is proven yet |

PRD musts of the site left to later parts: PRD-W2, PRD-W3, PRD-W6, PRD-W7 (no statement yet; first with the part
that brings the PRD-T4 token set), PRD-W8, PRD-W9 (all of its own text; SRV-05 to SRV-07 only enable it), PRD-W10.
