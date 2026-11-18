# The package and the consumer project: package spec

- **Name:** what a consumer gets: the packed package (the tarball of `@hniedner/sveltedt`) and the consumer project
  in `consumer/`, a SvelteKit app with server rendering that takes SvelteDT from that tarball (CON-01) (PRD section
  5.3, PRD-W8).
- **Status:** part 1 of the package spec. Later parts add their statements to this file; the trace at the end says
  which requirements the statements so far cover.
- Field names: no
- **Scope:** part 1: the root export of the packed package, what the tarball holds and its licence files (PRD-K2,
  PRD-L1), and the consumer project's install, peer check, type check, stylesheet import, server rendering,
  hydration, server HTML and policy header (PRD-K2, PRD-K4, PRD-T3, PRD-W8, part of PRD-S1). The server-rendered
  zero-violation check waits for the owner's decision on PRD-S1 (CON-07 is reserved for it). Part 1 also states the
  `./styles.css` export (PKG-05). Further `exports` subpaths,
  the Svelte peer floor and the README quick start come with later parts. The rule that `svelte` is the only peer
  dependency and that there is no runtime dependency is SUP-04 of `spec/release.md`, not restated here.

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
  - **consumer**: a copy of the consumer project with that tarball installed as CON-01 states, built for production in
    the test's run unless the statement names its development server, then read as files or handed to the named tool
    (**consumer files**), started and sent real requests through `node:http` and read
    as status, headers and body (**consumer HTTP**), or opened in a real engine, in Chromium, Firefox and WebKit unless
    the statement names fewer and says why (**consumer browser**).
  - A row that the test runs as a canary is a manifest or a file planted in a copy, which must be found.
- **The tarball** is the file the package manager's pack command writes for the repository's root package after the
  package build. **The packed manifest** is the `package.json` inside it.
- **The strict policy** is the one of PRD section 4.4: `default-src 'self'; script-src 'self'; style-src 'self'`.
- **The listener** is a script of the consumer project whose bytes equal what the site's server answers at the
  listener's `src` (POL-01 of `spec/site.md`); it adds
  each `securitypolicyviolation` event of its page, one entry per event, to the array `window.__csp`, which it creates
  and a test reads. "The listener's list" is that array. Being the same bytes, it is proven able to see a violation by
  POL-02 of the site spec.
- **The list page** is the consumer's page at `/`. It renders a `DataTable` with the caption "Orders" and the same
  fixed list of 20 rows, in the same order, as the site's list page (LIST-01, LIST-02 of `spec/site.md`).
- **Hydrated.** The consumer's root layout adds the attribute `data-hydrated` to `body` once it has mounted in the
  browser; a page is hydrated when `body` has that attribute.
- **Data.** Example data is synthetic.
- **Ids.** A statement keeps its id while its meaning stays. A new behaviour takes the next free number in its group.
  A requirement id from `docs/PRD.md` is written `PRD-K2`. CON-07 is reserved for the server-rendered zero-violation
  statement, which waits for the owner's decision on PRD-S1; a reserved id is not free.
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
- Reason: without `types` TypeScript finds no types for the package, and without `svelte` a Svelte-aware bundler
  cannot resolve the component; the repository's own tests pass either way.
- Layer: pack.
- Traces: PRD-K2.

**PKG-02** publint MUST report no error and no warning on the tarball.
- Examples (the first row is the real tarball; the second is a canary planted in a copy of its contents):

  | Tarball | publint |
  |---|---|
  | the real tarball | 0 errors, 0 warnings |
  | the real contents with the packed manifest's `svelte` condition pointing at `./dist/missing.js` | at least one error, found |
  | the real contents with the packed manifest's `repository` field set to a value for which publint reports its rule `INVALID_REPOSITORY_VALUE` at the level warning | that rule at that level, found |

  publint's suggestions are listed in the output and do not fail. When publint reads no package or exits without a
  report, the check reports "could not check", which blocks like a finding. Break that turns it red: the manifest's
  `files` field leaves out `dist`.
- Reason: publint checks the published shape the way consumers' tools read it (READ, publint.dev); a warning there
  marks a published shape that some consumers' tools read differently from ours.
- Layer: pack.
- Traces: PRD-K2.

