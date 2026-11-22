// Tests for check-repo.ts: the lint step. Fixtures in check-repo.fixture.ts.

import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  COMPONENT,
  PASSING_VITEST,
  SUPPRESSIONS,
  TOOL,
  UNDER_NODE_MODULES,
  canaryDir,
  component,
  expect,
  here,
  pkg,
  put,
  repo,
  script,
  tempDir,
} from "./check-repo.fixture.ts";

// ESLint throws when a name it is given matches no file: an empty folder, or a link to a file that is gone.
test("lint: an ESLint that fails on the canaries cannot be checked", () => {
  const dir = canaryDir("lint", { "canary.mjs": "x\n" });
  mkdirSync(join(dir, "lint", "empty"));
  assert.match(
    expect("lint", repo(), 3, { canaries: dir }),
    /eslint probe failed/,
  );
});
test("lint: an ESLint that fails on the repository cannot be checked", () => {
  const broken = (root: string) =>
    symlinkSync("gone.mjs", join(root, "scripts", "link.mjs"));
  assert.match(expect("lint", repo(broken), 3), /eslint probe failed/);
});
test("lint: a file ESLint leaves out cannot be checked", () => {
  const out = expect(
    "lint",
    repo((root) => put(root, `${UNDER_NODE_MODULES}.mjs`, TOOL)),
    3,
  );
  assert.match(out, /ESLint did not lint every file/);
});
const BRANCHES = Array.from(
  { length: 21 },
  (_, i) => `  if (a === ${i}) return ${i};`,
).join("\n");

test("lint: passes when ESLint fails its canaries and accepts every script", () => {
  const out = expect("lint", repo(script("export const one = 1;\n")), 0);
  assert.match(out, /\.svelte 0$/m);
});
test("lint and format: the Svelte config, the one .js file, is linted and formatted like a script", () => {
  const config = (text: string) => (root: string) =>
    put(root, "svelte.config.js", text);
  expect(
    "lint",
    repo(config('export const a = eval("1");\nexport default {};\n')),
    1,
  );
  expect("format", repo(config("export default {}\n")), 1);
});
test("lint: eval is a finding that names the rule", () => {
  assert.match(
    expect("lint", repo(script('export const x = eval("1");\n')), 1),
    /no-eval/,
  );
});
test("lint: an undefined global is a finding", () => {
  assert.match(
    expect("lint", repo(script("export const x = nope;\n")), 1),
    /no-undef/,
  );
});
test("lint: a function over the complexity limit is a finding", () => {
  const body = `export function f(a) {\n${BRANCHES}\n  return -1;\n}\n`;
  assert.match(expect("lint", repo(script(body)), 1), /complexity/);
});
test("lint: an unused disable directive is a finding", () => {
  expect(
    "lint",
    repo(
      script("// eslint-disable-next-line no-eval\nexport const one = 1;\n"),
    ),
    1,
  );
});
test("lint: another ESLint version than the pin cannot be checked", () => {
  expect("lint", repo(pkg((p) => (p.devDependencies.eslint = "9.0.0"))), 3);
});
test("lint: a canary that ESLint accepts cannot be checked", () => {
  const clean = canaryDir("lint", {
    "canary.mjs": "export const one = 1;\n",
    "canary.ts": "export const one = 1;\n",
  });
  const out = expect("lint", repo(), 3, { canaries: clean });
  assert.match(out, /ESLint missed planted canaries/);
});
test("lint: a tracked file of no known class cannot be checked", () => {
  expect(
    "lint",
    repo((root) => put(root, "Makefile", "all:\n")),
    3,
  );
});
const tsScript =
  (body: string) =>
  (root: string): void =>
    put(root, "scripts/y.ts", body);
