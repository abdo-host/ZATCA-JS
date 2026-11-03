import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  ZatcaEncodingError,
  ZatcaValidationError,
} from '../../src/qr/index.js';
import {
  qrToDataUrl,
  qrToPngBytes,
  qrToSvg,
  type QrDataUrlOptions,
} from '../../src/render/index.js';
import fixture from '../fixtures/phase1-golden.json' with { type: 'json' };

const payload = fixture.arabic.base64;
const jsQR: typeof import('jsqr').default = createRequire(import.meta.url)(
  'jsqr',
);

function scan(png: Uint8Array, width: number) {
  const image = PNG.sync.read(Buffer.from(png));
  expect([image.width, image.height]).toEqual([width, width]);
  const result = jsQR(
    new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  expect(result?.data).toBe(payload);
  return image;
}

describe('QR rendering', () => {
  it('renders scan-readable PNG bytes and a PNG data URL', async () => {
    const options = {
      width: 320,
      errorCorrectionLevel: 'H',
      color: { dark: '#123456', light: '#ffffff' },
    } as const;
    const png = await qrToPngBytes(payload, options);
    expect(png).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(png)).toBe(false);
    const image = scan(png, 320);
    expect([...image.data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    const url = await qrToDataUrl(payload, options);
    expect(url).toBe(
      `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
    );
  });

  it('renders scan-readable SVG and a matching SVG data URL', async () => {
    const options = { width: 360, margin: 4 } as const;
    const svg = await qrToSvg(payload, options);
    expect(svg).toContain('width="360" height="360"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    const png = new Resvg(svg).render().asPng();
    scan(png, 360);
    expect(await qrToDataUrl(payload, { ...options, format: 'svg' })).toBe(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    );
  });

  it('applies scale and quiet-zone options when width is omitted', async () => {
    const size = async (scale: number, margin: number) =>
      PNG.sync.read(Buffer.from(await qrToPngBytes(payload, { scale, margin })))
        .width;
    expect(await size(8, 4)).toBe((await size(4, 4)) * 2);
    expect(await size(4, 6)).toBe((await size(4, 4)) + 16);
  });

  it.each([
    { format: 'jpeg' },
    { width: 2049 },
    { width: 21 },
    { width: 256.5 },
    { margin: -1 },
    { margin: 2.5 },
    { margin: 33 },
    { scale: Infinity },
    { scale: 0 },
    { scale: 32, margin: 32 },
    { errorCorrectionLevel: 'low' },
    { color: { dark: '#nope' } },
    { color: null },
    null,
  ])('rejects invalid image options %j', async (options) => {
    await expect(
      qrToDataUrl(payload, options as QrDataUrlOptions),
    ).rejects.toMatchObject({
      name: 'ZatcaValidationError',
      issues: [{ code: 'ZATCA_QR_RENDER_OPTION' }],
    });
  });

  it.each(['<span>invalid</span>', 'YQ==', 'A'.repeat(704)])(
    'rejects non-Phase-1 payload %j',
    async (invalid) => {
      await expect(qrToPngBytes(invalid)).rejects.toBeInstanceOf(
        ZatcaValidationError,
      );
      await expect(qrToSvg(invalid)).rejects.toBeInstanceOf(
        ZatcaValidationError,
      );
    },
  );

  it('rejects a symbol that cannot fit an explicitly chosen legacy version', async () => {
    const { GenerateQrCode } = await import(
      '../../src/legacy/GenerateQrCode.js'
    );
    const { sellerName, vatNumber, issuedAt, invoiceTotal, vatTotal } =
      fixture.arabic.input;
    const qr = new GenerateQrCode(
      sellerName,
      vatNumber,
      issuedAt,
      invoiceTotal,
      vatTotal,
    );
    await expect(qr.render({ version: 1 })).rejects.toBeInstanceOf(
      ZatcaEncodingError,
    );
    await expect(
      qr.render({ rendererOpts: { deflateLevel: 10 } }),
    ).rejects.toBeInstanceOf(ZatcaValidationError);
  });
});
