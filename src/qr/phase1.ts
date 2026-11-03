import { decodeBase64, encodeBase64 } from '../core/base64.js';
import {
  ZatcaEncodingError,
  type ZatcaIssue,
  ZatcaValidationError,
} from '../core/errors.js';
import { decodeUtf8, encodeUtf8 } from '../core/utf8.js';
import {
  checkField,
  fieldTooLong,
  issue,
  maxFieldBytes,
  phase1Fields,
  type QrPhase1Input,
} from './phase1-fields.js';

const maxBase64Length = 700;
const maxTlvBytes = (maxBase64Length / 4) * 3;

export interface QrDecodeOptions {
  /** Strict mode rejects all unknown tags. Tolerant mode reports them as warnings. */
  mode?: 'strict' | 'tolerant';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ZatcaIssue[];
  readonly warnings: readonly ZatcaIssue[];
}

export interface QrDecodeResult extends ValidationResult {
  readonly phase: 'phase1' | 'unknown';
  readonly fields: Readonly<Partial<QrPhase1Input>>;
  /** Raw value bytes copied from each complete TLV record, including unknown tags. */
  readonly tags: readonly {
    readonly tag: number;
    readonly value: Uint8Array;
  }[];
}

function sizeIssue(): ZatcaIssue {
  return {
    ...issue(
      'ZATCA_QR_PAYLOAD_TOO_LONG',
      'A QR payload can occupy at most 700 Base64 characters (525 TLV bytes)',
      '/qr',
    ),
    specReference: 'Security Standard §4.1',
  };
}

function invalidInput(errors: readonly ZatcaIssue[]): never {
  throw new ZatcaValidationError('Invalid Phase 1 QR invoice fields', errors);
}

/** Encodes tags 1 through 5 in ascending order. Invalid inputs throw ZatcaValidationError. */
export function encodeQrTlv(input: QrPhase1Input): Uint8Array {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    invalidInput([
      issue('ZATCA_QR_INPUT_TYPE', 'Expected an invoice fields object', '/qr'),
    ]);
  }
  const errors: ZatcaIssue[] = [];
  const values: Uint8Array[] = [];
  let size = 0;
  for (const field of phase1Fields) {
    const value = input[field];
    const problem = checkField(field, value);
    if (problem) {
      errors.push(problem);
      continue;
    }
    const bytes = encodeUtf8(value);
    if (bytes.length > maxFieldBytes) errors.push(fieldTooLong(field));
    values.push(bytes);
    size += 2 + bytes.length;
  }
  if (errors.length) invalidInput(errors);
  if (size > maxTlvBytes) invalidInput([sizeIssue()]);

  const result = new Uint8Array(size);
  let offset = 0;
  for (const [index, value] of values.entries()) {
    result.set([index + 1, value.length], offset);
    result.set(value, offset + 2);
    offset += 2 + value.length;
  }
  return result;
}

/** Encodes a Phase 1 invoice as canonical standard Base64. */
export function encodeQrBase64(input: QrPhase1Input): string {
  return encodeBase64(encodeQrTlv(input));
}

function emptyResult(error: ZatcaIssue): QrDecodeResult {
  return {
    valid: false,
    phase: 'unknown',
    fields: {},
    tags: [],
    errors: [error],
    warnings: [],
  };
}

/** Reads complete TLV records and reports any structure or field errors. */
export function decodeQrTlv(
  data: Uint8Array,
  options?: QrDecodeOptions,
): QrDecodeResult {
  return decodeTlvRecords(data, options, 5);
}

