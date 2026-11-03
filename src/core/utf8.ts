import { ZatcaEncodingError } from './errors.js';

/** Encodes text as UTF-8 using the platform's TextEncoder. */
export function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Decodes UTF-8 without dropping a leading BOM. Rejects invalid byte sequences. */
export function decodeUtf8(value: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      value,
    );
  } catch (cause) {
    throw new ZatcaEncodingError('Invalid UTF-8 bytes', 'ZATCA_INVALID_UTF8', {
      cause,
    });
  }
}
