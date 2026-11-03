import { ZatcaEncodingError } from './errors.js';

/** Encodes bytes as canonical standard Base64, with padding when needed. */
export function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decodes canonical standard Base64. Rejects whitespace, omitted padding and nonzero pad bits. */
export function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch (cause) {
    throw new ZatcaEncodingError(
      'Invalid Base64 string',
      'ZATCA_INVALID_BASE64',
      { cause },
    );
  }
  if (btoa(binary) !== value) {
    throw new ZatcaEncodingError(
      'Expected canonical standard Base64',
      'ZATCA_INVALID_BASE64',
    );
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
