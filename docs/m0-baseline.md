# M0 baseline audit and implementation sequence

Completed on 2026-11-03. This audit covers the entire tracked v1 repository at [39b46cd](https://github.com/abdo-host/ZATCA-JS/tree/39b46cdfbf1939d13758838c0893cbd785eb65c7) and the public [`zatca@1.0.2` tarball](https://registry.npmjs.org/zatca/-/zatca-1.0.2.tgz). Checks ran on Windows with Node 24.22.1, npm 11.6.1 and Git 2.56.0.windows.1. The local branch is `chore/m0-baseline-audit`.

## AUD-001 and AUD-003 · Source, release and consumers

| Evidence | GitHub baseline | Public npm artifact |
| --- | --- | --- |
| Identity | `@tatwerat/zatca@1.0.0` from `origin/master`. No Git tags or GitHub Releases. | `zatca@1.0.2`, the only dist-tag is `latest`. Published versions are `1.0.0`, `1.0.1` and `1.0.2`. |
| Provenance | `1449d9b26668bd6ee41aef7b34eb611b39561884` is present in repository history. | Registry `gitHead` is that commit. Both sources declare the same GitHub repository. |
| Files | Five package files plus two workflow files in a pack of the original checkout. | `LICENSE`, `README.md`, `index.js`, `package.json`, `qrCode.js`. |
| Content comparison | `index.js`, `qrCode.js` and `LICENSE` match the tarball after normalizing line endings, including at `gitHead`. | The original manifest differs only in name and version. The published README has the older demo URL, says “composer” beside an npm command and lacks the current badges. |
| Module surface | One CommonJS export, `GenerateQrCode`. No export map, dedicated ESM build, declarations or `/qr` entry. | Same. Node 24 ESM default and named imports work through CommonJS interop after the renderer is installed. |
| License | MIT. | MIT. |

The tarball's SHA-512 SRI was independently calculated and matched [registry metadata](https://registry.npmjs.org/zatca/1.0.2).

```text
sha512-/DQBXtxaTIb5VJk4R+aFv27sbq3dg3uTIrdmYQQhzgJn1+JtHjbGAOxK/VDRSWAvxvawj4xvQWalPlKocDtGcg==
```

`npm owner ls zatca` identifies `tatwerat_team`. The current operator's publishing permission remains unverified. The public registry returned 404 for `@tatwerat/zatca`. Use local tarballs and npm's `file:` dependencies for development, and resolve the public name and access before release. The source checkout is the migration base and the npm artifact is the v1 consumer reference.

The documented consumer is a Node CommonJS application using `require('zatca').GenerateQrCode` with five positional arguments. The [npm downloads endpoint](https://api.npmjs.org/downloads/point/2026-10-03:2026-11-01/zatca) reported 148 downloads from 2026-10-03 through 2026-11-01. Individual consumers and framework usage are unknown.

## AUD-002 · Behavior and package checks

| Check | Observed result |
| --- | --- |
| Clean production install from the npm tarball and a pack of the original GitHub checkout | Both installs succeeded. Both root imports failed with `MODULE_NOT_FOUND` for `qrcode`. |
| Root imports after adding `qrcode@1.5.4` to the isolated consumers | CommonJS and the Node 24 ESM named import worked for both. The public package's ESM default import also worked. |
| Six [characterization tests](../tests/legacy-baseline.test.cjs) with [synthetic fixtures](../tests/fixtures/legacy-v1.json) | 6/6 passed against the checkout and 6/6 against each installed tarball with the renderer available. |
| Independent scan of the npm artifact's PNG with `pngjs` and `jsqr@1.4.0` | Valid ASCII scanned to the frozen Base64. An empty seller rendered a scannable image containing the HTML error. |
| Original `npm test` and CI installation | The original script exited 1 with the placeholder message. `npm ci` returned `EUSAGE` on the original checkout because no lockfile is tracked. The M0 test script replaces the placeholder. |
| M0 `npm pack --dry-run` | Packing succeeds. The current manifest also includes workflow files, tests, audit docs and the two local plan files. M1 must add a package file allowlist before any release. |

The fixture captures the Promise and Buffer return contracts, exact ASCII bytes and Base64, and a Node PNG data URL. Arabic `شركة` produces `01 04 d8 b4 d8 b1 d9 83 d8 a9`. The value occupies eight bytes, so the correct length octet would be `08`. A 256-byte ASCII seller produces `01 00` followed by all 256 bytes. The bug cases characterize v1 and are inputs for corrected expectations in M2/M3.

Run the following commands from the M0 checkout with Node 24. See the [M1 packaging notes](m1-packaging.md) for the current checkout.

```sh
npm install --ignore-scripts --no-package-lock
npm test
```

To repeat the published artifact check in PowerShell, run this from the repository root. The first `require` is expected to fail. The fixture replay uses an exact renderer version.

```powershell
$repo = (Get-Location).Path
$consumer = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) "zatca-v1-$([guid]::NewGuid())")
Push-Location $consumer.FullName
try {
    npm pack zatca@1.0.2 --registry=https://registry.npmjs.org/
    npm init -y
    npm install --ignore-scripts --omit=dev ./zatca-1.0.2.tgz
    node -e "require('zatca')"
    npm install --ignore-scripts --save-exact qrcode@1.5.4
    $env:ZATCA_LEGACY_ENTRY = Join-Path $consumer.FullName 'node_modules/zatca/index.js'
    node --test (Join-Path $repo 'tests/legacy-baseline.test.cjs')
} finally {
    Remove-Item Env:ZATCA_LEGACY_ENTRY -ErrorAction SilentlyContinue
    Pop-Location
}
```

For the original GitHub pack, run `npm pack --ignore-scripts` in an isolated checkout of `39b46cd` and install its tarball in a second empty consumer. Use `@tatwerat/zatca` for the import and `node_modules/@tatwerat/zatca/index.js` for the fixture entry.

## AUD-004 · Findings by consequence

| Priority | Finding and impact | Scheduled work |
| --- | --- | --- |
| High | [The renderer is imported at startup](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L1-L2) but listed as a dev dependency in the [manifest](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/package.json#L28-L32). The published root fails on clean install. | M1 declares the runtime dependency wherever the legacy entry needs it and gates on a clean pack install. M3 separates rendering from the portable core. |
| High | [TLV encoding](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L55-L59) writes UTF-16 length into one byte. Arabic offsets break and oversize lengths wrap. | M2 measures UTF-8 bytes and rejects values above the field or profile limit. |
| High | [Validation](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L62-L75) accepts 16-character or alphabetic VAT IDs and rejects second-resolution UTC and offset timestamps. Amounts are [stringified without validation](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L13-L20), including `NaN` and negative values. | M2 validates profile fields explicitly with exact decimals and calendar checks. |
| High | [The renderer](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L33-L52) feeds HTML validation results into the image library. An invalid invoice can appear to produce a successful QR. | M2 defines structured errors. M3 rejects invalid legacy calls with typed errors. |
| Medium | [The class](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L4-L82) combines invoice checks, TLV, Base64 and rendering. The same ordered five fields are serialized in [two methods](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/qrCode.js#L13-L30), so changing the mapping in one can split outputs. The async Promise executor can also leave `render()` pending if the awaited encoder rejects. | M2 centralizes serialization and validation. M3 delegates from the adapter and propagates failures. |
| Medium | [The README](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/README.md#L6-L18) and [package description](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/package.json#L2-L5) advertise XML and API capabilities. The seven tracked files contain only the QR class, entry, manifest, docs/license and workflows. | Update manifest claims in M1 and document shipped features before the QR release. XML and API work have their own gates in M5/M7. |
| Medium | [CI](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/.github/workflows/node.js.yml) uses Node 14/16/18 and `npm ci` without a lockfile. The [release workflow](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/.github/workflows/npm-publish-github-packages.yml) also uses a lockfile-free install and points at GitHub Packages on Node 16. | M1 replaces the CI baseline. M9 gates publish automation on access and verified artifacts. |
| Low | [The README logo links to Salla](https://github.com/abdo-host/ZATCA-JS/blob/39b46cdfbf1939d13758838c0893cbd785eb65c7/README.md#L3-L9). The GitHub demo and logo URLs returned HTTP 200, while the older npm demo hostname did not resolve. | M8 repairs the published docs and confirms the demo and branding links. |

The review identified four high, three medium and one low finding in the table. Separately, the registry identity and publishing access decision in AUD-001 blocks a public release. The planned decoder, browser-safe core, Phase 2 features and declarations are tracked in the milestones below.

The three declared dev dependencies resolved in the audit to `express@4.22.3`, `buffer@6.0.3` and `qrcode@1.5.4`. Express is unused, and Node resolves `require('buffer')` to its built-in module. Remove unused entries in M1. The dependency audit and `npm audit --omit=dev` reported zero advisories in the resolved graphs on the audit date. The original artifact's production graph contains no declared dependencies. The history and tracked-file checks found only the workflow's standard `secrets.GITHUB_TOKEN` reference, with no hardcoded credentials or user-controlled execution sinks identified by the targeted scan.

## AUD-005 and AUD-006 · Decisions and milestones

See the [compliance matrix](compliance-matrix.md) for standard references, planned tests and verification status. The following choices govern local development. Public support claims depend on the release tests.

| Decision | M0 outcome |
| --- | --- |
| Modules and package layout | Use one strict TypeScript codebase and one package with ESM and CommonJS entries and matching declaration branches. Keep the universal `/qr` entry independent of the renderer and future server modules. |
| Node and browser targets | Use Node 24 for development and target Node 22, 24 and 26 in CI. All three are LTS as of this audit. Target current stable Chrome, Edge, Firefox and Safari for QR only. Verify packed imports, TypeScript NodeNext/bundler resolution and a Vite build without Node polyfills in M1. Establish the minimum TypeScript version from the passing consumer matrix. |
| Renderer | Keep the observed Node legacy default MIME `image/png` in M3. Isolate PNG/SVG rendering behind a subpath and test browser canvas use separately. Include scan verification for both paths before claiming support. |
| Amounts and timestamps | Use decimal strings for the QR API, retaining significant digits and applying only verified profile rules. Accept zoned ISO 8601 with real dates and preserve the supplied offset. M2 defines exact acceptance and normalization. M5 derives currency and rounding policy from official accounting rules. |
| Phase 2 and state | Exact signature, public key and CA signature encodings are **BLOCKED — VERIFY** against official vectors. The SDK accepts a host-owned atomic PIH/ICV store contract. The reference storage adapter, first XML profile scope and fixture redistribution rights are release decisions. |

The Node targets follow the [official Node.js release schedule](https://nodejs.org/en/about/previous-releases).

| Milestone | Deliverable and exit gate |
| --- | --- |
| **M0 · Complete** | Audit of source and npm, reusable legacy fixtures, decisions and compliance matrix. |
| **M1 · Complete** | INF-001–008 in two reviewable slices. Establish strict TypeScript, reproducible npm install, dependency boundaries and CI. Then validate dual builds, declarations, UTF-8/Base64 utilities, typed errors and isolated packed CJS/ESM/TS/Vite consumers. Run build, tests and package lint before M2. |
| **M2 · Complete** | [Phase 1 TLV encode, decode and validation](m2-phase1-qr.md) with Unicode, size limits and byte-level vectors. |
| **M3 · Complete** | [Image renderer, legacy adapter and migration guide](migration-v1-v2.md), verified with independent scans and packed consumers. |
| **M4 · Next** | Phase 2 QR and official fixture validation. The signed XML adapter in QR2-006 depends on M6. |
| **M5 · Pending** | Typed invoice model, decimal calculations and UBL XML. Verify each supported invoice and note profile with the official SDK. |
| **M6 · Pending** | Signing, hashing, PIH/ICV and certificates with official vectors and independent review. |
| **M7 · Pending** | Onboarding, renewal, reporting and clearance with Sandbox evidence for each supported workflow. |
| **M8 · Pending** | Documentation, examples and developer experience. Ship the QR release's relevant docs with its features. |
| **M9 · Pending** | Security and release checks, provenance, verified npm access and a conformance report. |

Open release gates are registry publishing access, official SDK conformance, and Sandbox workflow evidence. M1 can proceed locally using tarballs after the M0 review.
