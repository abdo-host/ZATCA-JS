# ZATCA compliance matrix

Evidence through M1 as of 2026-11-03. **Implemented** means the local feature exists and may have known defects. **SDK verified** requires a recorded official SDK version, fixture and result. **Sandbox verified** requires a recorded Sandbox specification and successful workflow evidence. The current evidence consists of local v1 behavior tests, packed consumer checks and official document review. No row has SDK or Sandbox verification.

| Capability | Official reference | Current or planned implementation | Test or fixture | Status |
| --- | --- | --- | --- | --- |
| Phase 1 QR applicability | [Implementation Resolution][resolution], Annex 2 and [ZATCA Phase 1 guidance][phase1] | M2/M3 QR profile and release documentation | QR profile cases for standard and simplified invoices | Not started |
| QR tags 1–5, TLV and Base64 | [Security Standard v1.2][security], §4.1 and Table 3 | [Legacy class](../src/legacy/GenerateQrCode.ts) with v1 behavior. M2 adds the portable invoice encoder in `src/qr/`. | [Synthetic v1 fixture](../tests/fixtures/legacy-v1.json), then T-QR-001–006 and T-QR-018 | Implemented in the legacy class with known Unicode and length defects |
| Seller VAT number, timestamp and monetary fields | [Security Standard v1.2][security], Table 3 and [XML Standard v1.2][xml], BR-KSA-40 and BT-110 | Partial field validation in the [legacy class](../src/legacy/GenerateQrCode.ts). M2 owns QR validation. | T-QR-007–010, including the official second-resolution UTC example and invalid inputs | Implemented in the legacy class with known validation gaps |
| QR size, decoding and structural validation | [Security Standard v1.2][security], §4.1. The Base64 cap is 700 characters. | M2 `src/qr/` | T-QR-011–013 and T-QR-017–018 | Not started |
| QR image output | [Security Standard v1.2][security], §4.1 | [Legacy class](../src/legacy/GenerateQrCode.ts) Node renderer. M3 adds isolated adapters. | Local PNG check and independent scan, then T-QR-019 | Implemented in the legacy class. The v1 PNG scan passed, including a known invalid-input defect. |
| Phase 2 QR tags 6–9 | [Security Standard v1.2][security], §4.1 and Table 3. Tag 6 is a 32-byte hash. Table 3 scopes tag 9 to simplified invoices and their associated notes. | M4 `src/qr/` | T-QR-014–016 and official vectors for standard and simplified profiles | Not started. Exact tag 7–9 byte representations are **BLOCKED — VERIFY**. |
| UBL 2.1 standard/simplified invoices, credit and debit notes | [XML Standard v1.2][xml], §§4, 5.2, 7.4 and 12–13, and [Data Dictionary][dictionary] | M5 `src/xml/` | T-XML-001–008 and official SDK cases for each supported profile | Not started |
| VAT, rounding, discounts, charges and prepayments | [XML Standard v1.2][xml], §§8–11 and §13, and [Data Dictionary][dictionary] | M5 `src/xml/calculator/` | T-XML-001–006 and official calculation examples | Not started |
| XML transform, hash, XAdES and independent signature verification | [Security Standard v1.2][security], §§2.2 and 2.3.3 | M6 `src/crypto/` | T-CRY-001–004 and official signature/hash vectors | Not started. Exact transforms and encodings are **BLOCKED — VERIFY**. |
| Previous invoice hash and invoice counter | [Security Standard v1.2][security], §3 and [XML Standard v1.2][xml], BR-KSA-26, BR-KSA-33, BR-KSA-34 and BR-KSA-61 | M6 `src/crypto/` and host-owned atomic state | T-CRY-005 and official first/subsequent invoice examples | Not started. Rejection and recovery semantics are **BLOCKED — VERIFY**. |
| CSR, certificates and CSID lifecycle | [Security Standard v1.2][security], §§2.1, 2.2.2 and 5, and [Developer Portal Manual v3][sandbox] | M6 `src/crypto/` and M7 `src/api/` | T-CRY-004, T-CRY-006 and T-API-001–002/005 | Not started |
| Sandbox reporting, clearance and failure handling | [Developer Portal Manual v3][sandbox], Integration Sandbox and API documentation, and [Security Standard v1.2][security], §5 | M7 `src/api/` | T-API-003–004 and T-API-006–010 against a pinned Swagger snapshot and Sandbox | Not started. Exact endpoint contracts and retry semantics are **BLOCKED — VERIFY**. |

The [official SDK toolkit][sdk] is the validation source for supported invoice profiles. Record the SDK version, fixture provenance, command and actual outcome before upgrading a row. Local QR parsing, visual scan, official SDK verification and successful Sandbox submission are distinct checks. The [M0 audit](m0-baseline.md) records the local results.

[resolution]: https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Documents/20230519_E-Invoicing%20Implementation%20Resolution%20English.pdf
[phase1]: https://zatca.gov.sa/en/E-Invoicing/PreparingYourBusiness/Phase1/Pages/How-to-prepare.aspx
[security]: https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf
[xml]: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf
[dictionary]: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/E-Invoice-specifications.aspx
[sdk]: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
[sandbox]: https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf
