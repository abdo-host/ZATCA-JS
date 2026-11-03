# M4 Phase 2 QR evidence

**Status as of 2026-11-03.** Experimental read-only inspection is available. Phase 2 generation and release acceptance are blocked on verification with the official SDK.

## Wire format discrepancy

The Security Features Implementation Standards v1.2 §4.1 describe a 32-byte SHA-256 value for tag 6. The Authority's Detailed Technical Guideline §6.2 publishes a complete QR with the following byte lengths. The published vector was decoded locally as 388 TLV bytes, or 520 Base64 characters. [Security Standard](https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf), [Detailed Technical Guideline](https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf)

| Tag | Bytes in the published QR | Observed encoding |
| --- | --- | --- |
| 6 | 44 | ASCII Base64 text of a 32-byte SHA-256 value |
| 7 | 96 | ASCII Base64 text of a 71-byte DER ECDSA signature |
| 8 | 88 | DER SubjectPublicKeyInfo with a secp256k1 uncompressed point |
| 9 | 72 | DER ECDSA signature |

SHA-256 of the entire decoded public vector is `39dd073aabcdd8c855850c645302ea8c159aae4514bf9a9af2442ab012c48fa7`. The [test fixture](../tests/fixtures/phase2-guide-tags.json) keeps the published wire values for tags 6–9. The tests pair them with synthetic invoice fields. The standard-profile test is derived by removing tag 9 and is structural evidence only. Table 3 scopes tag 9 to simplified tax invoices and associated notes. [Security Standard v1.2, Table 3](https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf)

## Inspecting an existing QR

```ts
import { inspectPhase2Qr } from 'zatca/qr';

const result = inspectPhase2Qr(scannedBase64, 'simplified');
const { structureValid, binaryTags, errors, warnings } = result;
```

The function accepts canonical Base64 or raw TLV, with an explicit `standard` or `simplified` invoice profile. It checks the 700-character cap, one-byte TLV framing, order, duplicates, text fields and required or unexpected tags. The binary summaries preserve the exact wire bytes as `valueBase64` with a separate encoding label and byte length. For tag 6, the inspector identifies both the specified raw form and the published text form. Tag 7 recognizes DER and the published Base64 text form. Tag 8 recognizes the SPKI representation in the example, and tag 9 requires the observed DER form. ECDSA checks cover DER structure and the bounds of a 256-bit signature's two encoded integers.

`structureValid` describes these local checks. `cryptographicVerification` is always `not-performed`. The inspection does not check the invoice hash against XML, verify signatures or certificates, or validate that the public point lies on the curve. Phase 1 encoding, validation and rendering retain their existing profile.

On Windows with Node 24, all 105 tests passed, along with build, type checking, lint and the packed consumer checks. The full published simplified QR passed the inspector's structural checks and produced the expected tag 6 warning.

## Official SDK gate

The official Developer Portal requires acceptance of the download terms before enabling SDK download. No installed SDK was available in this workspace, so the local checks do not provide a versioned SDK verdict. Use an installed official SDK to record its version and compare its QR validation or generation results for both hash representations, the observed tag 7 encoding, and a genuine standard and simplified sample. Record the per-tag diagnostics and fixture hashes before choosing a generation profile. [SDK download](https://sandbox.zatca.gov.sa/downloadSDK), [Developer Portal Manual §2.3.4–2.3.5](https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf)

The signed XML adapter depends on verified signing in M6. It remains outside this inspection work.
