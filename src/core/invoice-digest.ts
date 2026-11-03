import { decodeBase64 } from './base64.js';
import { ZatcaEncodingError } from './errors.js';

export const initialPreviousInvoiceHash =
  'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export function isInvoiceDigest(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 44) return false;
  try {
    return decodeBase64(value).length === 32;
  } catch (error) {
    if (!(error instanceof ZatcaEncodingError)) throw error;
    return false;
  }
}
