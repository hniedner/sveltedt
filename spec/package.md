# The package and the consumer project: package spec

- **Name:** what a consumer gets: the packed package (the tarball of `@hniedner/sveltedt`) and the consumer project
  in `consumer/`, a SvelteKit app with server rendering that takes SvelteDT from that tarball (CON-01) (PRD section
  5.3, PRD-W8).
- **Status:** part 1 of the package spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: the root export of the packed package and what the tarball holds (PRD-K2), and the consumer
  project's install, server rendering, hydration and strict policy (PRD-K4, PRD-W8, the server-rendered half of
  PRD-S1). Further `exports` subpaths, the Svelte peer floor and the README quick start come with later parts. The
  rule that `svelte` is the only peer dependency and that there is no runtime dependency is SUP-04 of
  `spec/release.md`, not restated here.

## Conventions

- **Statement form.** Each statement is one observable behaviour: an id, one MUST or MUST NOT sentence, an example
  (or an example table: the test runs every row), the reason, the test layer and a `Traces:` line naming the
  requirements of `docs/PRD.md` it serves. It says what happens, never how. Each test carries its statement's id and
  a hash of the statement text.
- **Before its test.** A statement may land before the test that proves it; what an untested statement blocks is
  the method's rule (section 2, step 7).
- **Test layers.**
  - **pack**: the package built and packed from the test's own checkout in the test's run, then the tarball read, or
    handed to the named tool. A tarball left over from an earlier run is never read.
  - **consumer**: the consumer project given that tarball as CON-01 states and built for production in the test's run,
    then read as files (**consumer files**), started and sent real requests through `node:http` and read as status,
    headers and body (**consumer HTTP**), or opened in a real engine, in Chromium, Firefox and WebKit unless the
    statement names fewer and says why (**consumer browser**).
  - A row that the test runs as a canary is a manifest or a file planted in a copy, which must be found.
- **The tarball** is the file the package manager's pack command writes for the repository's root package after the
  package build. **The packed manifest** is the `package.json` inside it.
- **The strict policy** is the one of PRD section 4.4: `default-src 'self'; script-src 'self'; style-src 'self'`.
- **The listener** is a script of the consumer project whose bytes equal the site's listener (`spec/site.md`); it adds
  each `securitypolicyviolation` event of its page, one entry per event, to the array `window.__csp`, which it creates
  and a test reads. "The listener's list" is that array. Being the same bytes, it is proven able to see a violation by
  POL-02 of the site spec.
- **The list page** is the consumer's page at `/`. It renders a `DataTable` with the caption "Orders" and the same
  fixed list of 20 rows, in the same order, as the site's list page (LIST-01, LIST-02 of `spec/site.md`).
- **Hydrated.** The consumer's root layout adds the attribute `data-hydrated` to `body` once it has mounted in the
  browser; a page is hydrated when `body` has that attribute.
- **Data.** Example data is synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group.
  A requirement id from `docs/PRD.md` is written `PRD-K2`.
