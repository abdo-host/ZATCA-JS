import { Buffer } from 'node:buffer';
import QRCode, { type QRCodeToDataURLOptions } from 'qrcode';

/** Options forwarded to the v1 Node renderer. */
export interface LegacyRenderOptions {
  version?: number;
  errorCorrectionLevel?:
    | 'low'
    | 'medium'
    | 'quartile'
    | 'high'
    | 'L'
    | 'M'
    | 'Q'
    | 'H';
  maskPattern?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  toSJISFunc?: (codePoint: string) => number;
  type?: 'png' | 'image/png' | 'image/jpeg' | 'image/webp';
  margin?: number;
  scale?: number;
  width?: number;
  color?: { dark?: string; light?: string };
  rendererOpts?: {
    quality?: number;
    deflateLevel?: number;
    deflateStrategy?: number;
  };
  quality?: number;
}

/** Generates a Node.js QR code using the v1 positional invoice fields. */
export class GenerateQrCode {
  constructor(
    public company_name = '',
    public tax_id = '',
    public invoice_date = '',
    public grand_total: number | string = 0,
    public tax_total: number | string = 0,
  ) {}

  /** Returns the legacy TLV bytes or a v1 validation message. */
  async getTLV(): Promise<Buffer | string> {
    return this.validateInvoiceData() || this.#buildTlv();
  }

  /** Returns the legacy Base64 payload or a v1 validation message. */
  async toBase64(): Promise<string> {
    return this.validateInvoiceData() || this.#buildTlv().toString('base64');
  }

  /** Renders a QR image as a Node.js data URL. */
  async render(options: LegacyRenderOptions = {}): Promise<string> {
    const defaults = {
      errorCorrectionLevel: 'H',
      type: 'image/jpeg',
      quality: 0.5,
      margin: 2.5,
      color: { dark: '#000000', light: '#ffffff' },
    } as const;
    const renderOptions = { ...defaults, ...options };
    // The Node renderer accepts these v1 MIME values and falls back to PNG.
    return QRCode.toDataURL(
      await this.toBase64(),
      renderOptions as QRCodeToDataURLOptions,
    );
  }

  /** Builds a single field using the original v1 TLV behavior. */
  getTLVForValue(tagNum: string | number, tagValue: string): Buffer {
    return Buffer.concat([
      Buffer.from([Number(tagNum), tagValue.length]),
      Buffer.from(tagValue, 'utf8'),
    ]);
  }

  /** Returns the first v1 validation message, or false for accepted input. */
  validateInvoiceData(): string | false {
    if (!this.company_name?.length) {
      return '<span style="color:#c00">Company name must be not null</span>';
    }
    if (!this.tax_id?.length) {
      return '<span style="color:#c00">Tax number name must be not null</span>';
    }
    if (this.tax_id.length < 15 || !/^3.*3$/.test(this.tax_id)) {
      return '<span style="color:#c00">The tax number must consist of 15 digits, where the first and last digits are [3]</span>';
    }
    if (!this.invoice_date?.length) {
      return '<span style="color:#c00">Invoice date must be not null</span>';
    }
    if (!this.isValidISO8601Date(this.invoice_date)) {
      return '<span style="color:#c00">Invoice date must be ISO8601 format <a href="https://codepen.io/Abdo-Host/pen/VwVXbVZ" target="_blank"><b>Example</b></a> </span>';
    }
    return false;
  }

  /** Checks the legacy millisecond UTC timestamp format. */
  isValidISO8601Date(dateString: string): boolean {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(dateString))
      return false;
    const date = new Date(dateString);
    return !Number.isNaN(date.getTime()) && date.toISOString() === dateString;
  }

  #buildTlv(): Buffer {
    return Buffer.concat([
      this.getTLVForValue('1', this.company_name),
      this.getTLVForValue('2', String(this.tax_id)),
      this.getTLVForValue('3', String(this.invoice_date)),
      this.getTLVForValue('4', String(this.grand_total)),
      this.getTLVForValue('5', String(this.tax_total)),
    ]);
  }
}
