import type { ZatcaIssue } from '../core/errors.js';

/** Invoice values for the five Phase 1 QR tags. Amounts are decimal strings. */
export interface QrPhase1Input {
  sellerName: string;
  vatNumber: string;
  issuedAt: string;
  invoiceTotal: string;
  vatTotal: string;
}

export const phase1Fields = [
  'sellerName',
  'vatNumber',
  'issuedAt',
  'invoiceTotal',
  'vatTotal',
] as const;
export const maxFieldBytes = 255;
type Field = (typeof phase1Fields)[number];

const dateTime =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const amount = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function issue(
  code: string,
  message: string,
  path?: string,
): ZatcaIssue {
  return {
    code,
    message,
    severity: 'error',
    ...(path === undefined ? {} : { path }),
  };
}

function isValidTimestamp(value: string): boolean {
  if (!dateTime.test(value)) return false;
  const date = value.slice(0, 10);
  const midnight = new Date(`${date}T00:00:00Z`);
  return (
    Number.isFinite(midnight.getTime()) &&
    midnight.toISOString().slice(0, 10) === date
  );
}

export function checkField(
  field: Field,
  value: unknown,
): ZatcaIssue | undefined {
  const path = `/qr/${field}`;
  if (typeof value !== 'string')
    return issue('ZATCA_QR_FIELD_TYPE', 'Expected a string', path);
  if (value.length > maxFieldBytes) return fieldTooLong(field);
  switch (field) {
    case 'sellerName':
      if (!value.trim() || /[\uD800-\uDFFF]/u.test(value)) {
        return issue(
          'ZATCA_QR_INVALID_SELLER',
          'Expected a nonblank seller name with well-formed Unicode',
          path,
        );
      }
      break;
    case 'vatNumber':
      if (!/^3[0-9]{13}3$/.test(value)) {
        return {
          ...issue(
            'ZATCA_QR_INVALID_VAT',
            'Expected 15 ASCII digits starting and ending with 3',
            path,
          ),
          specReference: 'BR-KSA-40',
        };
      }
      break;
    case 'issuedAt':
      if (!isValidTimestamp(value))
        return issue(
          'ZATCA_QR_INVALID_TIMESTAMP',
          'Expected a real ISO 8601 date and time with a timezone',
          path,
        );
      break;
    case 'invoiceTotal':
    case 'vatTotal':
      if (!amount.test(value))
        return issue(
          'ZATCA_QR_INVALID_AMOUNT',
          'Expected a nonnegative decimal without redundant leading zeros',
          path,
        );
      break;
  }
  return undefined;
}

export function fieldTooLong(field: Field): ZatcaIssue {
  return {
    ...issue(
      'ZATCA_QR_FIELD_TOO_LONG',
      'A TLV value can occupy at most 255 UTF-8 bytes',
      `/qr/${field}`,
    ),
    specReference: 'Security Standard §4.1',
  };
}