test("lint: an explicit any in a TypeScript script is a finding that names the rule", () => {
  const out = expect("lint", repo(tsScript("export const v: any = 1;\n")), 1);
  assert.match(out, /@typescript-eslint\/no-explicit-any/);
});
test("lint: a floating promise in a TypeScript script is a finding (type-aware)", () => {
  const body =
    "export async function f(): Promise<void> {\n  Promise.resolve(1);\n}\n";
  assert.match(expect("lint", repo(tsScript(body)), 1), /no-floating-promises/);
});
test("lint: a Vitest test without an assertion is a finding that names the rule", () => {
  const out = expect(
    "lint",
    repo((root) =>
      put(
        root,
        "scripts/a.test.ts",
        'import { test } from "vitest";\ntest("nothing", () => {});\n',
      ),
    ),
    1,
  );
  assert.match(out, /vitest\/expect-expect/);
});
test("lint: eval in a TypeScript script is a finding", () => {
  expect("lint", repo(tsScript('export const x: unknown = eval("1");\n')), 1);
});
test("lint: a canary folder without a TypeScript canary cannot be checked", () => {
  const onlyMjs = canaryDir("lint", {
    "canary.mjs": readFileSync(
      join(here, "canaries", "lint", "canary.mjs"),
      "utf8",
    ),
  });
  const out = expect("lint", repo(), 3, { canaries: onlyMjs });
  assert.match(out, /no canary for \.ts/);
});
test("lint: a component in allowed markup passes, and the summary counts it per extension", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  let el: HTMLElement | undefined = $state();\n</script>",
        ).replace(
          "<p>{count}</p>",
          "<p bind:this={el} class={count > 1 ? 'many' : 'one'}>{count}</p>",
        ),
      ),
    ),
    0,
  );
  assert.match(out, /\.svelte 1$/m);
});
test("lint: a class: directive in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          "<p class:many={count > 1}>{count}</p>",
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax class: directive/);
});
test("lint: a <style> block in a component is a finding that names the ban", () => {
  const out = expect(
    "lint",
    repo(
      component(
        `${COMPONENT}\n<style>\n  p {\n    margin: 0;\n  }\n</style>\n`,
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax <style> block/);
});
test("lint: markup and code beside the injection bans pass in a component (setAttribute once would not: on plus letters, like any handler)", () => {
  // Near misses: another element through svelte:element, literal or computed; an iframe without srcdoc; reading
  // innerHTML; a string holding its name; setAttribute and createElement of other names; a write that is not a
  // document's; a name that only contains a sink's name; a local parseHTML or addRule; a bracketed name that is no
  // sink's; setAttribute of open or only-x (not handlers); execCommand of another command.
  expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          '  const { innerHTML } = document.body;\n  const log = { write: (s: string): string => s };\n  const sink = "innerHTML";\n' +
            '  const tag = "p";\n  const text = document.body.innerHTML;\n  const box = document.createElement("div");\n' +
            '  box.setAttribute("title", text);\n  box.setAttribute("open", "");\n  box.setAttribute("only-x", "");\n  box.append(document.createElementNS("http://www.w3.org/2000/svg", "circle"));\n  box["title"] = text;\n  const csvDocument = log;\n  const myDOMParserName = csvDocument.write(sink);\n' +
            '  const parseHTML = (s: string): string => s;\n  const addRule = (s: string): string => s;\n  document.execCommand("copy", false, addRule(parseHTML(text)));\n</script>',
        ).replace(
          "<p>{count}</p>",
          '<svelte:element this="p">{count}{log.write(innerHTML)}{sink}</svelte:element>\n<iframe title="frame" src="about:blank"></iframe>\n' +
            "<svelte:element this={tag}>{myDOMParserName}{box.title}</svelte:element>",
        ),
      ),
    ),
    0,
  );
});
// RND-04 (spec/table.md): with the per-name test below, every raw-HTML form its example names is a finding: {@html
// and srcdoc in a component, the
// script forms in a script (the script bans run in components too: canary.svelte plants setAttribute style and
// innerHTML).
const SINK = (body: string) =>
  `export function sink(el: HTMLElement, html: string): unknown {\n  ${body}\n  return el;\n}\n`;
