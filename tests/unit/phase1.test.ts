import { Buffer } from 'node:buffer';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeQrBase64,
  decodeQrTlv,
  encodeQrBase64,
  encodeQrTlv,
  type QrPhase1Input,
  validateQrPayload,
  ZatcaValidationError,
} from '../../src/qr/index.js';
import fixture from '../fixtures/phase1-golden.json' with { type: 'json' };

const { arabic, official } = fixture;
const input = arabic.input;
const validBytes = Buffer.from(arabic.hex, 'hex');
const prefix = 'ZATCA_QR_';

function rejects(
  fields: Partial<QrPhase1Input>,
  code: string,
  field: keyof QrPhase1Input,
) {
  expect(() => encodeQrTlv({ ...input, ...fields })).toThrow(
    ZatcaValidationError,
  );
  expect(() => encodeQrTlv({ ...input, ...fields })).toThrow(
    expect.objectContaining({
      issues: [
        expect.objectContaining({
          code: prefix + code,
          path: `/qr/${field}`,
          severity: 'error',
        }),
      ],
    }),
  );
}

describe('Phase 1 QR vectors', () => {
  it.each([official, arabic])(
    'encodes and decodes exact bytes for $input.sellerName',
    ({ input, hex, base64 }) => {
      expect(Buffer.from(encodeQrTlv(input)).toString('hex')).toBe(hex);
      expect(encodeQrBase64(input)).toBe(base64);
      expect(decodeQrBase64(base64)).toMatchObject({
        valid: true,
        phase: 'phase1',
        fields: input,
        errors: [],
        warnings: [],
      });
      expect(validateQrPayload(Buffer.from(hex, 'hex'))).toEqual({
        valid: true,
        errors: [],
        warnings: [],
      });
    },
  );

  it('preserves Arabic, supplementary characters, combining marks and whitespace', () => {
    const sellerName = '  شركة – 😀 e\u0301  ';
    const bytes = encodeQrTlv({ ...input, sellerName });
    expect(bytes[1]).toBe(Buffer.byteLength(sellerName));
    expect(decodeQrTlv(bytes).fields.sellerName).toBe(sellerName);
    expect(encodeQrTlv(input).slice(0, 10)).toEqual(
      Uint8Array.of(1, 8, 216, 180, 216, 177, 217, 131, 216, 169),
    );
  });

  it('accepts exactly 255 bytes per tag and rejects both ASCII and multibyte overflow', () => {
    for (const sellerName of ['A'.repeat(255), `${'ش'.repeat(127)}A`]) {
      expect(encodeQrTlv({ ...input, sellerName })[1]).toBe(255);
    }
    for (const sellerName of [
      'A'.repeat(256),
      'ش'.repeat(128),
      '😀'.repeat(64),
    ]) {
      rejects({ sellerName }, 'FIELD_TOO_LONG', 'sellerName');
    }
  });

  it('enforces 700 Base64 characters and 525 TLV bytes in both directions', () => {
    const sellerName = 'A'.repeat(255);
    const invoiceTotal = '1'.repeat(215);
    const boundary = { ...input, sellerName, invoiceTotal };
    const bytes = encodeQrTlv(boundary);
    expect(bytes.length).toBe(525);
    expect(encodeQrBase64(boundary)).toHaveLength(700);
    expect(decodeQrTlv(bytes).valid).toBe(true);
    expect(decodeQrBase64(encodeQrBase64(boundary)).valid).toBe(true);
    expect(() =>
      encodeQrBase64({ ...boundary, invoiceTotal: `${invoiceTotal}0` }),
    ).toThrow(
      expect.objectContaining({
        issues: [
          expect.objectContaining({ code: 'ZATCA_QR_PAYLOAD_TOO_LONG' }),
        ],
      }),
    );
    for (const oversized of [new Uint8Array(526), 'A'.repeat(701)]) {
      expect(validateQrPayload(oversized).errors).toMatchObject([
        { code: 'ZATCA_QR_PAYLOAD_TOO_LONG' },
      ]);
    }
  });
});

