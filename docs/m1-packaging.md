# M1 TypeScript and packaging

M1 is the private development build `zatca@2.0.0-dev.0`. The registry name and publishing access decision remains open. See the [v1 audit](m0-baseline.md) for the source and public npm comparison.

| Area | M1 outcome |
| --- | --- |
| Build | Strict TypeScript source with explicit Node and portable entrypoints. Both ship `.mjs`, `.cjs`, `.d.mts` and `.d.cts` with matching export conditions. The packed file allowlist includes build output, the manifest, README and MIT license. |
| Node root | CommonJS retains the named `GenerateQrCode` property. ESM supports named and default imports. The Node entry uses `qrcode` as a runtime dependency and retains the Promise, Buffer and PNG data URL contracts captured in M0. An encoder rejection now propagates through `render()`. |
| Browser entry | `zatca/qr` exports portable UTF-8 and canonical Base64 primitives plus typed encoding and validation errors. Its source typechecks with only web globals, and Vite verifies that its browser graph contains no Node built-ins or renderer. Browser resolution blocks the Node root. |
| Release and CI | A lockfile and pinned GitHub Actions build and validate the package across Node 22, 24 and 26. The inherited GitHub Packages publish workflow was removed. The dev package manifest is private. |

The build uses [tsdown](https://tsdown.dev/guide/how-it-works), the maintained successor recommended by [tsup](https://github.com/egoist/tsup), for the dual-format outputs. The portable entry uses `TextEncoder`, strict `TextDecoder`, `atob` and `btoa`. Base64 decoding rejects noncanonical encodings and UTF-8 decoding rejects malformed bytes while preserving a leading BOM.

## Verification

Run from the checkout on a current patch of Node 22, 24 or 26.

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run build
npm test
npm run test:coverage
npm run package:verify
npm run audit:dependencies
npm run audit:licenses
npm pack --dry-run
```

- On Windows, the clean-install, build, test and packed-consumer checks passed on Node 22.23.4, 24.22.1 and 26.13.0. The source suites contain 12 portable unit tests and six legacy characterization tests. On Node 24, portable-core coverage reached 100% of lines and branches.
- The package check packs once, checks the tarball with `publint --strict` and ATTW, then installs it into isolated CommonJS, ESM and browser consumers. It runs the legacy suite again against the installed artifact, verifies TypeScript 5.9.3 with NodeNext, Node16 and Bundler resolution, and builds the browser consumer with Vite. `npm run test:consumers` runs the artifact and consumer checks without the metadata and license gates.
- ATTW uses the Node16 profile and treats the deprecated `node10` resolution mode as out of scope. TypeScript consumers of the Node root install `@types/node`. The browser fixture excludes Node ambient types.
- The audit found zero known npm advisories at verification time. License metadata for the 29 checkout production dependencies and the packed runtime tree passed the license allowlist.
- GitHub Actions provides the Linux gate on push or pull request to `master`. The local browser check covers production bundling and the import graph. Browser runtime and framework matrices are later release gates.

## Compatibility boundary and M2

Use the documented package root for legacy Node calls. The export map closes undocumented deep imports such as `zatca/qrCode`. The legacy characterization tests still exercise the known v1 Arabic length, oversized field and HTML validation behavior.

M2 adds the Phase 1 invoice-level TLV encoder, decoder and validator, including `encodeQrBase64`, profile limits and Arabic fixtures. M3 connects the legacy adapter and image renderer to that core. Official verification remains tracked in the [compliance matrix](compliance-matrix.md).
