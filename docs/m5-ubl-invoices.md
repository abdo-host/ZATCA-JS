# M5 unsigned UBL invoice drafts

The development module in [src/xml](../src/xml/index.ts) calculates amounts, writes unsigned UBL 2.1 XML, and extracts document metadata from existing XML. The package export is gated on official verification. The supported draft subset covers domestic SAR standard and simplified invoices and their credit and debit notes, with ordinary transaction flags.

## Profile mapping

| Area | UBL mapping | Draft requirements |
| --- | --- | --- |
| Identity and time | BT-23, BT-1, BT-2, KSA-1, KSA-25 | Reporting profile, invoice ID, UUID and a Gregorian timestamp in AST `+03:00` or UTC `Z`. The writer emits local time without a suffix and UTC time with `Z`, per BR-KSA-70. |
| Document type | BT-3 and KSA-2 | An `Invoice` root for code 388, 381 or 383 with subtype `0100000` or `0200000`. |
| Parties | BT-27, BT-29, BT-31, BT-44, BT-48 and postal addresses | Saudi seller with CRN, VAT number and address. A buyer is required for standard documents and optional for ordinary simplified drafts. A provided buyer uses a domestic address. |
| Delivery and note references | KSA-5, BT-25, BT-26 and KSA-10 | Standard invoices require a supply date. Notes require the original document ID and reason. The draft accepts a reference UUID and issue date when available. |
| Sequence fields | KSA-13 and KSA-16 | Caller provides the previous invoice hash and invoice counter. This module validates their format. |
| Money and VAT | BT-106–112, BT-115–121, BT-129, BT-131, BT-146 and BT-149 | SAR, tax-exclusive unit prices, quantities, price base quantity, fixed line and document adjustments, and per-category VAT. The writer emits the separate SAR tax total required by BR-KSA-EN16931-09. |

The field mapping and calculation rules were checked against the [May 2023 Data Dictionary](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_EInvoice_Data_Dictionary%20vF.xlsx) and the [XML Implementation Standard v1.2](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf), especially §§9–13.

`calculateInvoice(draft)` uses fixed-point integer arithmetic. It rounds price × quantity ÷ price base quantity to cents before applying line adjustments. It computes document VAT from each category's taxable total after document adjustments, and uses half-up rounding. It supports standard VAT at 15%, zero-rated codes `VATEX-SA-35` and `VATEX-SA-36`, and exempt codes `VATEX-SA-29`, `VATEX-SA-29-7` and `VATEX-SA-30`. The caller is responsible for choosing the tax category and reason for the transaction.

`buildInvoiceXml(draft)` validates the input and calculates totals from that input. `parseInvoiceXml(xml)` extracts the header, totals, line count and XML signature element presence by namespace. `validateInvoiceXml(xml)` checks that this envelope is readable and its core fields are present. It applies a 2 MiB UTF-8 cap, depth and element-count limits, and rejects DTDs, malformed XML and duplicate captured fields. The opt-in XSD check below validates schema structure separately.

Foreign currencies, VAT-inclusive unit-price conversion, advance/prepayment adjustments under §9.5, category O, additional invoice flags and broader tax or payment codes are outside this subset. Unknown draft fields and unsupported values return typed errors. The generated XML is unsigned. The caller provides sequence state and subsequent milestones own signing and submission.

## Local verification

The [tests](../tests/unit/invoice.test.ts) exercise the §9.3 base-quantity and adjustment examples, category-level VAT rounding, mixed taxes, Arabic escaping, both profiles and both note types, and malicious XML. All 123 tests passed on Windows with Node 24. The six [synthetic drafts](../tests/fixtures/invoice-drafts.ts) passed the official OASIS UBL 2.1 Invoice XSD, and the schema rejected an empty invoice. The ZATCA SDK business-rule and signing checks remain pending. [OASIS UBL 2.1](https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.html)

To repeat the XSD check, unpack the official UBL 2.1 distribution locally and point `$schema` at `xsd/maindoc/UBL-Invoice-2.1.xsd` inside it. Run the following from the repository root in PowerShell.

```powershell
$schema = 'C:/path/to/UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd'
$scratch = Join-Path (Get-Location) 'node_modules/.cache/zatca-xml-fixtures'
$output = Join-Path ([IO.Path]::GetTempPath()) "zatca-xml-$([guid]::NewGuid())"
npm ci
npm exec --offline -- tsdown scripts/write-xml-fixtures.ts --no-config --out-dir $scratch --no-clean --no-dts
node (Join-Path $scratch 'write-xml-fixtures.mjs') $output
./scripts/verify-ubl.ps1 -SchemaPath $schema -XmlPath (Get-ChildItem -LiteralPath $output -Filter '*.xml').FullName
```

For official conformance, use a locally installed ZATCA SDK, record its version, and apply its documented XML validation command to each profile with the required signed envelope. Capture business-rule and signature diagnostics separately. The [Developer Portal manual](https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf) documents access to the offline SDK.

The Node source typecheck skips third-party declaration checking because the pinned SAX parser's declarations conflict with strict compiler options. The project's own TypeScript remains strict, and the independent QR typecheck and packed TypeScript consumer checks retain declaration checking.
