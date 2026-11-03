# M6 · Invoice hashing, chain state and certificates

M6 adds internal Node.js code for invoice reference hashing, a transaction contract for PIH and ICV, and basic X.509 inspection. The existing QR package exports exclude these modules. The official SDK and independent security review remain release gates.

| Work item | Local result |
| --- | --- |
| CRY-001 | Extracted the hash transform, signature references, certificate profile and CSR fields. The source discrepancies below require official sample and SDK evidence. |
| CRY-002 | Applies the reference filters and hashes libxml2 Canonical XML 1.1 output. A synthetic vector passed on Windows. The Ubuntu CI matrix is configured to run the integration check on Node 24. A Linux run and matching official input and digest are pending. |
| CRY-003–004 | Signing provider, key generation and CSR serialization are gated on confirmed curve, signature input and encoding, and CSR DER layout. |
| CRY-005 | Local certificate parsing, validity dates, leaf check and public-key match. Certificate path, policy, revocation and storage integration are pending. |
| CRY-006 | CSID lifecycle belongs to M7. |
| CRY-007–008 | External atomic transaction contract with per-EGS state, an immutable artifact per issuance ID, collision checks and replay recovery. Tests use a serialized mock store. |
| CRY-009–010 | XAdES, signed QR generation and independent signature verification are gated on official examples and SDK results. |
| CRY-011 | Reviewed parser, execution, credential and transaction boundaries below. Independent review remains pending. |

## Invoice reference

The security and XML standards prescribe three exclusions before C14N 1.1. Remove UBL extensions, aggregate signatures and aggregate document references with a basic component ID whose string value is exactly `QR`. Then take SHA-256 of the canonical UTF-8 bytes and Base64-encode the 32-byte digest. Preserve whitespace in retained XML because changing it can change the digest. The implementation uses expanded names and removes matching subtrees, interpreting the XPath listing together with the explicit removal steps in BR-KSA-26. Its canonicalization URI omits comments. The pipeline preserves namespace declarations on surviving elements. The resulting digest covers the transformed bytes. [Security Standard v1.2, §§2.3.3 and 3][security] · [XML Standard v1.2, BR-KSA-26][xml]

The local golden test covers UTF-8, attribute order, CRLF, namespace aliases, comments, processing instructions, excluded QR and signature data, and retained ICV. Its expected digest is independently computed with Python SHA-256 over manually specified canonical bytes. The test invokes `xmllint --c14n11` from libxml2 2.15.4 on Windows. Set `ZATCA_TEST_XMLLINT` to the absolute path of a trusted xmllint executable before running the tests to enable this integration case. The detailed guide shows an invoice digest without the original XML bytes for that example. The comparison requires a sample with its expected digest from the official toolkit. [Detailed guide, §5.2][guide] · [Official toolkit][sdk]

## Chain behavior

BR-KSA-26 gives an explicit genesis PIH, which is Base64 of the lowercase ASCII hex of SHA-256 of the single character `0`. After genesis, PIH is the previous document's canonical digest in Base64. The detailed guide FAQ states that rejected documents remain in the chain and their ICV cannot be reused. Corrected documents get their own ICV and link to the latest generated document. Clearance can follow generation. [Detailed guide, §7][guide]

Use a durable host store with a transaction lock per environment and EGS, plus uniqueness constraints on issuance ID and ICV in that scope. Use a stable EGS identifier independent of credential rotation. Atomically commit the exact prepared XML, digest, intent and next head before exposing the artifact. An empty head denotes a newly initialized chain. For an existing EGS, initialize the durable state from authoritative records before issuing. A failure before commit leaves the head unchanged. On ambiguous commit outcomes, retry with the same issuance ID and intent to recover the stored artifact. A rejection is recorded separately from chain state. The chain interface trusts the host to bind the assigned PIH and ICV to the prepared XML and its canonical digest. Submission retries and response handling belong to M7.

## Signature and CSR evidence

- The Security Standard §2.3.3 requires at least two XAdES references, one for the transformed invoice and one for SignedProperties. It describes a Base64 SignatureValue and certificate-path material. W3C XML Signature 1.1 specifies the fixed-width concatenation of the ECDSA integers for XMLDSig. The guide §5.2 provides a DER-shaped signature example and describes signing the invoice hash directly. The same guide uses an ASCII hex certificate digest before Base64 encoding and a specific SignedProperties serialization procedure. Capture actual SDK signing inputs and reference bytes before implementing this profile. [W3C XML Signature 1.1][xmldsig] · [Detailed guide, §5.2][guide]
- The Security Standard §2.2.2 lists P-256 in the certificate profile. The guide §5.2 shows an OpenSSL command for secp256k1. Confirm the named curve with SDK samples and accepted CSR and certificate evidence. [Security Standard, §2.2.2][security] · [Detailed guide, §5.2][guide]
- The CSR table maps common name to the EGS unit name, organization identifier (2.5.4.97) to the 15-digit VAT ID, OU to the branch or group member TIN, and O/C to the organization and country. It describes the EGS serial triplet, invoice capability bits TSCZ, device location and industry. Confirm exact subject and SAN directory-name OIDs, ASN.1 string types and extension request layout using the SDK and Sandbox. The certificate table also describes X.509 v3, CA-defined policy, key identifiers, CRL endpoints, optional OCSP, key usage and client authentication EKU. [Security Standard, §2.2.2][security]

## Local verification

- Windows, Node 24.22.1 and libxml2 2.15.4. All 126 unit tests and four legacy tests passed with the canonicalizer configured. The seven M6 tests also passed on Node 22.23.4 and 26.13.0.
- Type checking, formatting, lint, build and packed consumer verification passed.

## Threat boundaries

- Invoice XML can contain attacker-controlled data. The filter uses the existing size, depth and DTD checks before a bounded local canonicalizer subprocess. Execution uses a trusted absolute path and fixed flags. The subprocess receives XML over stdin, no inherited application environment, and returns an error without emitting parser diagnostics to the caller. The trusted installation directory and its shared libraries must be host-controlled.
- A canonical digest or local date and public-key check provides limited evidence. Independent verification must bind the signature and references to the exact invoice and SignedProperties, reject duplicate IDs and unsafe reference targets, verify trust and revocation, and distinguish local verification, official SDK validation, reporting and clearance.
- The host owns durable transaction isolation and protection of stored invoice data. The preparation callback runs inside the transaction and must avoid external submissions and irreversible side effects. Host adapters must redact XML and credentials from errors and logs.
- The signing key and CSID secret belong in server-managed secure storage. CSR, credential storage, signing authorization and rollover require review before enabling issuance. The test fixture contains only a synthetic public certificate.

[security]: https://www.zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf
[xml]: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf
[guide]: https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf
[xmldsig]: https://www.w3.org/TR/xmldsig-core1/
[sdk]: https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
