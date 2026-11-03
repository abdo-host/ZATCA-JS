# M2 Phase 1 QR payloads

The private development package exposes the portable API at `zatca/qr`. Node users can also import `encodeQrBase64` from the package root. This API covers invoice payloads with tags 1 through 5.

```ts
import { decodeQrBase64, encodeQrBase64, validateQrPayload } from 'zatca/qr';

const base64 = encodeQrBase64({
  sellerName: 'شركة',
  vatNumber: '300000000000003',
  issuedAt: '2024-02-29T15:30:00+03:00',
  invoiceTotal: '115.00',
  vatTotal: '15.00',
});

const decoded = decodeQrBase64(base64);
const { valid, errors } = validateQrPayload(base64);
```

`encodeQrTlv` returns raw bytes and `decodeQrTlv` accepts a `Uint8Array`. Encoding invalid input throws `ZatcaValidationError` with machine-readable `issues`. Decoding returns errors and warnings alongside the fields and copies of the complete raw tags. Strict mode is the default. Pass `{ mode: 'tolerant' }` to inspect payloads with unknown nonzero tags. They remain opaque and are reported as warnings, with phase `unknown`. Duplicates, missing or reordered Phase 1 tags, tag zero, truncation, malformed UTF-8 and invalid field values are errors in either mode. Use `validateQrPayload` for the strict Phase 1 result.

## Field and size policy

- The encoder preserves seller text byte-for-byte in UTF-8, including combining marks, surrounding whitespace and supplementary characters. It rejects blank names and unpaired surrogates. Each field is limited to 255 UTF-8 bytes. Canonical standard Base64 is capped at 700 characters, equivalent to at most 525 raw bytes. [Security Standard v1.2, §4.1 and Table 3](https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf)
- The seller VAT number uses 15 ASCII digits with `3` at both ends, following the seller format in BR-KSA-40. This is a format check. [XML Implementation Standard v1.2](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf)
- Timestamps use a real Gregorian date, 24-hour time with seconds, optional fractional seconds, and `Z` or a numeric `±HH:mm` offset. The original offset and precision are preserved. Leap seconds and `24:00` are outside this API's timestamp policy.
- The QR API accepts nonnegative plain decimal strings without redundant leading zeros and preserves scale. Invoice rounding, currency and relationships between totals are checked at the invoice level in a later milestone.

## Evidence and next milestone

The [golden fixture](../tests/fixtures/phase1-golden.json) reproduces the published “Bobs Records” QR example from ZATCA's guide. The synthetic Arabic fixture begins with `01 08 d8 b4 d8 b1 d9 83 d8 a9`. The first two bytes are the tag and the eight-byte length. [ZATCA Detailed Technical Guideline, QR data examples](https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf)

The [Phase 1 suite](../tests/unit/phase1.test.ts) covers exact encoding, malformed inputs and seeded property and fuzz runs. All 72 tests passed on Node 22, 24 and 26 on Windows. The packed CommonJS and ESM consumers and a headless Chrome run of the Vite-built browser fixture produced the same Arabic Base64. The browser build checks that the dependency graph stays free of Node built-ins and the renderer. The build, lint, typecheck, package metadata and dependency checks passed.

These checks validate QR payloads. Official SDK conformance remains pending in the [compliance matrix](compliance-matrix.md). M3 connects the existing image renderer and legacy adapter to the new core. The characterization tests still record the original `GenerateQrCode` behavior for that migration.
