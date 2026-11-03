import { X509Certificate } from 'node:crypto';
import { decodeBase64 } from '../core/base64.js';
import { isInvoiceDigest } from '../core/invoice-digest.js';
import { parseInvoiceXml } from '../xml/parse.js';
import { record, ZatcaApiError } from './transport.js';

export type ApiEnvironment = 'sandbox' | 'production';
export type CsidKind = 'compliance' | 'production';

export interface Csid<Kind extends CsidKind = CsidKind> {
  readonly environment: ApiEnvironment;
  readonly kind: Kind;
  readonly requestId: string;
  readonly binarySecurityToken: string;
  readonly secret: string;
}

export type InvoiceDocumentState =
  | 'drafted'
  | 'locally-validated'
  | 'signed'
  | 'submitted'
  | 'reported'
  | 'cleared'
  | 'rejected'
  | 'failed';

export interface InvoiceSubmission {
  readonly xml: string;
  readonly invoiceHash: string;
}

export interface Diagnostic {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code?: string;
  readonly category?: string;
  readonly message?: string;
}

export function decodePayload(value: unknown, maxLength: number): Uint8Array {
  if (typeof value !== 'string' || !value || value.length > maxLength)
    throw new Error('Invalid Base64 payload');
  return decodeBase64(value);
}

export function invoicePayload(
  input: InvoiceSubmission,
  profile?: 'standard' | 'simplified',
) {
  const { xml, invoiceHash } = input;
  if (!isInvoiceDigest(invoiceHash)) throw new ZatcaApiError('invalid-input');

  let invoice: ReturnType<typeof parseInvoiceXml>;
  try {
    invoice = parseInvoiceXml(xml);
  } catch {
    throw new ZatcaApiError('invalid-input');
  }
  const uuid = invoice.header.UUID;
  const subtype = invoice.invoiceSubtype;
  if (
    !uuid ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(uuid) ||
    !['388', '381', '383'].includes(invoice.header.InvoiceTypeCode ?? '') ||
    !subtype ||
    !/^0[12][01]{5}$/.test(subtype) ||
    (profile && !subtype.startsWith(profile === 'standard' ? '01' : '02')) ||
    (subtype.startsWith('02') && !invoice.hasXmlSignature)
  )
    throw new ZatcaApiError('invalid-input');

  return {
    uuid,
    invoiceHash,
    invoice: Buffer.from(xml, 'utf8').toString('base64'),
  };
}

export function parseCsid<Kind extends CsidKind>(
  value: unknown,
  environment: ApiEnvironment,
  kind: Kind,
): Csid<Kind> | undefined {
  const { requestID, binarySecurityToken, secret } = record(value);
  const requestId =
    typeof requestID === 'number' && Number.isSafeInteger(requestID)
      ? String(requestID)
      : requestID;
  if (
    typeof requestId !== 'string' ||
    !/^\d{1,32}$/.test(requestId) ||
    typeof binarySecurityToken !== 'string' ||
    !/^[a-zA-Z0-9+/=]{1,16384}$/.test(binarySecurityToken) ||
    typeof secret !== 'string' ||
    !/^[!-~]{1,1024}$/.test(secret)
  )
    return undefined;
  return Object.freeze({
    environment,
    kind,
    requestId,
    binarySecurityToken,
    secret,
  });
}

/** Derives the expiration date from certificate bytes carried by a CSID. */
export function getCsidExpiry(csid: Csid): Date {
  try {
    const outer = decodePayload(csid.binarySecurityToken, 16384);
    const text = Buffer.from(outer).toString('ascii').trim();
    const certificate =
      text.startsWith('-----BEGIN CERTIFICATE-----') || outer[0] === 0x30
        ? outer
        : decodePayload(text, 16384);
    const expires = new X509Certificate(certificate).validToDate;
    if (!Number.isFinite(expires.getTime())) throw new Error();
    return expires;
  } catch {
    throw new ZatcaApiError('invalid-input');
  }
}
