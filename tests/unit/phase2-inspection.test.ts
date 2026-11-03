import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { decodeQrTlv, inspectPhase2Qr } from '../../src/qr/index.js';
import phase1 from '../fixtures/phase1-golden.json' with { type: 'json' };
import phase2 from '../fixtures/phase2-guide-tags.json' with { type: 'json' };

const textTags = Buffer.from(phase1.arabic.hex, 'hex');
const fields = new Map(
  phase2.map(({ tag, hex }) => [tag, Buffer.from(hex, 'hex')]),
);

function record(tag: number, value: Uint8Array): Buffer {
  return Buffer.concat([Buffer.of(tag, value.length), value]);
}

function payload(
  type: 'standard' | 'simplified',
  replacements = new Map<number, Buffer>(),
): Buffer {
  const tags = type === 'standard' ? [6, 7, 8] : [6, 7, 8, 9];
  return Buffer.concat([
    textTags,
    ...tags.map((tag) =>
      record(tag, replacements.get(tag) ?? officialTag(tag)),
    ),
  ]);
}

function officialTag(tag: number): Buffer {
  const value = fields.get(tag);
  if (!value) throw new Error('Missing tag in test fixture');
  return value;
}

describe('experimental Phase 2 inspection', () => {
  it('preserves the published wire values and decodes text fields', () => {
    const bytes = payload('simplified');
    const result = inspectPhase2Qr(bytes.toString('base64'), 'simplified');
    expect(result).toMatchObject({
      structureValid: true,
      cryptographicVerification: 'not-performed',
      fields: phase1.arabic.input,
      errors: [],
      warnings: [
        { code: 'ZATCA_QR_PHASE2_WIRE_VARIANT', path: '/qr/phase2/tag6' },
      ],
      binaryTags: [
        { tag: 6, byteLength: 44, encoding: 'sha256-base64-text' },
        { tag: 7, byteLength: 96, encoding: 'ecdsa-der-base64-text' },
        { tag: 8, byteLength: 88, encoding: 'secp256k1-spki-der' },
        { tag: 9, byteLength: 72, encoding: 'ecdsa-der' },
      ],
    });
    expect(
      result.binaryTags.map(({ tag, valueBase64 }) => ({
        tag,
        hex: Buffer.from(valueBase64, 'base64').toString('hex'),
      })),
    ).toEqual(phase2);
    expect(decodeQrTlv(bytes).valid).toBe(false);
  });

  it('recognizes the specified 32-byte hash and flags a raw signature wire variant', () => {
    const rawHash = Buffer.from(officialTag(6).toString('ascii'), 'base64');
    const rawSignature = Buffer.from(
      officialTag(7).toString('ascii'),
      'base64',
    );
    const bytes = payload(
      'simplified',
      new Map([
        [6, rawHash],
        [7, rawSignature],
      ]),
    );
    const result = inspectPhase2Qr(bytes, 'simplified');
    expect(result.structureValid).toBe(true);
    expect(result.binaryTags.slice(0, 2)).toMatchObject([
      { tag: 6, byteLength: 32, encoding: 'sha256-raw' },
      { tag: 7, byteLength: 71, encoding: 'ecdsa-der' },
    ]);
    expect(result.warnings).toMatchObject([{ path: '/qr/phase2/tag7' }]);
  });

  it('enforces tag 9 by profile', () => {
    expect(
      inspectPhase2Qr(payload('standard'), 'standard').structureValid,
    ).toBe(true);
    expect(
      inspectPhase2Qr(payload('standard'), 'simplified').errors,
    ).toMatchObject([
      { code: 'ZATCA_QR_MISSING_TAG', path: '/qr/phase2/tag9' },
    ]);
    expect(
      inspectPhase2Qr(payload('simplified'), 'standard').errors,
    ).toMatchObject([
      { code: 'ZATCA_QR_PHASE2_UNEXPECTED_TAG', path: '/qr/phase2/tag9' },
    ]);
  });

  it.each([
    [6, Buffer.alloc(31)],
    [6, Buffer.alloc(33)],
    [6, Buffer.alloc(44, 0xff)],
    [7, Buffer.from([0x30, 6, 2, 1, 0, 2, 1, 1])],
    [7, Buffer.from([0x30, 6, 2, 1, 0xff, 2, 1, 1])],
    [8, Buffer.alloc(88)],
    [8, Buffer.alloc(89)],
    [9, Buffer.from([0x30, 7, 2, 2, 0, 1, 2, 1, 1])],
    [9, Buffer.from(officialTag(9).toString('base64'), 'ascii')],
  ] as const)('rejects unknown wire encoding for tag %i', (tag, value) => {
    const result = inspectPhase2Qr(
      payload('simplified', new Map([[tag, value]])),
      'simplified',
    );
    expect(result.structureValid).toBe(false);
    expect(result.errors).toMatchObject([
      { code: 'ZATCA_QR_PHASE2_ENCODING', path: `/qr/phase2/tag${tag}` },
    ]);
  });

  it('rejects duplicate, reordered and unsupported tags', () => {
    const body = payload('simplified');
    const reordered = Buffer.concat([
      textTags,
      record(7, officialTag(7)),
      record(6, officialTag(6)),
      record(8, officialTag(8)),
      record(9, officialTag(9)),
    ]);
    for (const [bytes, code] of [
      [
        Buffer.concat([body, record(6, officialTag(6))]),
        'ZATCA_QR_DUPLICATE_TAG',
      ],
      [reordered, 'ZATCA_QR_TAG_ORDER'],
      [Buffer.concat([body, record(10, Buffer.of(1))]), 'ZATCA_QR_UNKNOWN_TAG'],
    ] as const) {
      expect(inspectPhase2Qr(bytes, 'simplified').errors).toMatchObject([
        { code },
      ]);
    }
  });

  it('rejects oversized and truncated payloads without reading out of bounds', () => {
    expect(inspectPhase2Qr('A'.repeat(704), 'simplified').errors).toMatchObject(
      [{ code: 'ZATCA_QR_PAYLOAD_TOO_LONG' }],
    );
    expect(
      inspectPhase2Qr(payload('simplified').subarray(0, -1), 'simplified')
        .errors,
    ).toMatchObject([
      { code: 'ZATCA_QR_TRUNCATED_TLV' },
      { code: 'ZATCA_QR_MISSING_TAG' },
    ]);
  });
});
