import { describe, expect, it } from 'vitest';
import {
  ZatcaApiError,
  ZatcaComplianceError,
  ZatcaEncodingError,
  ZatcaError,
  ZatcaValidationError,
} from '../../src/core/errors.js';
import {
  decodeBase64,
  decodeUtf8,
  encodeBase64,
  encodeUtf8,
} from '../../src/qr/index.js';

describe('portable encoding primitives', () => {
  it('round-trips Arabic and supplementary characters byte-for-byte', () => {
    const text = 'شركة 😀';
    const bytes = Uint8Array.of(
      216,
      180,
      216,
      177,
      217,
      131,
      216,
      169,
      32,
      240,
      159,
      152,
      128,
    );
    expect(encodeUtf8(text)).toEqual(bytes);
    expect(decodeUtf8(bytes)).toBe(text);
    expect(encodeBase64(bytes)).toBe('2LTYsdmD2Kkg8J+YgA==');
    expect(decodeBase64('2LTYsdmD2Kkg8J+YgA==')).toEqual(bytes);
  });

  it('preserves empty data and the UTF-8 BOM', () => {
    expect(encodeBase64(encodeUtf8(''))).toBe('');
    expect(decodeUtf8(decodeBase64(''))).toBe('');
    expect(decodeUtf8(encodeUtf8('\uFEFFhi'))).toBe('\uFEFFhi');
  });

  it('handles byte arrays larger than the JavaScript spread argument limit', () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => i % 256);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it.each(['YQ', 'Y Q==', 'YR==', 'YQ===', '_w==', '%%%%'])(
    'rejects noncanonical Base64 %j with a typed error',
    (input) => {
      expect(() => decodeBase64(input)).toThrow(ZatcaEncodingError);
      expect(() => decodeBase64(input)).toThrow(
        expect.objectContaining({ code: 'ZATCA_INVALID_BASE64' }),
      );
    },
  );

  it.each([Uint8Array.of(0x80), Uint8Array.of(0xf0, 0x9f)])(
    'rejects invalid UTF-8 %j',
    (bytes) => {
      expect(() => decodeUtf8(bytes)).toThrow(ZatcaEncodingError);
      expect(() => decodeUtf8(bytes)).toThrow(
        expect.objectContaining({ code: 'ZATCA_INVALID_UTF8' }),
      );
    },
  );
});

it('exposes stable error names, codes, validation issues and causes', () => {
  const issue = {
    code: 'REQUIRED',
    severity: 'error',
    message: 'Required',
  } as const;
  const cause = new Error('underlying error');
  const validation = new ZatcaValidationError('Invalid input', [issue], {
    cause,
  });
  expect(validation).toBeInstanceOf(ZatcaError);
  expect(validation).toMatchObject({
    name: 'ZatcaValidationError',
    code: 'ZATCA_VALIDATION_ERROR',
    issues: [issue],
    cause,
  });
  expect(new ZatcaError('error').code).toBe('ZATCA_ERROR');
  expect(new ZatcaValidationError('invalid').issues).toEqual([]);
  expect(new ZatcaEncodingError('encode').code).toBe('ZATCA_ENCODING_ERROR');
  expect(new ZatcaComplianceError('check').code).toBe('ZATCA_COMPLIANCE_ERROR');
  expect(new ZatcaApiError('request').code).toBe('ZATCA_API_ERROR');
});