test("lint: the raw-HTML forms of RND-04 are findings that name their ban", () => {
  for (const [form, change, ban] of [
    [
      "{@html",
      component(`${COMPONENT}{@html String(count)}\n`),
      "svelte/no-at-html-tags",
    ],
    [
      "innerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.innerHTML = html;")),
      "no-restricted-syntax assigning innerHTML",
    ],
    [
      "outerHTML",
      (r: string) => put(r, "scripts/x.ts", SINK("el.outerHTML = html;")),
      "no-restricted-syntax assigning innerHTML, outerHTML",
    ],
    [
      "insertAdjacentHTML",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('el.insertAdjacentHTML("beforeend", html);'),
        ),
      "no-restricted-syntax insertAdjacentHTML",
    ],
    [
      "document.write",
      (r: string) => put(r, "scripts/x.ts", SINK("document.write(html);")),
      "no-restricted-syntax document.write",
    ],
    [
      "createContextualFragment",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK("document.createRange().createContextualFragment(html);"),
        ),
      "no-restricted-syntax setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
    [
      "DOMParser",
      (r: string) =>
        put(
          r,
          "scripts/x.ts",
          SINK('new DOMParser().parseFromString(html, "text/html");'),
        ),
      "no-restricted-syntax DOMParser",
    ],
    [
      "srcdoc",
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<iframe title="t" srcdoc={String(count)}></iframe>',
        ),
      ),
      "no-restricted-syntax srcdoc attribute",
    ],
  ] as const) {
    const out = expect("lint", repo(change), 1);
    assert.ok(out.includes(ban), `${form}: ${out}`);
  }
});
test("lint: every name a ban lists is a finding of that ban", () => {
  const scripts = [
    ['document.createElement("style");', "createElement of style"],
    ['document.createElement("link");', "createElement of style"],
    ['document.createElement("script");', "createElement of style"],
    ['el.setAttribute("SRCDOC", html);', "setAttribute srcdoc"],
    [
      'el.setAttribute("onclick", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    ["el.setHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["Document.parseHTMLUnsafe(html);", "setHTMLUnsafe, parseHTMLUnsafe"],
    ["el.setHTML(html);", "setHTML or createRawSnippet"],
    ["void createRawSnippet;", "setHTML or createRawSnippet"],
    [
      "(el as HTMLIFrameElement).srcdoc = html;",
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    ['el["innerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      'Object.assign(el, { "outerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "Object.assign(el, { srcdoc: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    ["document.writeln(html);", "document.write"],
    ["window.document.write(html);", "document.write"],
    ["el.ownerDocument.write(html);", "document.write"],
    ["void new CSSStyleSheet();", "constructed or inserted style sheet"],
    [
      "void document.adoptedStyleSheets;",
      "constructed or inserted style sheet",
    ],
    [
      'document.styleSheets[0]?.insertRule("p {}");',
      "a rule inserted into a style sheet",
    ],
    [
      'document.styleSheets[0]?.addRule("p", "margin: 0");',
      "a rule inserted into a style sheet",
    ],
    [
      "(el as HTMLIFrameElement).contentDocument?.write(html);",
      "document.write",
    ],
    ["window.Document.parseHTML(html);", "Document.parseHTML"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "style");',
      "createElementNS of style",
    ],
    ['el["insertAdjacentHTML"]("beforeend", html);', "a sink name in brackets"],
    ['document["write"](html);', "a sink name in brackets"],
    ['el["setAttribute"]("style", "");', "a sink name in brackets"],
    [
      'document.execCommand("INSERTHTML", false, html);',
      "execCommand insertHTML",
    ],
    ["Document.parseHTML(html);", "Document.parseHTML"],
    ['document.createElement("SCRIPT");', "createElement of style"],
    [
      'document.createElementNS("http://www.w3.org/2000/svg", "script");',
      "createElementNS of style",
    ],
    [
      'document.createElementNS("http://www.w3.org/1999/xhtml", "link");',
      "createElementNS of style",
    ],
    ['el["outerHTML"] = html;', "assigning innerHTML, outerHTML or srcdoc"],
    [
      '(el as HTMLIFrameElement)["srcdoc"] = html;',
      "assigning innerHTML, outerHTML or srcdoc",
    ],
    [
      "Object.assign(el, { outerHTML: html });",
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "innerHTML": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      'Object.assign(el, { "srcdoc": html });',
      "innerHTML, outerHTML or srcdoc in an object literal",
    ],
    [
      "const { ownerDocument } = el;\n  ownerDocument.write(html);",
      "document.write",
    ],
    [
      "const { contentDocument } = el as HTMLIFrameElement;\n  contentDocument?.write(html);",
      "document.write",
    ],
    ["el.innerHTML += html;", "assigning innerHTML, outerHTML or srcdoc"],
    [
      'el.setAttribute("ONCLICK", html);',
      "setAttribute srcdoc or an on* handler",
    ],
    // Every name the bracket ban lists, in brackets: a name dropped from its list cannot stay green.
    ...[
      "insertAdjacentHTML",
      "setHTML",
      "setHTMLUnsafe",
      "parseHTML",
      "parseHTMLUnsafe",
      "createContextualFragment",
      "createRawSnippet",
      "DOMParser",
      "write",
      "writeln",
      "execCommand",
      "setAttribute",
      "createElement",
      "createElementNS",
      "CSSStyleSheet",
      "adoptedStyleSheets",
      "insertRule",
      "addRule",
    ].map((name) => [`void el["${name}"];`, "a sink name in brackets"]),
  ].map(([body, ban], i) => [`scripts/s${i}.ts`, SINK(body), ban]);
  const markup = [
    ['<iframe SRCDOC="<p>x</p>" title="t"></iframe>', "srcdoc attribute"],
    [
      '<svelte:element this={"STYLE"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ["<x-raw {outerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
    ['<link rel="stylesheet" href="x.css" />', "style, link or script element"],
    ["<div><script>alert(1)</script></div>", "style, link or script element"],
    ["<div><style></style></div>", "style, link or script element"],
    ["<div><sCRIPT>alert(1)</sCRIPT></div>", "style, link or script element"],
    [
      '<svelte:element this="script"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="link"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this="SCRIPT"></svelte:element>',
      "svelte:element as style",
    ],
    [
      '<svelte:element this={"style"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    [
      '<svelte:element this={"link"}></svelte:element>',
      "svelte:element this={...} as style",
    ],
    ['<iframe {srcdoc} title="t"></iframe>', "srcdoc attribute"],
    ["<x-raw outerHTML={srcdoc}></x-raw>", "innerHTML or outerHTML attribute"],
    ["<x-raw {innerHTML}></x-raw>", "innerHTML or outerHTML attribute"],
  ].map(([tag, ban], i) => [
    `src/C${i}.svelte`,
    COMPONENT.replace(
      "$props();",
      '$props();\n  const srcdoc = "";\n  const innerHTML = "";\n  const outerHTML = "";',
    ).replace(
      "<p>{count}</p>",
      `<p>{count}{srcdoc}{innerHTML}{outerHTML}</p>\n${tag}`,
    ),
    ban,
  ]);
  const out = expect(
    "lint",
    repo((root) => {
      component(COMPONENT)(root);
      for (const [file, text] of [...scripts, ...markup]) put(root, file, text);
    }),
    1,
  );
  const lines = out.split("\n").map((l) => l.trim());
  for (const [file, , ban] of [...scripts, ...markup])
    assert.ok(
      lines.some(
        (l) =>
          l.startsWith(`${file}:`) && l.includes(`no-restricted-syntax ${ban}`),
      ),
      `${file} ${ban}: ${out}`,
    );
});
test("lint: a raw-HTML sink named without being called or assigned is a finding", () => {
  for (const [body, ban] of [
    ["const Parser = DOMParser;\n  void new Parser();", "DOMParser"],
    [
      "const write = document.write.bind(document);\n  write(html);",
      "document.write",
    ],
    [
      "const fragment = document.createRange().createContextualFragment;\n  void fragment;",
      "setHTMLUnsafe, parseHTMLUnsafe or createContextualFragment",
    ],
  ]) {
    const out = expect(
      "lint",
      repo((r) => put(r, "scripts/x.ts", SINK(body))),
      1,
    );
    assert.ok(out.includes(`no-restricted-syntax ${ban}`), `${body}: ${out}`);
  }
});
test("lint: a raw-HTML sink in a .js or .mjs file is a finding", () => {
  for (const file of [
    "svelte.config.js",
    "scripts/x.mjs",
    "site/public/x.js",
  ]) {
    const out = expect(
      "lint",
      repo((r) =>
        put(
          r,
          file,
          "export function sink(el, html) {\n  el.innerHTML = html;\n}\n",
        ),
      ),
      1,
    );
    assert.ok(
      out.includes("no-restricted-syntax assigning innerHTML"),
      `${file}: ${out}`,
    );
  }
});
test("lint: a browser API above the support floor in a component is a finding that names the rule", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "</script>",
          "  const share = new PaymentRequest([], { total: { label: 'x', amount: { currency: 'EUR', value: '1' } } });\n</script>",
        ).replace("{count}</p>", "{count}{String(share)}</p>"),
      ),
    ),
    1,
  );
  assert.match(out, /compat\/compat/);
});
test("lint: an HTML disable comment does not switch a rule off in a component", () => {
  const out = expect(
    "lint",
    repo(
      component(
        COMPONENT.replace(
          "<p>{count}</p>",
          '<!-- eslint-disable -->\n<p style="color: red">{count}</p>',
        ),
      ),
    ),
    1,
  );
  assert.match(out, /no-restricted-syntax style attribute/);
});
test("lint: a config block that changes a proven rule for the component's folders cannot be checked", () => {
  // Measured: a later block that sets no-restricted-syntax for some files replaces the list for them, while every
  // canary still passes. Each rule the canaries prove must be configured for src/lib and site/src as for its canary.
  const real = join(here, "..", "eslint.config.mjs");
  for (const [block, named, file = ""] of [
    [
      '{ files: ["src/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte: no-restricted-syntax\n",
    ],
    // A block narrower than the probes: the file it reaches is compared too.
    [
      '{ files: ["src/lib/components/**"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/components/Grid.svelte: no-restricted-syntax\n",
      "src/lib/components/Grid.svelte",
    ],
    [
      '{ files: ["**/DataTable.svelte"], rules: { "svelte/no-at-html-tags": "off" } }',
      "src/lib/DataTable.svelte: svelte/no-at-html-tags",
      "src/lib/DataTable.svelte",
    ],
    [
      '{ files: ["src/**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", "WithStatement"] } }',
      "src/lib/probe.svelte.ts: no-restricted-syntax\n",
    ],
    [
      '{ files: ["src/**"], linterOptions: { noInlineConfig: false } }',
      "src/lib/probe.svelte: linterOptions",
    ],
    [
      '{ files: ["site/**"], rules: { "svelte/no-at-html-tags": "off" } }',
      "site/src/probe.svelte: svelte/no-at-html-tags",
    ],
    [
      '{ files: ["src/**/*.ts"], rules: { "@typescript-eslint/ban-ts-comment": "off" } }',
      "src/lib/probe.ts: @typescript-eslint/ban-ts-comment",
    ],
    [
      '{ files: ["site/**"], settings: { browsers: ["chrome 140"] } }',
      "site/src/probe.ts: settings",
    ],
    // Each Vitest rule, off for the component's tests only: the tracked test file is compared.
    ...[
      "expect-expect",
      "no-focused-tests",
      "no-disabled-tests",
      "valid-expect",
    ].map((rule) => [
      `{ files: ["src/**/*.test.ts"], rules: { "vitest/${rule}": "off" } }`,
      `src/lib/x.test.ts: vitest/${rule}`,
      "src/lib/x.test.ts",
    ]),
  ]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect(
      "lint",
      repo(
        file.endsWith(".test.ts")
          ? (root) =>
              put(
                root,
                file,
                `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
              )
          : file
            ? component(COMPONENT, file)
            : () => {},
      ),
      3,
      { extraEnv: { ESLINT_CONFIG: config } },
    );
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
  // Adding a block that leaves the proven rules alone is not a finding.
  const config = join(tempDir(), "eslint.config.mjs");
  writeFileSync(
    config,
    `import base from ${JSON.stringify(real)};\nexport default [...base, { files: ["src/**"], rules: { "no-console": "error" } }];\n`,
  );
  expect("lint", repo(), 0, { extraEnv: { ESLINT_CONFIG: config } });
});
test("lint: a block that weakens the bans for a whole extension, its canary too, cannot be checked", () => {
  // Measured (security review of 4528469): a block for **/*.svelte.ts keeping the one ban its canary plants, or a no-op
  // processor for components, changed canary and file alike, and the step passed with the sink in the file.
  const real = join(here, "..", "eslint.config.mjs");
  const RUNE =
    'export const doc = new DOMParser().parseFromString("<p></p>", "text/html");\nexport const s = document.createElement("style");\n';
  const RAW =
    '<script lang="ts">\n  const { html }: { html: string } = $props();\n</script>\n\n{@html html}\n';
  const allBut = (files: string[]) =>
    `{ files: ${JSON.stringify(files)}, rules: { "no-restricted-syntax": ["error", ...base.flatMap((b) => b.files?.includes("**/*.svelte.ts") ? (b.rules?.["no-restricted-syntax"] ?? []).slice(1) : []).filter((e) => !/DOMParser/.test(e.message))] } }`;
  for (const [block, named, change] of [
    [
      `{ files: ["**/*.svelte.ts"], rules: { "no-restricted-syntax": ["error", { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "assigning innerHTML (PRD-S2)" }] } }`,
      "scripts/rune.svelte.ts: no-restricted-syntax without each ban of the .ts canary",
      (root: string) => put(root, "scripts/rune.svelte.ts", RUNE),
    ],
    [
      allBut(["**/*.svelte"]),
      "src/lib/probe.svelte: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      allBut(["**/*.mjs", "**/*.js"]),
      "src/lib/probe.mjs: no-restricted-syntax without each ban of the .ts canary",
      () => {},
    ],
    [
      '{ files: ["src/lib/**/*.svelte"], processor: { preprocess: () => [], postprocess: () => [] } }',
      "src/lib/Raw.svelte: processor",
      component(RAW, "src/lib/Raw.svelte"),
    ],
    [
      '{ files: ["src/lib/**/*.ts"], languageOptions: { parser: { meta: { name: "other", version: "1.0.0" }, parse: () => { throw new Error("unused"); } } } }',
      "src/lib/probe.ts: parser",
      () => {},
    ],
  ] as [string, string, (root: string) => void][]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect("lint", repo(change), 3, {
      extraEnv: { ESLINT_CONFIG: config },
    });
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
});
test("lint: no PostCSS config is loaded for a component, not even one above the root", () => {
  const parent = tempDir();
  const root = join(parent, "root");
  // An ignore comment (SUPPRESSIONS[0]) makes the plugin compile the component, the path that loads PostCSS (measured).
  const styled = COMPONENT.replace(
    "<p>{count}</p>",
    `<!-- ${SUPPRESSIONS[0]} a11y_missing_attribute -->\n<p class="n">{count}</p>\n\n<style lang="postcss">\n  .n {\n    color: red;\n  }\n</style>`,
  );
  cpSync(repo(component(styled)), root, {
    recursive: true,
    verbatimSymlinks: true,
  });
  const marker = join(parent, "MARKER-postcss");
  put(
    parent,
    "postcss.config.cjs",
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nmodule.exports = {};\n`,
  );
  const out = expect("lint", root, 1);
  assert.match(out, /no-restricted-syntax <style> block/);
  assert.ok(
    !existsSync(marker),
    "the PostCSS config above the root was loaded",
  );
});

// The site's test files read the site's own build with DOMParser (the one named exception to its ban)
const PARSES = `import { expect, test } from "vitest";
test("parses", () => {
  expect(new DOMParser().parseFromString("<p></p>", "text/html").body).toBeTruthy();
});
`;
test("lint: DOMParser passes in a site test file and still fires in site/src and in a src/lib test file", () => {
  expect(
    "lint",
    repo((r) => put(r, "site/a.test.ts", PARSES)),
    0,
  );
  for (const file of ["site/src/x.ts", "src/lib/x.test.ts"]) {
    const out = expect(
      "lint",
      repo((r) => put(r, file, PARSES)),
      1,
    );
    assert.ok(out.includes("DOMParser (PRD-S2)"), `${file}: ${out}`);
  }
});
test("lint: a DOMParser lift elsewhere, or a wider lift for site tests, cannot be checked", () => {
  const real = join(here, "..", "eslint.config.mjs");
  const lift = (files: string, drop: string) =>
    `{ files: [${JSON.stringify(files)}], rules: { "no-restricted-syntax": ["error", ...base.flatMap((b) => b.files?.includes("**/*.ts") ? (b.rules?.["no-restricted-syntax"] ?? []).slice(1) : []).filter((e) => !${drop}.test(e.message))] } }`;
  for (const [block, file, named] of [
    [
      lift("src/lib/**/*.test.ts", "/DOMParser/"),
      "src/lib/x.test.ts",
      "src/lib/x.test.ts: no-restricted-syntax",
    ],
    [
      lift("site/**/*.test.ts", "/DOMParser|createElement /"),
      "site/a.test.ts",
      "site/a.test.ts: no-restricted-syntax",
    ],
    [
      lift("site/**/*.test.ts", "/DOMParser/").replace('["error"', '["off"'),
      "site/a.test.ts",
      "site/a.test.ts: no-restricted-syntax",
    ],
  ]) {
    const config = join(tempDir(), "eslint.config.mjs");
    writeFileSync(
      config,
      `import base from ${JSON.stringify(real)};\nexport default [...base, ${block}];\n`,
    );
    const out = expect(
      "lint",
      repo((r) =>
        put(
          r,
          file,
          `import { expect, test } from "vitest";\n${PASSING_VITEST}`,
        ),
      ),
      3,
      {
        extraEnv: { ESLINT_CONFIG: config },
      },
    );
    assert.ok(out.includes(named), `${named}: ${out}`);
  }
});