export function decodeTlvRecords(
  data: Uint8Array,
  options: QrDecodeOptions | undefined,
  maxKnownTag: 5 | 9,
): QrDecodeResult {
  if (
    !ArrayBuffer.isView(data) ||
    Object.prototype.toString.call(data) !== '[object Uint8Array]'
  ) {
    return emptyResult(
      issue('ZATCA_QR_INPUT_TYPE', 'Expected Uint8Array TLV bytes', '/qr'),
    );
  }
  if (data.length > maxTlvBytes) return emptyResult(sizeIssue());

  const fields: Partial<QrPhase1Input> = {};
  const tags: { tag: number; value: Uint8Array }[] = [];
  const errors: ZatcaIssue[] = [];
  const warnings: ZatcaIssue[] = [];
  const seen = new Set<number>();
  let highestKnownTag = 0;

  for (let offset = 0; offset < data.length; ) {
    const tag = data[offset];
    const length = data[offset + 1];
    const path = `/qr/tags/${tags.length}`;
    if (
      tag === undefined ||
      length === undefined ||
      offset + 2 + length > data.length
    ) {
      errors.push(
        issue(
          'ZATCA_QR_TRUNCATED_TLV',
          `Incomplete TLV record at byte ${offset}`,
          path,
        ),
      );
      break;
    }
    const end = offset + 2 + length;
    const value = new Uint8Array(data.subarray(offset + 2, end));
    tags.push({ tag, value });
    offset = end;

    if (seen.has(tag)) {
      errors.push(
        issue('ZATCA_QR_DUPLICATE_TAG', `Duplicate TLV tag ${tag}`, path),
      );
      continue;
    }
    seen.add(tag);
    if (tag === 0 || tag > maxKnownTag) {
      const problem = issue(
        'ZATCA_QR_UNKNOWN_TAG',
        `Unsupported QR tag ${tag}`,
        path,
      );
      if (options?.mode === 'tolerant' && tag !== 0)
        warnings.push({ ...problem, severity: 'warning' });
      else errors.push(problem);
      continue;
    }
    if (tag < highestKnownTag)
      errors.push(
        issue('ZATCA_QR_TAG_ORDER', 'QR tags must be in ascending order', path),
      );
    highestKnownTag = Math.max(tag, highestKnownTag);
    const field = phase1Fields[tag - 1];
    if (!field) continue;

    try {
      const text = decodeUtf8(value);
      fields[field] = text;
      const problem = checkField(field, text);
      if (problem) errors.push(problem);
    } catch (error) {
      if (!(error instanceof ZatcaEncodingError)) throw error;
      errors.push(issue(error.code, error.message, `/qr/${field}`));
    }
  }

  for (const [index, field] of phase1Fields.entries()) {
    if (!seen.has(index + 1)) {
      errors.push(
        issue(
          'ZATCA_QR_MISSING_TAG',
          `Missing required Phase 1 tag ${index + 1}`,
          `/qr/${field}`,
        ),
      );
    }
  }
  return {
    valid: errors.length === 0,
    phase: errors.length === 0 && warnings.length === 0 ? 'phase1' : 'unknown',
    fields,
    tags,
    errors,
    warnings,
  };
}

/** Reads a canonical Base64 QR payload, returning diagnostics for invalid input. */
export function decodeQrBase64(
  data: string,
  options?: QrDecodeOptions,
): QrDecodeResult {
  return decodeBase64Records(data, options, 5);
}

export function decodeBase64Records(
  data: string,
  options: QrDecodeOptions | undefined,
  maxKnownTag: 5 | 9,
): QrDecodeResult {
  if (typeof data !== 'string')
    return emptyResult(
      issue('ZATCA_QR_INPUT_TYPE', 'Expected a Base64 string', '/qr'),
    );
  if (data.length > maxBase64Length) return emptyResult(sizeIssue());
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(data);
  } catch (error) {
    if (!(error instanceof ZatcaEncodingError)) throw error;
    return emptyResult(issue(error.code, error.message, '/qr'));
  }
  return decodeTlvRecords(bytes, options, maxKnownTag);
}

/** Checks the strict Phase 1 QR structure and fields. This does not validate an invoice. */
export function validateQrPayload(
  input: Uint8Array | string,
): ValidationResult {
  const { valid, errors, warnings } =
    typeof input === 'string' ? decodeQrBase64(input) : decodeQrTlv(input);
  return { valid, errors, warnings };
}