**PKG-03** The tarball MUST hold only `package.json`, `README.md`, `LICENSE`, `NOTICE` and, under `dist/`, files
ending in `.js`, `.svelte` or `.d.ts` whose names contain no `.test.` and no `.spec.`, and one `.css` file, the
target of the `./styles.css` export (PKG-05).
- Examples (the first row is the real tarball; every other row is a canary: the file planted in a copy of its
  contents):

  | File in the tarball | Result |
  |---|---|
  | the real tarball's files | passes |
  | `dist/index.js`, `dist/DataTable.svelte`, `dist/DataTable.svelte.d.ts`, `dist/styles.css` | passes |
  | `dist/DataTable.test.js` | finding: a test file |
  | `dist/sort.spec.d.ts` | finding: a test file |
  | `src/lib/index.ts` | finding: source outside `dist/` |
  | `site/server.ts` | finding: the site |
  | `consumer/package.json` | finding: the consumer project |
  | `dist/app.css` beside `dist/styles.css` | finding: a second stylesheet (THEME-04 of `spec/table.md`) |
  | `.npmrc` | finding: not listed |

  That a listed file is present is not this statement's (PKG-02, PKG-04 and the README's own part check that). When
  the tarball cannot be listed, the check reports "could not check". Break that turns it red: the manifest's `files`
  field removed, so the whole repository is packed.
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

**PKG-05** The packed manifest's `exports` MUST map `./styles.css` to the package's stylesheet under exactly the
conditions `style` and `default`, both naming the same file in the tarball.
- Examples (the first row is the real manifest; every other row is a canary planted in a copy of it, which must be
  found):

  | `exports["./styles.css"]` | Result |
  |---|---|
  | `{ "style": "./dist/styles.css", "default": "./dist/styles.css" }`, the file in the tarball | passes |
  | `{ "style": "./dist/styles.css" }` | finding: no `default` |
  | `{ "default": "./dist/styles.css" }` | finding: no `style` |
  | absent | finding |
  | `{ "style": "./dist/x.css", "default": "./dist/x.css" }`, no such file in the tarball | finding |

  When the manifest cannot be read, the check reports "could not check".
- Reason: one import line serves every host. MEASURED 2026-11-18 in a probe (three packed stubs installed with pnpm
  12.19.0, built with Vite 8.3.8 and, for Tailwind, `@tailwindcss/vite` 4.3.5): with `style` and `default` the
  specifier `@hniedner/sveltedt/styles.css` resolves from a JavaScript import, from a CSS `@import`, and from a
  Tailwind 4 `@import ... layer(components)`, landing inside that layer; with `style` alone the JavaScript import
  fails; `default` alone resolved in all three, and `style` stays for tools that resolve CSS by that condition
  (INFERRED: not measured beyond these three). PRD-T3's probe in the consumer project is still owed: CON-10
  runs it there.
- Layer: pack.
- Traces: PRD-K2, PRD-T3.

## 2. The consumer project (CON)

**CON-01** The consumer test MUST install SvelteDT with the package manager from the tarball into a copy of the
consumer project, and leave the committed consumer project unchanged.
- Examples (the test copies the files git tracks under `consumer/`, and nothing else, to a temporary folder, installs
  the copy from its copied lockfile unchanged, then adds the tarball with one package-manager command that fetches
  nothing from the registry (`pnpm add -D --offline` and the tarball's path); the first three rows are read after that,
  the others are canaries, each planted in a copy, which must be found):

  | What is read | Result |
  |---|---|
  | the copy's `node_modules/@hniedner/sveltedt`, links followed | lies under the copy's `node_modules/.pnpm/`, and holds exactly the tarball's files, with the same names and bytes |
  | the copy's lockfile | records the tarball as the source of `@hniedner/sveltedt` |
  | `consumer/package.json` and `consumer/pnpm-lock.yaml` in the checkout | the same bytes after the test as before it, and neither names `@hniedner/sveltedt` |
  | `@hniedner/sveltedt` named in the committed `consumer/package.json` (any dependency field) | finding |
  | the copy's installed package resolving to a folder of the repository outside the copy | finding |

  The copy includes the consumer's own tracked package-manager settings (SUP-10 of `spec/release.md`). When the copy
  holds no installed `@hniedner/sveltedt`, the check reports "could not check". Break that turns it red: the committed
  `consumer/package.json` given `"@hniedner/sveltedt": "link:.."`.
- Reason: a package is tested as a consumer gets it: packed, then installed by the package manager into a project of its
  own; a linked install reads the repository instead, so broken `exports`, missing files or types that only resolve
  inside the repository pass unseen. The committed project names no tarball, so its frozen install never meets a tarball
  whose checksum changes with every build, and no `file:` entry is committed. A reader of the README quick start adds
  the package the same way, with the same command form (`pnpm add -D @hniedner/sveltedt`): as a development dependency,
  which the Node adapter bundles into the app's server build ("Development dependencies will be bundled into your app",
  READ, svelte.dev/docs/kit/adapter-node); the Svelte documentation recommends neither form (READ, its packaging, FAQ
  and adapter pages), so this one is stated here once. The two installs run in the consumer test itself; if they ever
  move into a workflow step, SUP-05 applies to them and this statement must be revisited.
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
- Examples (the test runs every row; no element of the HTML, as an HTML parser reads it, may have a `style`
  attribute; text that only contains the letters `style=` inside a cell is not an attribute):

  | Request | The response | `style` attributes |
  |---|---|---|
  | `GET /` | status 200, holding the table of CON-02 (otherwise "could not check") | none |
  | `GET /no-such-page` | status 404, the HTML error page (otherwise "could not check") | none |

  Break that turns it red: SvelteKit's default page shell wrapper `<div style="display: contents">` kept in
  `consumer/src/app.html`.
