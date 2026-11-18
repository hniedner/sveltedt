# SvelteDT

The objective: a data table for Svelte 5 and Tailwind 4, inspired by DataTables (datatables.net) and aiming at its
functionality, server-side and client-side, the Svelte way, within the scope the product requirements set. It is
built to best practice: accessible, usable under a strict content-security policy, and tested first. It should be
easy to adopt, for a new project and for a project migrating from DataTables. SvelteDT is an independent project, not
affiliated with or endorsed by DataTables.

**Status: pre-release.** This repository holds no component code yet, and there is nothing to install or use. Its
requirements are written first; code follows them, test first.

The npm package will be `@hniedner/sveltedt`. npm refused the bare name `sveltedt` as too similar to an existing
package, so the package is published under the owner's scope.

- What it must do: [the product requirements](docs/PRD.md), approved by the owner.
- How this project is built: [the engineering method](docs/engineering/method.md) and
  [how each check works](docs/engineering/gates.md).
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md). Reporting a vulnerability: [SECURITY.md](SECURITY.md).
- Licence: Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE).
