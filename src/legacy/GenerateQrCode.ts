import { Buffer } from 'node:buffer';
import { ZatcaValidationError } from '../core/errors.js';
import { encodeUtf8 } from '../core/utf8.js';
import {
  checkField,
  maxFieldBytes,
  type QrPhase1Input,
} from '../qr/phase1-fields.js';
import { encodeQrBase64, encodeQrTlv } from '../qr/phase1.js';
import type { LegacyRenderOptions } from '../render/options.js';
import { renderLegacyPng } from '../render/render.js';

export type { LegacyRenderOptions } from '../render/options.js';

/** Generates Phase 1 QR codes from the original positional arguments.
 * @deprecated Use `encodeQrBase64` from `zatca/qr` and `qrToDataUrl` from `zatca/qr/render`.
 */
export class GenerateQrCode {
  constructor(
    public company_name = '',
    public tax_id = '',
    public invoice_date = '',
    public grand_total: number | string = 0,
    public tax_total: number | string = 0,
  ) {}

  /** Returns the Phase 1 TLV bytes as a Node Buffer. */
  async getTLV(): Promise<Buffer> {
    return Buffer.from(encodeQrTlv(this.#input()));
  }

  /** Returns the Phase 1 QR payload as standard Base64. */
  async toBase64(): Promise<string> {
    return encodeQrBase64(this.#input());
  }

  /** Renders a PNG data URL with the legacy defaults. */
  async render(options: LegacyRenderOptions = {}): Promise<string> {
    return renderLegacyPng(await this.toBase64(), options);
  }

  /** @deprecated Use the Phase 1 encoder for invoice payloads. */
  getTLVForValue(tagNum: string | number, tagValue: string): Buffer {
    const tag = Number(tagNum);
    if (
      !Number.isInteger(tag) ||
      tag < 1 ||
      tag > 255 ||
      typeof tagValue !== 'string' ||
      tagValue.length > maxFieldBytes ||
      /[\uD800-\uDFFF]/u.test(tagValue)
    ) {
      throw new ZatcaValidationError('Invalid TLV tag or UTF-8 value');
    }
    const value = encodeUtf8(tagValue);
    if (value.length > maxFieldBytes)
      throw new ZatcaValidationError(
        'A TLV value can occupy at most 255 UTF-8 bytes',
      );
    return Buffer.concat([Buffer.from([tag, value.length]), value]);
  }

  /** @deprecated Encode an invoice directly to receive typed validation errors. */
  validateInvoiceData(): false {
    encodeQrTlv(this.#input());
    return false;
  }

  /** @deprecated Encode an invoice directly to validate its timestamp. */
  isValidISO8601Date(dateString: string): boolean {
    return checkField('issuedAt', dateString) === undefined;
  }

  #input(): QrPhase1Input {
    return {
      sellerName: this.company_name,
      vatNumber: this.tax_id,
      issuedAt: this.invoice_date,
      invoiceTotal:
        typeof this.grand_total === 'number'
          ? String(this.grand_total)
          : this.grand_total,
      vatTotal:
        typeof this.tax_total === 'number'
          ? String(this.tax_total)
          : this.tax_total,
    };
  }
}