- Reason: under the strict policy a static `style` attribute raises a report (PRD-S1, MEASURED in Chromium), and
  server-rendered HTML is where such attributes appear: in the page shell and in markup a component renders.
- Layer: consumer HTTP.
- Traces: PRD-S1, PRD-W8.

**CON-04** The consumer server's HTML responses to the list page and to a page that does not exist MUST each carry a
`Content-Security-Policy` header that is the strict policy with one fresh nonce added to `script-src` and, as its only
other addition, the `style-src-attr` allowance of PRD-W8.
- Examples (the test runs every row; `N1` and `N2` are the nonces of the two responses; the hash is the one measured on
  2026-11-17 for the announcer's style, recomputed as PRD-D3 says when SvelteKit changes that style):

  | Request | `Content-Security-Policy` |
  |---|---|
  | `GET /` | `default-src 'self'; script-src 'self' 'nonce-N1'; style-src 'self'; style-src-attr 'unsafe-hashes' 'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=' 'report-sample'` |
  | `GET /` again | the same, with `'nonce-N2'`, `N2` different from `N1` |
  | `GET /no-such-page` (an HTML 404 page) | the same form, with its own nonce |

  The directives may come in any order; `style-src` carries no nonce, no hash and no `'unsafe-inline'`; `style-src-attr`
  carries exactly `'unsafe-hashes'`, the hash of SvelteKit's route announcer style and `'report-sample'`; no directive
  carries `'unsafe-eval'`. Break that turns it red: `'unsafe-inline'` added to `style-src` in the consumer's policy
  configuration.
- Reason: the framework's own bootstrap is an inline script, which the strict policy allows only by a nonce; the
  nonce is what the consumer adds for its own scripts (PRD section 4.4), the component needs none, and a nonce that
  repeats across responses protects nothing. Where the nonce sits is what it allows: in `script-src` only; the one
  `style-src-attr` hash allows only the framework's announcer style (PRD-W8, MEASURED in three engines on
  SvelteKit 2.21.1 and 3.2.0), so no other inline style is allowed.
- Layer: consumer HTTP.
- Traces: PRD-W8, PRD-S1.

**CON-05** The list page of the consumer MUST load the listener from its own origin so that it runs before every
other script of the page.
- Example: `GET /`: the HTML holds a `script` element with a `src` that is a path on the consumer (it starts with one
  `/` and names no scheme or host), which the server answers with 200 and the bytes of the listener, and which
  has no `async`, no `defer` and no `type` attribute; every other `script` element comes after it, or is a module
  script without `async`. Such a script runs as the parser reaches it, so the listener runs first. Break that turns it
  red: the listener's element placed after the framework's bootstrap script.
- Reason: the listener must record every violation from the page's first script on; a listener that starts late
  misses them, and any check of the page's violations would then prove nothing.
- Layer: consumer HTTP.
- Traces: PRD-W8, PRD-S1.

**CON-06** The consumer's list page, built for production, MUST hydrate in place.
- Example: open `/` in each engine: once the page is hydrated, the `table` element the browser built while parsing the
  server's HTML, taken before any of the page's scripts runs, is still in the document; it was not replaced by a new
  one. A page that is not hydrated within the test's time limit fails. Break that turns it red: the list page renders
  the table inside a branch that differs between the server and the browser, so hydration finds a different structure
  and Svelte renders the table again.