describe('Phase 1 field policy', () => {
  it.each(['', '  ', '\uD800', '\uDC00'])(
    'rejects invalid seller %j',
    (sellerName) => {
      rejects({ sellerName }, 'INVALID_SELLER', 'sellerName');
    },
  );

  it.each([
    '30000000000003',
    '3000000000000003',
    '3ABCDEFGHIJKLM3',
    '300000000000004',
    '400000000000003',
    '3٠٠٠٠٠٠٠٠٠٠٠٠3',
    '300000000000003\n',
  ])('rejects invalid VAT %j', (vatNumber) =>
    rejects({ vatNumber }, 'INVALID_VAT', 'vatNumber'),
  );

  it.each([
    '2024-02-29T00:00:00Z',
    '2000-02-29T23:59:59.123456-03:30',
    '2024-04-30T23:00:00+03:00',
  ])('preserves the zoned timestamp %s', (issuedAt) =>
    expect(
      decodeQrTlv(encodeQrTlv({ ...input, issuedAt })).fields.issuedAt,
    ).toBe(issuedAt),
  );

  it.each([
    '2023-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '2024-04-31T00:00:00Z',
    '2024-00-01T00:00:00Z',
    '2024-01-01T24:00:00Z',
    '2024-01-01T00:00:60Z',
    '2024-01-01T00:00:00',
    '2024-01-01T00:00:00+24:00',
    '2024-01-01T00:00:00+03:60',
    '2024-01-01T00:00:00x123Z',
    '2024-01-01T00:00:00Z\n',
  ])('rejects invalid time %j', (issuedAt) =>
    rejects({ issuedAt }, 'INVALID_TIMESTAMP', 'issuedAt'),
  );

  it.each([
    '00',
    '0115.00',
    '1e3',
    '-1',
    '-0',
    '+1',
    '.5',
    '1.',
    'NaN',
    'Infinity',
    ' 1',
    '1\n',
  ])('rejects invalid amount %j', (vatTotal) =>
    rejects({ vatTotal }, 'INVALID_AMOUNT', 'vatTotal'),
  );

  it('preserves decimal precision and reports wrong runtime types', () => {
    const invoiceTotal = '9007199254740993.0001';
    expect(
      decodeQrTlv(encodeQrTlv({ ...input, invoiceTotal, vatTotal: '0.00' }))
        .fields,
    ).toMatchObject({ invoiceTotal, vatTotal: '0.00' });
    rejects({ vatTotal: 15 as unknown as string }, 'FIELD_TYPE', 'vatTotal');
    expect(() => encodeQrTlv(null as unknown as QrPhase1Input)).toThrow(
      ZatcaValidationError,
    );
    expect(() => encodeQrTlv({} as QrPhase1Input)).toThrow(
      expect.objectContaining({
        issues: Array.from({ length: 5 }, () =>
          expect.objectContaining({ code: 'ZATCA_QR_FIELD_TYPE' }),
        ),
      }),
    );
  });
});

