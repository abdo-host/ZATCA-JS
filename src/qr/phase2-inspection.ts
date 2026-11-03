import { decodeBase64, encodeBase64 } from '../core/base64.js';
import { ZatcaEncodingError, type ZatcaIssue } from '../core/errors.js';
import { issue, type QrPhase1Input } from './phase1-fields.js';
import { decodeBase64Records, decodeTlvRecords } from './phase1.js';

export type Phase2InvoiceType = 'standard' | 'simplified';

export interface Phase2BinaryTag {
  readonly tag: 6 | 7 | 8 | 9;
  readonly byteLength: number;
  /** Canonical Base64 of the exact TLV value bytes, even when those bytes are Base64 text. */
  readonly valueBase64: string;
  readonly encoding:
    | 'sha256-raw'
    | 'sha256-base64-text'
    | 'ecdsa-der'
    | 'ecdsa-der-base64-text'
    | 'secp256k1-spki-der'
    | 'unrecognized';
}

export interface Phase2QrInspection {
  /** Whether the supported profile and inspected representations are structurally consistent. */
  readonly structureValid: boolean;
  readonly cryptographicVerification: 'not-performed';
  readonly fields: Readonly<Partial<QrPhase1Input>>;
  readonly binaryTags: readonly Phase2BinaryTag[];
  readonly errors: readonly ZatcaIssue[];
  readonly warnings: readonly ZatcaIssue[];
}

// DER SubjectPublicKeyInfo prefix for id-ecPublicKey, secp256k1 and an uncompressed point.
const spkiPrefix = Uint8Array.of(
  0x30,
  0x56,
  0x30,
  0x10,
  0x06,
  0x07,
  0x2a,
  0x86,
  0x48,
  0xce,
  0x3d,
  0x02,
  0x01,
  0x06,
  0x05,
  0x2b,
  0x81,
  0x04,
  0x00,
  0x0a,
  0x03,
  0x42,
  0x00,
  0x04,
);

function readBase64Text(value: Uint8Array): Uint8Array | undefined {
  try {
    return decodeBase64(String.fromCharCode(...value));
  } catch (error) {
    if (!(error instanceof ZatcaEncodingError)) throw error;
    return undefined;
  }
}

function isEcdsaDer(bytes: Uint8Array): boolean {
  if (
    bytes.length < 8 ||
    bytes.length > 72 ||
    bytes[0] !== 0x30 ||
    bytes[1] !== bytes.length - 2
  ) {
    return false;
  }

  let cursor = 2;
  for (let i = 0; i < 2; i++) {
    const length = bytes[cursor + 1];
    if (
      bytes[cursor] !== 0x02 ||
      length === undefined ||
      length < 1 ||
      length > 33
    )
      return false;

    const start = cursor + 2;
    const first = bytes[start];
    const next = bytes[start + 1] ?? 0;
    if (start + length > bytes.length || first === undefined || first >= 0x80)
      return false;
    if (first === 0 ? length === 1 || next < 0x80 : length === 33) return false;
    cursor = start + length;
  }
  return cursor === bytes.length;
}

function identifyEncoding(
  tag: Phase2BinaryTag['tag'],
  value: Uint8Array,
): Phase2BinaryTag['encoding'] {
  if (tag === 6) {
    if (value.length === 32) return 'sha256-raw';
    if (value.length === 44 && readBase64Text(value)?.length === 32)
      return 'sha256-base64-text';
  } else if (tag === 7) {
    if (isEcdsaDer(value)) return 'ecdsa-der';
    const decoded = readBase64Text(value);
    if (decoded && isEcdsaDer(decoded)) return 'ecdsa-der-base64-text';
  } else if (tag === 8) {
    if (
      value.length === 88 &&
      spkiPrefix.every((byte, index) => value[index] === byte)
    ) {
      return 'secp256k1-spki-der';
    }
  } else if (isEcdsaDer(value)) {
    return 'ecdsa-der';
  }
  return 'unrecognized';
}

/**
 * Inspects Phase 2 tag layout and recognized wire encodings. Requires an explicit invoice profile.
 * @experimental The Security Standard and published example disagree on tag 6.
 */
export function inspectPhase2Qr(
  input: string | Uint8Array,
  invoiceType: Phase2InvoiceType,
): Phase2QrInspection {
  const decoded =
    typeof input === 'string'
      ? decodeBase64Records(input, undefined, 9)
      : decodeTlvRecords(input, undefined, 9);
  const errors = [...decoded.errors];
  const warnings: ZatcaIssue[] = [];
  const binaryTags: Phase2BinaryTag[] = [];
  const seen = new Set<number>();

  if (invoiceType !== 'standard' && invoiceType !== 'simplified') {
    errors.push(
      issue(
        'ZATCA_QR_PHASE2_PROFILE',
        'Expected standard or simplified',
        '/qr/invoiceType',
      ),
    );
  }

  for (const { tag, value } of decoded.tags) {
    if (tag !== 6 && tag !== 7 && tag !== 8 && tag !== 9) continue;
    seen.add(tag);
    const encoding = identifyEncoding(tag, value);
    const path = `/qr/phase2/tag${tag}`;
    binaryTags.push({
      tag,
      byteLength: value.length,
      valueBase64: encodeBase64(value),
      encoding,
    });

    if (tag === 9 && invoiceType === 'standard') {
      errors.push(
        issue(
          'ZATCA_QR_PHASE2_UNEXPECTED_TAG',
          'Tag 9 is scoped to the simplified profile',
          path,
        ),
      );
    }
    if (encoding === 'unrecognized') {
      errors.push(
        issue(
          'ZATCA_QR_PHASE2_ENCODING',
          `Unrecognized Phase 2 value encoding for tag ${tag}`,
          path,
        ),
      );
    } else if (
      encoding === 'sha256-base64-text' ||
      (tag === 7 && encoding === 'ecdsa-der')
    ) {
      warnings.push({
        ...issue(
          'ZATCA_QR_PHASE2_WIRE_VARIANT',
          encoding === 'sha256-base64-text'
            ? 'Tag 6 follows the published example rather than the 32-byte form in the Security Standard'
            : 'Raw DER in tag 7 differs from the Base64 text in the published example',
          path,
        ),
        severity: 'warning',
      });
    }
  }

  if (decoded.tags.length || !decoded.errors.length) {
    const required = invoiceType === 'simplified' ? [6, 7, 8, 9] : [6, 7, 8];
    for (const tag of required) {
      if (!seen.has(tag))
        errors.push(
          issue(
            'ZATCA_QR_MISSING_TAG',
            `Missing required Phase 2 tag ${tag}`,
            `/qr/phase2/tag${tag}`,
          ),
        );
    }
  }

  return {
    structureValid: errors.length === 0,
    cryptographicVerification: 'not-performed',
    fields: decoded.fields,
    binaryTags,
    errors,
    warnings,
  };
}
