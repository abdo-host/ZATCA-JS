import QRCode from 'qrcode';
import { decodeBase64, encodeBase64 } from '../core/base64.js';
import { encodeUtf8 } from '../core/utf8.js';
import {
  checkOptionsObject,
  invalidOption,
  legacyCompression,
  type LegacyRenderOptions,
  prepareRender,
  type QrDataUrlOptions,
  type QrRenderOptions,
  renderFailure,
} from './options.js';

const pngPrefix = 'data:image/png;base64,';

async function pngDataUrl(
  payload: string,
  options: ReturnType<typeof prepareRender>,
  compression = {},
) {
  try {
    const pngOptions = {
      ...options,
      type: 'image/png' as const,
      rendererOpts: compression,
    };
    const url = await QRCode.toDataURL(payload, pngOptions);
    if (!url.startsWith(pngPrefix)) throw new Error('Expected a PNG data URL');
    return url;
  } catch (cause) {
    throw renderFailure(cause);
  }
}

/** Renders a validated Phase 1 payload as SVG text in Node or a browser bundle. */
export async function qrToSvg(
  payload: string,
  options: QrRenderOptions = {},
): Promise<string> {
  const prepared = prepareRender(payload, options);
  try {
    return await QRCode.toString(payload, { ...prepared, type: 'svg' });
  } catch (cause) {
    throw renderFailure(cause);
  }
}

/** Renders a PNG data URL by default, or an SVG data URL with format: 'svg'. */
export async function qrToDataUrl(
  payload: string,
  options: QrDataUrlOptions = {},
): Promise<string> {
  checkOptionsObject(options);
  const { format = 'png' } = options;
  if (format === 'svg') {
    const svg = await qrToSvg(payload, options);
    return `data:image/svg+xml;base64,${encodeBase64(encodeUtf8(svg))}`;
  }
  if (format !== 'png') invalidOption('format', 'Expected png or svg');
  return pngDataUrl(payload, prepareRender(payload, options));
}

/** Renders PNG bytes. Browser use requires DOM Canvas support. */
export async function qrToPngBytes(
  payload: string,
  options: QrRenderOptions = {},
): Promise<Uint8Array> {
  const url = await pngDataUrl(payload, prepareRender(payload, options));
  return decodeBase64(url.slice(pngPrefix.length));
}

const legacyLevels = {
  low: 'L',
  medium: 'M',
  quartile: 'Q',
  high: 'H',
} as const;

export function renderLegacyPng(
  payload: string,
  options: LegacyRenderOptions,
): Promise<string> {
  checkOptionsObject(options);
  const {
    errorCorrectionLevel = 'H',
    type = 'png',
    margin = 2.5,
    rendererOpts,
    ...geometry
  } = options;
  if (!['png', 'image/png', 'image/jpeg', 'image/webp'].includes(type)) {
    invalidOption('type', 'Expected a legacy PNG, JPEG or WebP option');
  }
  const level = Object.hasOwn(legacyLevels, errorCorrectionLevel)
    ? legacyLevels[errorCorrectionLevel as keyof typeof legacyLevels]
    : (errorCorrectionLevel as NonNullable<
        QrRenderOptions['errorCorrectionLevel']
      >);
  const prepared = prepareRender(
    payload,
    { ...geometry, margin, errorCorrectionLevel: level },
    options,
  );
  return pngDataUrl(payload, prepared, legacyCompression(rendererOpts));
}