- Reason: a structural mismatch between the server's HTML and the browser's render makes Svelte throw the server's
  markup away and render again, which costs the work and can move focus and scroll (INFERRED). A production build does
  this without a word (its hydration warnings exist only in development), so the only proof there is the element itself;
  the warnings are CON-08's.
- Layer: consumer browser.
- Traces: PRD-K4.

**CON-08** Opening the consumer's list page on its development server MUST raise no hydration warning.
- Examples (the test runs every row in each engine, records the console from the start, and reads it once the page is
  hydrated, or fails at the test's time limit; a warning is a console message that the page's scripts write and whose
  text contains `[svelte] hydration_`; the second row shows, in each engine, that the test reads such a message):

  | Consumer | Warnings |
  |---|---|
  | the real consumer project | none |
  | a copy whose list page renders an `img` whose `src` differs between the server and the browser | at least one `[svelte] hydration_attribute_changed`, found |

  The second row shows the test sees a warning when there is one. Messages the browser itself logs (a failed request,
  a policy report) are not warnings in this sense. Break that turns it red: the second row's change made to the real
  list page.
- Reason: Svelte writes its hydration warnings with their `[svelte]` text only in development (a production build
  is silent on a structural mismatch and writes at most a bare link for a changed attribute), so the development
  server is where every mismatch Svelte reports becomes visible. It runs with SvelteKit's development policy, which
  is looser than the strict policy; the policy checks (CON-03, CON-04) are on the production build only.
- Layer: consumer browser.
- Traces: PRD-K4.

**CON-09** The consumer's type check MUST pass with SvelteDT's types resolved from the installed package.
- Examples (the type check is the one the repository uses, `svelte-check` 4.7.0 or later, which has `--config`, run in
  the copy of CON-01 after its build, which also writes SvelteKit's generated type configuration, with the copy's own
  configuration file (its `vite.config`, since SvelteKit 3 reads no `svelte.config.js`) named as its configuration, so
  that no configuration outside the copy is read; the second row is a canary planted in a copy of the consumer project):

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

**CON-10** The component's styles MUST apply in the consumer through one import of the package's stylesheet by its
public specifier.
- Examples (in the Tailwind 4 app of the consumer project (PRD-W8), whose stylesheet holds `@import "tailwindcss";` and
  then `@import "@hniedner/sveltedt/styles.css" layer(components);`, as PRD-T3 tells a Tailwind 4 application to write;
  the test opens `/` in each engine and measures the caption as A11Y-13 of `spec/table.md` does; the second row is a
  canary, a copy without the second import, which must be found):

  | Consumer | Caption |
  |---|---|
  | the real consumer project | visually hidden: its bounding box at most 1 by 1 CSS px |
  | a copy without the import of `@hniedner/sveltedt/styles.css` | larger than 1 by 1 CSS px, found |

  Only the package's stylesheet hides the caption; the second row shows that no rule of the consumer's own files does
  it instead. Break that turns it red: the import removed. The other two apps' import lines arrive with their own
  statements. The consumer project arrives with its own build step (PRD-W8); until then this statement is listed as
  not yet tested.
- Reason: a consumer who installs the package and leaves out the line gets an unstyled table; the consumer project
  must show the line the documentation will tell consumers to write, and show that it is enough.
- Layer: consumer browser.
- Traces: PRD-T3, PRD-W8.

**CON-11** The package manager's peer check in the consumer copy MUST report no issue that names `@hniedner/sveltedt`.
- Examples (the test runs `pnpm peers check` in the copy of CON-01 after the tarball is added and reads the issues of
  its report that name `@hniedner/sveltedt`; when the command gives no report, the check reports "could not check";
  the second row is a canary, a tarball whose packed manifest is planted with the range, added to its own copy, which
  must be found):

  | `peerDependencies.svelte` of the added tarball | `pnpm peers check` |
  |---|---|
  | the real tarball's range | no issue names `@hniedner/sveltedt` |
  | a range above the Svelte version the copy installs (`^6.0.0` against 5.x) | an unmet peer `svelte` wanted by `@hniedner/sveltedt`, found |

  An issue that names only the consumer's own packages is not this statement's. Break that turns it red: the packed
  manifest's peer range raised above the Svelte version the consumer's lockfile holds.