- **One milestone per statement.** Every example of a statement can be run inside the milestone that owns the
  statement. A part written for a later milestone never adds a row, a path or a page to an earlier statement; it
  writes a new statement with the next free id in its own group, which may cite the earlier one ("as PKG-01, for the
  subpath `./x`"). A statement's test arrives with the pull request that makes its last example runnable.
- **What a statement covers.** A statement covers what its examples show; an earlier statement is never widened to
  anticipate a later part's paths or pages.

## 1. The packed package (PKG)

**PKG-01** The packed manifest's root export `.` MUST have a `types` condition and a `svelte` condition.
- Examples (the first row is the real tarball; the others are canaries, each a packed manifest planted in a copy of
  the tarball's contents):

  | `exports["."]` in the packed manifest | Result |
  |---|---|
  | the real tarball's | passes |
  | `{ "types": "./dist/index.d.ts", "svelte": "./dist/index.js" }` | passes |
  | `{ "svelte": "./dist/index.js" }` | finding: no `types` |
  | `{ "types": "./dist/index.d.ts" }` | finding: no `svelte` |
  | `"./dist/index.js"` (a string, no conditions) | finding |
  | no `exports` field, or none for `.` | finding |

  Other conditions beside these two are not this statement's; neither is any subpath other than `.`; that each
  condition names a file the tarball holds is publint's check (PKG-02). Break that turns it red: the `types` condition
  left out of the root export.
- Reason: a Svelte-aware bundler resolves the component through `svelte`, and TypeScript resolves its types through
  `types`; a condition that names a file the tarball lacks breaks every install while the repository's own tests pass.
- Layer: pack.
- Traces: PRD-K2.

**PKG-02** publint MUST report no error and no warning on the tarball.
- Examples (the first row is the real tarball; the second is a canary planted in a copy of its contents):

  | Tarball | publint |
  |---|---|
  | the real tarball | 0 errors, 0 warnings |
  | the real contents with the packed manifest's `svelte` condition pointing at `./dist/missing.js` | at least one error, found |
  | the real contents with the packed manifest's `repository` field set to a value publint reports only as a warning (an invalid repository value) | at least one warning, found |

  publint's suggestions are listed in the output and do not fail. When publint reads no package or exits without a
  report, the check reports "could not check", which blocks like a finding. Break that turns it red: the manifest's
  `files` field leaves out `dist`.
- Reason: publint checks the published shape the way consumers' tools read it (READ, publint.dev); a warning there
  is a consumer's broken or slow install.
- Layer: pack.
- Traces: PRD-K2.

**PKG-03** The tarball MUST hold only `package.json`, `README.md`, `LICENSE`, `NOTICE` and, under `dist/`, files
ending in `.js`, `.svelte` or `.d.ts` whose names contain no `.test.` and no `.spec.`.
- Examples (the first row is the real tarball; every other row is a canary: the file planted in a copy of its
  contents):

  | File in the tarball | Result |
  |---|---|
  | the real tarball's files | passes |
  | `dist/index.js`, `dist/DataTable.svelte`, `dist/DataTable.svelte.d.ts` | passes |
  | `dist/DataTable.test.js` | finding: a test file |
  | `dist/sort.spec.d.ts` | finding: a test file |
  | `src/lib/index.ts` | finding: source outside `dist/` |
  | `site/server.ts` | finding: the site |
  | `consumer/package.json` | finding: the consumer project |
  | `dist/app.css` | finding: a kind not listed (THEME-04 of `spec/table.md` states the package's no-CSS rule itself) |
  | `.npmrc` | finding: not listed |

  When the tarball cannot be listed, the check reports "could not check". Break that turns it red: the manifest's
  `files` field removed, so the whole repository is packed.
- Reason: what is not listed is either noise a consumer downloads or something that should never leave the
  repository; the build of the component files from `src/lib` also copies test files beside them unless they are
  kept out, so the list is checked on the tarball, not on the configuration. `LICENSE` and `NOTICE` travel with the
  code, as the Apache-2.0 licence asks; that they are there is PKG-04.
- Layer: pack.
- Traces: PRD-K2.

**PKG-04** The tarball MUST hold `LICENSE` and `NOTICE`, each with the same bytes as the repository's file of that name.
- Examples (the first row is the real tarball; the others are canaries, the tarball's contents planted in a copy):

  | Tarball | Result |
  |---|---|
  | the real tarball | passes |
  | the real contents without `NOTICE` | finding |
  | the real contents without `LICENSE` | finding |
  | the real contents with a `NOTICE` that differs from the repository's | finding |

  Break that turns it red: the manifest's `files` field lists `dist` only, so the package manager adds `LICENSE` by
  itself but not `NOTICE`.
- Reason: Apache-2.0 asks that a redistribution carry the licence and the `NOTICE` file; the package manager packs
  `LICENSE` without being asked but never `NOTICE`.
- Layer: pack.
- Traces: PRD-L1, PRD-K2.

**PKG-05** The packed manifest's `peerDependencies.svelte` range MUST admit the Svelte version that the consumer
project's committed lockfile holds.
- Examples (the first row is the real tarball against the real `consumer/pnpm-lock.yaml`; the others are canaries, a
  packed manifest planted in a copy of the tarball's contents, read against a lockfile that holds Svelte 5.33.1):

  | `peerDependencies.svelte` | Result |
  |---|---|
  | the real tarball's range | passes |
  | `^5.20.0` | passes |
  | `^5.40.0` (above the lockfile's version) | finding |
  | `^6.0.0` | finding |

  When the lockfile holds no `svelte` or the packed manifest no `peerDependencies.svelte`, the check reports "could
  not check". Break that turns it red: the peer range raised above the version the consumer's lockfile holds.
- Reason: CON-01 puts the package into the consumer by extracting the tarball, which checks no peer range, as an
  install would; this statement is that check, so a consumer whose Svelte the range refuses cannot pass unseen.
- Layer: pack.
- Traces: PRD-K2, PRD-W8.

## 2. The consumer project (CON)

**CON-01** The consumer project MUST get SvelteDT only from the tarball, extracted into its installed tree after its
frozen install, with its committed files left unchanged.
- Examples (the first two rows are the real consumer project after its install and the extraction; the others are
  canaries, each planted in a copy of the consumer project, which must be found):

  | What is read | Result |
  |---|---|
  | `consumer/node_modules/@hniedner/sveltedt` | a real directory, not a link, holding exactly the tarball's files, with the same names and bytes |
  | `consumer/package.json` and `consumer/pnpm-lock.yaml` | unchanged against the commit (`git status` lists neither) |
  | `@hniedner/sveltedt` named in `consumer/package.json` (any dependency field) | finding |
  | `@hniedner/sveltedt` named in `consumer/pnpm-lock.yaml` | finding |
  | `consumer/node_modules/@hniedner/sveltedt` a link to the repository | finding |

  When `consumer/node_modules/@hniedner/sveltedt` does not exist, the check reports "could not check". Break that
  turns it red: the tarball added with the package manager's `add` command, which writes it into both files.
- Reason: a linked install reads the repository, not the package, so broken `exports`, missing files or types that
  only resolve inside the repository pass unseen; and a tarball named in the committed files would change the
  committed lockfile with every build, which a frozen install refuses. Extraction equals an install here because the
  package has no dependency of its own and no install script (SUP-04 and SUP-06 of `spec/release.md` keep it so), so
  a package manager would add nothing but the files; the one thing an install would check and an extraction does
  not, the peer range, is PKG-05's. If the package ever gains a runtime dependency or an install script, this
  statement is wrong and must be rewritten.
- Layer: consumer files.
- Traces: PRD-W8.

**CON-02** The consumer's server-rendered list page MUST hold the table with the 20 rows of its fixed list.
- Example: `GET /` to the consumer's production server: status 200, and the HTML of the body, read without running
  any script, holds exactly one `table`, whose `caption` reads "Orders", with 20 body rows whose first cells read the
  fixed list's entries in its order ("Order 07", "Order 03", ... "Order 08", as LIST-02 of `spec/site.md`). Break
  that turns it red: the component reads `window` while it renders.
- Reason: most Svelte applications render on the server. A render that touches a browser global (`window`,
  `document`, `localStorage`) throws there, and the page then holds no table, so this example is also the proof that
  the component renders without browser globals (PRD-K4).
- Layer: consumer HTTP.
- Traces: PRD-K4, PRD-W8.

**CON-03** The consumer's server-rendered HTML MUST NOT hold a `style` attribute.
- Example: `GET /`: the status is 200 and the HTML holds the table of CON-02 (otherwise the check reports "could not
  check"), and no element of the HTML, as an HTML parser reads it, has a `style` attribute; text that only contains the
  letters `style=` inside a cell is not an attribute. Break that turns it red: SvelteKit's default page
  shell wrapper `<div style="display: contents">` kept in `consumer/src/app.html`.
- Reason: under the strict policy a static `style` attribute raises a report (PRD-S1, MEASURED in Chromium), and
  server-rendered HTML is where such attributes appear: in the page shell and in markup a component renders.
- Layer: consumer HTTP.
- Traces: PRD-S1.

**CON-04** Every HTML response of the consumer's server MUST carry a `Content-Security-Policy` header that is the
strict policy with one fresh nonce added to `script-src` and nothing else added.
- Examples (the test runs every row; `N1` and `N2` are the nonces of the two responses):

  | Request | `Content-Security-Policy` |
  |---|---|
  | `GET /` | `default-src 'self'; script-src 'self' 'nonce-N1'; style-src 'self'` |
  | `GET /` again | `default-src 'self'; script-src 'self' 'nonce-N2'; style-src 'self'`, with `N2` different from `N1` |
  | `GET /no-such-page` (an HTML 404 page) | the same form, with its own nonce |

  The directives may come in any order; `style-src` carries no nonce, no hash and no `'unsafe-inline'`, and no
  directive carries `'unsafe-eval'`. Break that turns it red: `'unsafe-inline'` added to `style-src` in the
  consumer's policy configuration.
- Reason: the framework's own bootstrap is an inline script, which the strict policy allows only by a nonce; the
  nonce is what the consumer adds for its own scripts (PRD section 4.4), the component needs none, and a nonce that
  repeats across responses protects nothing. Where the nonce sits is what it allows: in `script-src` only, so no
  inline style is ever allowed.
- Layer: consumer HTTP.
- Traces: PRD-W8, PRD-S1.

**CON-05** The list page of the consumer MUST load the listener from its own origin so that it runs before every
other script of the page.
- Example: `GET /`: the HTML holds a `script` element with a `src` that is a path on the consumer (it starts with one
  `/` and names no scheme or host), which the server answers with 200 and the bytes of the site's listener, and which
  has no `async`, no `defer` and no `type` attribute; every other `script` element comes after it, or is a module
  script without `async`. Such a script runs as the parser reaches it, so the listener runs first. Break that turns it
  red: the listener's element placed after the framework's bootstrap script.
- Reason: the listener must record every violation from the page's first script on; a listener that starts late
  misses them, and the 0 of CON-07 would then prove nothing.
- Layer: consumer HTTP.
- Traces: PRD-W8, PRD-S1.

**CON-06** The consumer's list page, built for production, MUST hydrate in place.
- Example: open `/` in each engine: once the page is hydrated, the `table` element the browser built from the
  server's HTML is still in the document; it was not replaced by a new one. A page that is not hydrated within the
  test's time limit fails. Break that turns it red: the list page renders the table inside a branch that differs
  between the server and the browser, so hydration finds a different structure and Svelte renders the table again.
- Reason: a structural mismatch between the server's HTML and the browser's render makes Svelte throw the server's
  markup away and render again, which costs the work and moves focus and scroll. A production build does this
  without a word (its hydration warnings exist only in development), so the only proof there is the element itself;
  the warnings are CON-08's.
- Layer: consumer browser.
- Traces: PRD-K4.

**CON-07** The consumer's list page MUST raise no policy violation by the time it is hydrated.
- Example: in each engine, in this order: the response carries the policy of CON-04; the listener's list exists; the
  page is hydrated; the table shows its 20 body rows; then the list holds 0 entries. A page that does not reach this
  within the test's time limit fails. Break that turns it red: a `style` attribute on an element inside the `body`
  of `consumer/src/app.html`.
- Reason: the component claims 0 violations under the strict policy on a server-rendered page as well as on a
  client-rendered one (PRD-S1); the order of the reads means a 0 cannot come from a page without the header, without
  the listener or before hydration.
- Layer: consumer browser.
- Traces: PRD-S1, PRD-W8.

**CON-08** Opening the consumer's list page on its development server MUST raise no hydration warning.
- Examples (the test runs every row in each engine, records the console from the start, and reads it once the page is
  hydrated, or fails at the test's time limit; a warning is a console message that the page's scripts write and whose
  text starts with `[svelte]`):

  | Consumer | Warnings |
  |---|---|
  | the real consumer project | none |
  | a copy whose list page renders an element only in the browser, before the table | at least one `[svelte] hydration_mismatch`, found |

  The second row shows the test sees a warning when there is one. Messages the browser itself logs (a failed request,
  a policy report) are not warnings in this sense. Break that turns it red: the second row's change made to the real
  list page.
- Reason: Svelte writes its hydration warnings with their `[svelte]` text only in development (a production build
  is silent on a structural mismatch and writes at most a bare link for a changed attribute), so the development
  server is where every mismatch Svelte reports becomes visible. It runs with SvelteKit's development policy, which
  is looser than the strict policy; the policy checks (CON-04, CON-07) are on the production build only.
- Layer: consumer browser.
- Traces: PRD-K4.

**CON-09** The consumer's type check MUST pass with SvelteDT's types resolved from the installed package.
- Examples (the type check is the one the repository uses, `svelte-check`, run in the consumer project after the
  install of CON-01; the second row is a canary planted in a copy of the consumer project):

  | Consumer | Type check |
  |---|---|
  | the real consumer project | 0 errors |
  | a copy with a page that passes `rows={42}` to `DataTable` | at least one error on that line, found |

  The second row shows the types are SvelteDT's own: had they resolved to nothing, the wrong prop would pass. When the
  type check reads no file or exits without a report, the check reports "could not check". Break that turns it red:
  the packed manifest's `types` condition names a file the tarball does not hold.
- Reason: types that resolve inside the repository can still fail from an installed package; a consumer's type check
  is where that shows, and it is the proof PRD-W8 names for broken types.
- Layer: consumer files.
- Traces: PRD-K2, PRD-W8.

**CON-10** The component's styles MUST apply in the consumer through its Tailwind `@source` line naming the installed
package.
- Example: the consumer's stylesheet holds `@source` with the path of the installed package folder; open `/` in each
  engine: the caption is visually hidden as A11Y-13 of `spec/table.md` measures (its bounding box at most 1 by 1 CSS
  px), which only a class Tailwind generated from the package's files can do, since the package ships no CSS
  (PRD-T3). Break that turns it red: the `@source` line removed, so Tailwind, which skips `node_modules`, generates
  none of the component's classes.
- Reason: a consumer who installs the package and forgets the line gets an unstyled table; the consumer project must
  show the line the documentation will tell consumers to write, and show that it is enough.
- Layer: consumer browser.
- Traces: PRD-T3, PRD-W8.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| PKG-01 | PRD-K2 |
| PKG-02 | PRD-K2 |
| PKG-03 | PRD-K2 |
| PKG-04 | PRD-L1, PRD-K2 |
| PKG-05 | PRD-K2, PRD-W8 |
| CON-01 | PRD-W8 |
| CON-02 | PRD-K4, PRD-W8 |
| CON-03 | PRD-S1 |
| CON-04 | PRD-W8, PRD-S1 |
| CON-05 | PRD-W8, PRD-S1 |
| CON-06 | PRD-K4 |
| CON-07 | PRD-S1, PRD-W8 |
| CON-08 | PRD-K4 |
| CON-09 | PRD-K2, PRD-W8 |
| CON-10 | PRD-T3, PRD-W8 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-K2 | PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, CON-09 | in part: the Svelte peer floor arrives with the CI job at the floor; each further `exports` subpath with its own statement; built with `svelte-package` is shown by the tarball's shape, not stated |
| PRD-K4 | CON-02, CON-06, CON-08 | in full for what Svelte reports: server rendering without browser globals (CON-02), a re-render after a structural mismatch on the production build (CON-06), every hydration warning in development (CON-08); a text that differs between server and browser is neither warned about nor re-rendered by Svelte, so no test can see it |
| PRD-W8 | PKG-05, CON-01, CON-02, CON-04, CON-05, CON-07, CON-09, CON-10 | in part: "its files are the README quick start" comes with PRD-D1 |
| PRD-L1 | PKG-04 | in part: the files' presence and text in the repository and `"license"` in `package.json` are not this file's |
| PRD-T3 | CON-10 | in part: the consumer's `@source`; no CSS shipped and the build's variants are `spec/table.md`'s |
| PRD-S1 | CON-03, CON-04, CON-05, CON-07 | in part: the server-rendered half; the client-rendered half is in `spec/site.md` (POL-01, POL-02, POL-04); the component injecting no `style`, `link` or `script` and its build holding no `eval`, `new Function` or string timers have no statement yet (listed as not yet traced in `spec/table.md`) |

PRD musts touched by this file and left to later parts: PRD-K2 (as above), PRD-W8 (as above).
