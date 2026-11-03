import QRCode from 'qrcode';
import { ZatcaEncodingError, ZatcaValidationError } from '../core/errors.js';
import { validateQrPayload } from '../qr/phase1.js';

/** Geometry is expressed in pixels (width) or modules (scale and margin). */
export interface QrRenderOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  scale?: number;
  width?: number;
  color?: { dark?: string; light?: string };
}

export interface QrDataUrlOptions extends QrRenderOptions {
  format?: 'png' | 'svg';
}

/** Options supported by the deprecated Node image adapter. */
export interface LegacyRenderOptions
  extends Omit<QrRenderOptions, 'errorCorrectionLevel'> {
  version?: number;
  errorCorrectionLevel?:
    | QrRenderOptions['errorCorrectionLevel']
    | 'low'
    | 'medium'
    | 'quartile'
    | 'high';
  maskPattern?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  toSJISFunc?: (codePoint: string) => number;
  type?: 'png' | 'image/png' | 'image/jpeg' | 'image/webp';
  rendererOpts?: {
    quality?: number;
    deflateLevel?: number;
    deflateStrategy?: number;
  };
  quality?: number;
}

const maxWidth = 2048;
const colorHex = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

interface PreparedRenderOptions {
  errorCorrectionLevel: NonNullable<QrRenderOptions['errorCorrectionLevel']>;
  version?: number;
  maskPattern?: NonNullable<LegacyRenderOptions['maskPattern']>;
  toSJISFunc?: NonNullable<LegacyRenderOptions['toSJISFunc']>;
  margin: number;
  width: number;
  color: { dark: string; light: string };
}

export function invalidOption(field: string, message: string): never {
  throw new ZatcaValidationError('Invalid QR render options', [
    {
      code: 'ZATCA_QR_RENDER_OPTION',
      severity: 'error',
      path: field ? `/render/${field}` : '/render',
      message,
    },
  ]);
}

export function renderFailure(cause: unknown): ZatcaEncodingError {
  return new ZatcaEncodingError(
    'Could not render the QR image',
    'ZATCA_QR_RENDER_FAILED',
    { cause },
  );
}

function integer(
  value: unknown,
  min: number,
  max: number,
  field: string,
): void {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    invalidOption(field, `Expected an integer between ${min} and ${max}`);
  }
}

export function checkOptionsObject(options: unknown): void {
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    invalidOption('', 'Expected a render options object');
  }
}

export function prepareRender(
  payload: string,
  options: QrRenderOptions,
  legacy?: LegacyRenderOptions,
): PreparedRenderOptions {
  checkOptionsObject(options);
  const validated = validateQrPayload(payload);
  if (typeof payload !== 'string' || !validated.valid) {
    throw new ZatcaValidationError(
      'Expected a valid Phase 1 Base64 QR payload',
      validated.valid
        ? [
            {
              code: 'ZATCA_QR_INPUT_TYPE',
              severity: 'error',
              path: '/qr',
              message: 'Expected a Base64 string',
            },
          ]
        : validated.errors,
    );
  }

  const {
    margin = 4,
    scale = 4,
    width,
    errorCorrectionLevel = 'M',
    color = {},
  } = options;
  if (!(legacy && margin === 2.5)) integer(margin, 0, 32, 'margin');
  integer(scale, 1, 32, 'scale');
  if (width !== undefined) integer(width, 21, maxWidth, 'width');
  if (!['L', 'M', 'Q', 'H'].includes(errorCorrectionLevel)) {
    invalidOption('errorCorrectionLevel', 'Expected L, M, Q or H');
  }
  if (color === null || typeof color !== 'object' || Array.isArray(color)) {
    invalidOption('color', 'Expected a color options object');
  }
  const { dark = '#000000', light = '#ffffff' } = color;
  for (const [name, value] of [
    ['dark', dark],
    ['light', light],
  ] as const) {
    if (typeof value !== 'string' || !colorHex.test(value))
      invalidOption(`color/${name}`, 'Expected an RGB or RGBA hex color');
  }

  const symbolOptions: Pick<
    PreparedRenderOptions,
    'errorCorrectionLevel' | 'version' | 'maskPattern' | 'toSJISFunc'
  > = { errorCorrectionLevel };
  if (legacy?.version !== undefined) {
    integer(legacy.version, 1, 40, 'version');
    symbolOptions.version = legacy.version;
  }
  if (legacy?.maskPattern !== undefined) {
    integer(legacy.maskPattern, 0, 7, 'maskPattern');
    symbolOptions.maskPattern = legacy.maskPattern;
  }
  if (legacy?.toSJISFunc !== undefined) {
    if (typeof legacy.toSJISFunc !== 'function')
      invalidOption('toSJISFunc', 'Expected a function');
    symbolOptions.toSJISFunc = legacy.toSJISFunc;
  }

  let modules: number;
  try {
    modules = QRCode.create(payload, symbolOptions).modules.size;
  } catch (cause) {
    throw renderFailure(cause);
  }
  const minimum = modules + 2 * margin;
  const pixels = width ?? minimum * scale;
  if (pixels < minimum || pixels > maxWidth) {
    invalidOption(
      width === undefined ? 'scale' : 'width',
      `Expected an image between ${minimum} and ${maxWidth} pixels per side`,
    );
  }
  return { ...symbolOptions, margin, width: pixels, color: { dark, light } };
}

export function legacyCompression(
  options: LegacyRenderOptions['rendererOpts'],
) {
  if (options === undefined) return {};
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    invalidOption('rendererOpts', 'Expected a compression options object');
  }
  const { deflateLevel, deflateStrategy } = options;
  if (deflateLevel !== undefined)
    integer(deflateLevel, -1, 9, 'rendererOpts/deflateLevel');
  if (deflateStrategy !== undefined)
    integer(deflateStrategy, 0, 4, 'rendererOpts/deflateStrategy');
  return { deflateLevel, deflateStrategy };
}