- Reason: the add command only warns when the installed Svelte is outside the peer range and still exits 0 (MEASURED in
  this project's probe); the peer check is the package manager's own command that fails on it, so a consumer whose
  Svelte the range refuses cannot pass unseen.
- Layer: consumer files.
- Traces: PRD-K2, PRD-W8.

**CON-12** In the consumer's Tailwind 4 app, every element of the table MUST have the computed values of THEME-10's
literal table.
- Example: the Tailwind 4 app of the consumer project (PRD-W8), its stylesheet as CON-10 states, Tailwind's Preflight
  on, renders THEME-10's table; every row of THEME-10's literal table holds there, and the caption measures at most 1
  by 1 CSS px. Not yet tested until the consumer project's build step (PRD-W8).
- Reason: the third host of PRD-T11 (a); Preflight is a reset loaded first, as Bootstrap's reboot is.
- Layer: consumer browser.
- Traces: PRD-T11, PRD-W8.

**CON-13** In the consumer's Tailwind 4 app, a utility on a wrapper MUST override the stylesheet's cell padding
without `!`.
- Example: the table of THEME-10 inside `<div class="[&_td]:p-2">`: every body cell's padding computes to `8px` on each
  side; the app's built CSS holds no `!important` for it. Not yet tested until the consumer project's build step.
- Reason: a Tailwind application restyles the table with its own utilities, which the layered import puts above the
  stylesheet (PRD-T11 (b), PRD-T3).
- Layer: consumer browser.
- Traces: PRD-T11, PRD-T3.

## Trace

### Statement -> PRD

| Statement | PRD ids |
|---|---|
| PKG-01 | PRD-K2 |
| PKG-02 | PRD-K2 |
| PKG-03 | PRD-K2 |
| PKG-04 | PRD-L1, PRD-K2 |
| PKG-05 | PRD-K2, PRD-T3 |
| CON-01 | PRD-W8 |
| CON-02 | PRD-K4, PRD-W8 |
| CON-03 | PRD-S1, PRD-W8 |
| CON-04 | PRD-W8, PRD-S1 |
| CON-05 | PRD-W8, PRD-S1 |
| CON-06 | PRD-K4 |
| CON-08 | PRD-K4 |
| CON-09 | PRD-K2, PRD-W8 |
| CON-10 | PRD-T3, PRD-W8 |
| CON-12 | PRD-T11, PRD-W8 |
| CON-13 | PRD-T11, PRD-T3 |
| CON-11 | PRD-K2, PRD-W8 |

### PRD must -> statements

| PRD id | Statements | Coverage |
|---|---|---|
| PRD-K2 | PKG-01, PKG-02, PKG-03, PKG-04, PKG-05, CON-09, CON-11 | in part (as amended by the owner on 2026-11-17: the consumer's type check, CON-09, replaces the earlier third-party types check): PKG-03 holds the shape of what the build packs; the Svelte peer floor arrives with the CI job at the floor; each further `exports` subpath with its own statement; built with `svelte-package` is shown by the tarball's shape, not stated |
| PRD-K4 | CON-02, CON-06, CON-08 | in full for what Svelte reports: server rendering without browser globals (CON-02), a re-render after a structural mismatch on the production build (CON-06), every hydration warning in development (CON-08); a text that differs between server and browser is neither warned about nor re-rendered by Svelte, so no test can see it |
| PRD-W8 | CON-01, CON-02, CON-03, CON-04, CON-05, CON-09, CON-10, CON-11 | in part: "its files are the README quick start" comes with PRD-D1 |
| PRD-L1 | PKG-04 | in part: the files' presence and text in the repository and `"license"` in `package.json` are not this file's |
| PRD-T3 | PKG-05, CON-10 | in part: the export (PKG-05) and the consumer's layered import (CON-10); one static, unlayered stylesheet is THEME-04 of `spec/table.md`; the import line for an application without Tailwind arrives with PRD-D1 |
| PRD-S1 | CON-03, CON-04, CON-05 | in part: of the server-rendered half, the server HTML, the header and the listener; the zero-violation check of the server half: no statement yet, owner decision pending (CON-07 reserved); the client-rendered half is in `spec/site.md` (POL-01, POL-02, POL-04); the component injecting no `style`, `link` or `script` is `spec/table.md`'s FOOT-04, and its build holding no `eval`, `new Function` or string timers has no statement yet |

PRD musts touched by this file and left to later parts: PRD-K2, PRD-W8 and PRD-S1 (as above). PRD-W9's three engines
for the consumer's browser statements are carried by the consumer browser layer; their CI wiring is the gates'.
