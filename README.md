# SvelteDT

SvelteDT brings the utility of DataTables (datatables.net) to Svelte 5: a data table for server-side and client-side
data, styled by one stylesheet and prefixed tokens that work with any CSS approach, Tailwind 4 included, built
idiomatically for Svelte with components, props, callbacks and snippets rather than as an imitation of DataTables'
JavaScript API. It is built to be accessible, usable under a strict content-security policy,
and tested first. Two adoption paths are first-class: a new project, and a project migrating from DataTables, which
keeps its server-side backend working through a connection helper and maps its options with a migration guide. SvelteDT
is an independent project, not affiliated with or endorsed by DataTables.

**Status: pre-release.** This repository holds no component code yet, and there is nothing to install or use. Its
requirements are written first; code follows them, test first.

The npm package will be `@hniedner/sveltedt`. npm refused the bare name `sveltedt` as too similar to an existing
package, so the package is published under the owner's scope.

- What it must do: [the product requirements](docs/PRD.md), approved by the owner.
- How this project is built: [the engineering method](docs/engineering/method.md) and
  [how each check works](docs/engineering/gates.md).
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Reporting a vulnerability: [SECURITY.md](SECURITY.md).
- Licence: Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