describe('Phase 1 diagnostics', () => {
  it('reports partial results on truncated values, headers and missing tags', () => {
    expect(decodeQrTlv(validBytes.subarray(0, -1))).toMatchObject({
      valid: false,
      fields: { sellerName: input.sellerName },
      errors: [
        { code: 'ZATCA_QR_TRUNCATED_TLV' },
        { code: 'ZATCA_QR_MISSING_TAG', path: '/qr/vatTotal' },
      ],
    });
    expect(
      decodeQrTlv(Buffer.concat([validBytes, Buffer.of(42)])).errors,
    ).toMatchObject([{ code: 'ZATCA_QR_TRUNCATED_TLV' }]);
    expect(decodeQrTlv(new Uint8Array()).errors).toHaveLength(5);
  });

  it('rejects duplicates and reordered known tags even in tolerant mode', () => {
    const first = validBytes.subarray(0, 10);
    const reordered = Buffer.concat([validBytes.subarray(10), first]);
    const duplicated = Buffer.concat([validBytes, first]);
    for (const [bytes, code] of [
      [reordered, 'TAG_ORDER'],
      [duplicated, 'DUPLICATE_TAG'],
    ] as const) {
      expect(decodeQrTlv(bytes, { mode: 'tolerant' }).errors).toMatchObject([
        { code: prefix + code },
      ]);
    }
  });

  it('retains opaque unknown tags in tolerant mode and rejects them in strict mode', () => {
    const bytes = Buffer.concat([validBytes, Buffer.of(42, 1, 255)]);
    expect(validateQrPayload(bytes).errors).toMatchObject([
      { code: 'ZATCA_QR_UNKNOWN_TAG' },
    ]);
    const result = decodeQrTlv(bytes, { mode: 'tolerant' });
    expect(result).toMatchObject({
      valid: true,
      phase: 'unknown',
      errors: [],
      warnings: [{ code: 'ZATCA_QR_UNKNOWN_TAG' }],
    });
    bytes.fill(0);
    expect(result.tags.at(-1)).toEqual({ tag: 42, value: Uint8Array.of(255) });
    expect(
      decodeQrTlv(Buffer.concat([validBytes, Buffer.of(0, 0)]), {
        mode: 'tolerant',
      }).valid,
    ).toBe(false);
  });

  it('rejects malformed UTF-8 and semantically invalid TLV fields', () => {
    const malformed = Buffer.from(validBytes);
    malformed[2] = 0xff;
    expect(decodeQrTlv(malformed).errors).toMatchObject([
      { code: 'ZATCA_INVALID_UTF8', path: '/qr/sellerName' },
    ]);
    const invalidVat = Buffer.from(validBytes);
    invalidVat[12] = 0x41;
    expect(decodeQrTlv(invalidVat).errors).toMatchObject([
      { code: 'ZATCA_QR_INVALID_VAT', path: '/qr/vatNumber' },
    ]);
  });

  it.each(['%%%%', 'YQ', 'YR==', 'Y Q=='])(
    'rejects malformed Base64 %j',
    (base64) => {
      expect(validateQrPayload(base64).errors).toMatchObject([
        { code: 'ZATCA_INVALID_BASE64' },
      ]);
    },
  );

  it('reports wrong payload types', () => {
    expect(
      decodeQrTlv(new Int8Array() as unknown as Uint8Array).errors[0]?.code,
    ).toBe('ZATCA_QR_INPUT_TYPE');
    expect(decodeQrBase64(null as unknown as string).errors[0]?.code).toBe(
      'ZATCA_QR_INPUT_TYPE',
    );
  });
});

describe('Phase 1 properties', () => {
  it('round-trips independently generated Unicode invoice fields byte-for-byte', () => {
    fc.assert(
      fc.property(
        fc
          .string({ unit: 'grapheme', maxLength: 20 })
          .filter((text) => Buffer.byteLength(text) <= 253),
        fc.integer({ min: 0, max: 99_999_999 }),
        fc.integer({ min: 0, max: 99 }),
        (text, whole, fraction) => {
          const original = {
            ...input,
            sellerName: `ش${text}`,
            invoiceTotal: `${whole}.${String(fraction).padStart(2, '0')}`,
          };
          const bytes = encodeQrTlv(original);
          const result = decodeQrBase64(encodeQrBase64(original));
          expect(result.fields).toEqual(original);
          expect(result.valid).toBe(true);
          expect(encodeQrTlv(result.fields as QrPhase1Input)).toEqual(bytes);
          expect(bytes[1]).toBe(Buffer.byteLength(original.sellerName));
        },
      ),
      { seed: 20261103, numRuns: 300 },
    );
  });

  it('bounds parsing and returns diagnostics for arbitrary bytes and Base64 mutations', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (bytes) => {
        const result = decodeQrTlv(bytes);
        expect(
          result.tags.reduce((sum, { value }) => sum + 2 + value.length, 0),
        ).toBeLessThanOrEqual(bytes.length);
        expect(result.valid).toBe(result.errors.length === 0);
        expect(decodeQrBase64(Buffer.from(bytes).toString('base64'))).toEqual(
          result,
        );
      }),
      { seed: 20261104, numRuns: 500 },
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: validBytes.length - 1 }),
        (length) => {
          expect(decodeQrTlv(validBytes.subarray(0, length)).valid).toBe(false);
        },
      ),
      { seed: 20261105, numRuns: 100 },
    );
  });
});
