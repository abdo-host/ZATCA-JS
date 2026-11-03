import { ZatcaValidationError } from '../core/errors.js';
import { encodeUtf8 } from '../core/utf8.js';

export const invoiceNamespace =
  'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
export const cbc =
  'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
export const cac =
  'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';

export function xmlError(code: string, message: string): never {
  throw new ZatcaValidationError('Invalid invoice XML', [
    { code, severity: 'error', path: '/xml', message },
  ]);
}

export function checkXmlSize(xml: string): void {
  if (typeof xml !== 'string')
    xmlError('ZATCA_XML_INPUT_TYPE', 'Expected XML text');
  const limit = 2 * 1024 * 1024;
  if (xml.length > limit || encodeUtf8(xml).length > limit) {
    xmlError('ZATCA_XML_SIZE', 'XML exceeds the 2 MiB UTF-8 limit');
  }
}
