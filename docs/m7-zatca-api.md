# M7 · ZATCA API client

The internal Node.js client implements the six ZATCA V2 operations against explicitly selected Sandbox or production routes. Sandbox onboarding and representative invoice operations passed on 2026-11-03. The production routing was tested with an injected transport. The client remains internal while Phase 2 release gates are open.

## Contract and environments

The [pinned contract snapshot](specs/zatca-sandbox-2.1.0.json) records the official source URL and SHA-256 of each raw OpenAPI document retrieved on 2026-11-03. It preserves methods, header requirements and representative wire shapes. It excludes example credential values and invoice bodies. The Swagger title is Sandbox Release 2.1.0. Send `Accept-Version: V2` on requests. Review the raw documents against their recorded digests when ZATCA changes the contract, update the snapshot and response tests, and repeat the opt-in Sandbox runs before changing the supported API version. [Integration Sandbox][sandbox] · [Developer Portal Manual v3, §§2.3.9–2.3.10 and 3][developer]

| Operation | Method and path | Credential and request | Outcome |
| --- | --- | --- | --- |
| Request compliance CSID | POST `/compliance` | `OTP` header and Base64 PEM `csr` | HTTP 200 with `requestID`, `binarySecurityToken`, `secret` and `ISSUED` |
| Check compliance | POST `/compliance/invoices` | Compliance Basic auth and invoice payload | Compliant or rejected with diagnostics |
| Request production CSID | POST `/production/csids` | Compliance Basic auth and string `compliance_request_id` from the compliance CSID | HTTP 200 with issued production-class CSID |
| Renew production CSID | PATCH `/production/csids` | Current production-class Basic auth, new `OTP` and Base64 PEM `csr` | HTTP 200 renewed or HTTP 428 with a compliance CSID for continuation |
| Clear a standard document | POST `/invoices/clearance/single` | Production-class Basic auth, `Clearance-Status: 1` and invoice payload | `CLEARED` with matching document UUID on 200, 202 or 208. HTTP 303 signals disabled clearance. |
| Report a simplified document | POST `/invoices/reporting/single` | Production-class Basic auth, explicit `Clearance-Status` and invoice payload | `REPORTED` on 200 or 202. HTTP 409 is a separate duplicate outcome. |

The invoice payload contains `uuid`, `invoiceHash` and the Base64 XML `invoice`. UUID comes from the exact XML supplied by the caller. `invoiceHash` is the Base64 SHA-256 reference digest. Standard and simplified invoices and their associated credit and debit notes have distinct routing. The simplified input check looks for an XML signature element. Signature verification and generation have their own M6 gate. When ZATCA disables clearance, a host can explicitly report the standard document with `clearanceEnabled: false`. The client returns the 303 outcome without following a redirect. [Detailed technical guide, §§4 and 7][guide]

Both environments use the fixed ZATCA gateway. `sandbox` selects `/e-invoicing/developer-portal` and `production` selects `/e-invoicing/core`. A production-class Sandbox credential still has environment `sandbox`. Keep credentials scoped by environment and EGS in the caller's secure store. The client validates the environment and credential class on every authenticated call. [Official Sandbox server and schemas](specs/zatca-sandbox-2.1.0.json) · [FATOORA Portal Manual v3, §3][core]

## Workflow and recovery

1. Request the compliance CSID with a caller-signed CSR and test OTP. Submit the representative compliance documents for the EGS capabilities. Production requires the applicable compliance checks before issuing the production CSID.
2. Request the production-class CSID with the issued compliance credential. Persist the returned credential under the appropriate environment and device.
3. For renewal, read certificate expiry with `getCsidExpiry` and schedule the work in the host. PATCH with the current credential and fresh renewal inputs. A 428 response returns an intermediate compliance credential. Complete the required compliance checks with it and request issuance. Replace the current credential only after a successful renewal or completed issuance.
4. Save the exact outgoing invoice, UUID, canonical digest and submission state before calling. Map only the corresponding terminal response to cleared or reported. Keep compliance checks, submitted state, duplicate replies and confirmed acceptance distinct. Preserve the PIH and ICV history when an invoice is rejected.

The API sends each request once. Every supported method can create or change remote state. Timeouts, cancellation after dispatch, transport errors, 408, 429, 5xx and malformed success replies can leave the remote outcome uncertain. Check `ZatcaApiError.outcomeUnknown` and reconcile with the authoritative workflow before deciding whether to send again. `Retry-After` delay seconds are metadata for the host queue. A 208 clearance reply must still contain the correct UUID and successful validation. A 409 reporting reply is exposed separately for reconciliation. [Detailed technical guide, §§3.3.3–3.3.5 and 7][guide]

The transport is injectable and uses a bounded response read, cancellation and a deadline. Audit events contain operation, environment, HTTP status and sanitized correlation metadata. Validation diagnostics are returned separately from audit events. The client strips control characters and redacts exact request credentials and payloads from diagnostics. Treat returned service messages as untrusted and potentially sensitive. Audit observers run on a best-effort basis. Persist workflow outcomes in the caller's queue or transaction.

## Opt-in Sandbox runs

Use caller-supplied nonproduction inputs. Prepare a JSON manifest outside the repo with the fields below and supply its path in `ZATCA_SANDBOX_INPUT`. Supply the test OTP via `ZATCA_SANDBOX_OTP`. Document paths may be relative to the manifest. Use the matching test VAT and SDK-generated digests for the CSR and documents.

```text
csrFile: path to the PEM CSR
compliance: list of { file, invoiceHash } pairs for the EGS capabilities
clearance: { file, invoiceHash } for the standard document
reporting: { file, invoiceHash } for the signed simplified document
```

Run `npm run test:api:sandbox -- tests/sandbox/workflow.test.ts`. The runner uses only the Sandbox environment and reports the failing step and HTTP status without dumping credentials or invoice data.

For a separate renewal case, set `ZATCA_SANDBOX_RENEWAL_INPUT` to a manifest with `requestId`, `tokenFile`, `secretFile`, `csrFile` and `expectedStatus` (`renewed` or `compliance-required`). Set `ZATCA_SANDBOX_RENEWAL_OTP` from the corresponding test inputs and run `npm run test:api:sandbox -- tests/sandbox/renewal.test.ts`.

## Verification

- Live Sandbox on Node 24.22.1 with ZATCA's published sample CSR, test OTP and invoice examples. Compliance CSID issuance, one standard compliance check, production-class test CSID issuance, standard invoice clearance and simplified invoice reporting all passed in one run.
- A separate live renewal run used the renewal Swagger example inputs and returned `renewed`. The 428 renewal continuation, document variants, validation warnings and errors, duplicate outcomes, disabled clearance, credential isolation, cancellation and deadline behavior are covered by local contract tests.
- A preliminary Python HTTP probe received Cloudflare HTTP 403 for all six routes. The Node fetch client reached the Sandbox and passed the workflows above.
- The M6 canonical hash matched the official standard and simplified samples. The input pairs are under `CLEARANCE` → `cleared` and `REPORTING` → `reported` in the respective Swagger request examples. Base64-decode `invoice` and compare `hashInvoiceXml` with `invoiceHash`.
- The local suite passed 137 unit tests and four legacy tests. The 11 API tests passed on Windows with Node 22, 24 and 26. Build and packed consumer checks passed.
- Simulation, production, independent signature verification and clearance/reporting for every credit and debit note profile have separate evidence gates.

[sandbox]: https://sandbox.zatca.gov.sa/IntegrationSandbox
[developer]: https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf
[core]: https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/Fatoora_Portal_User_Manual_English.pdf
[guide]: https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf
