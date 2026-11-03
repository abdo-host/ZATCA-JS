export { decodeBase64, encodeBase64 } from '../core/base64.js';
export {
  ZatcaEncodingError,
  ZatcaError,
  type ZatcaIssue,
  ZatcaValidationError,
} from '../core/errors.js';
export { decodeUtf8, encodeUtf8 } from '../core/utf8.js';
export type { QrPhase1Input } from './phase1-fields.js';
export {
  decodeQrBase64,
  decodeQrTlv,
  encodeQrBase64,
  encodeQrTlv,
  type QrDecodeOptions,
  type QrDecodeResult,
  type ValidationResult,
  validateQrPayload,
} from './phase1.js';
export {
  inspectPhase2Qr,
  type Phase2BinaryTag,
  type Phase2InvoiceType,
  type Phase2QrInspection,
} from './phase2-inspection.js';
