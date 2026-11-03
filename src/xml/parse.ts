import { SaxesParser } from 'saxes';
import { type ZatcaIssue, ZatcaValidationError } from '../core/errors.js';
import {
  cac,
  cbc,
  checkXmlSize,
  invoiceNamespace,
  xmlError,
} from './structure.js';

const headerKeys = [
  'ProfileID',
  'ID',
  'UUID',
  'IssueDate',
  'IssueTime',
  'InvoiceTypeCode',
  'DocumentCurrencyCode',
  'TaxCurrencyCode',
] as const;
const totalKeys = [
  'LineExtensionAmount',
  'TaxExclusiveAmount',
  'TaxInclusiveAmount',
  'PayableAmount',
] as const;
type HeaderKey = (typeof headerKeys)[number];
type TotalKey = (typeof totalKeys)[number];

export interface ParsedInvoice {
  readonly header: Readonly<Partial<Record<HeaderKey, string>>>;
  readonly totals: Readonly<Partial<Record<TotalKey, string>>>;
  readonly invoiceSubtype?: string;
  readonly lineCount: number;
  readonly hasXmlSignature: boolean;
}

function contains<const T extends readonly string[]>(
  keys: T,
  value: string,
): value is T[number] {
  return keys.some((key) => key === value);
}

/** Extracts metadata without resolving entities or processing external resources. */
export function parseInvoiceXml(xml: string): ParsedInvoice {
  checkXmlSize(xml);
  const parser = new SaxesParser({ xmlns: true });
  const header: Partial<Record<HeaderKey, string>> = {};
  const totals: Partial<Record<TotalKey, string>> = {};
  let depth = 0;
  let elements = 0;
  let lineCount = 0;
  let monetaryDepth = 0;
  let sawMonetaryTotal = false;
  let hasXmlSignature = false;
  let invoiceSubtype: string | undefined;
  let capture:
    | { depth: number; value: string; write: (value: string) => void }
    | undefined;

  parser.on('doctype', () =>
    xmlError('ZATCA_XML_DTD', 'DOCTYPE and entity declarations are prohibited'),
  );
  parser.on('error', () => xmlError('ZATCA_XML_MALFORMED', 'Malformed XML'));
  parser.on('opentag', (tag) => {
    depth++;
    elements++;
    if (depth > 64 || elements > 50_000)
      xmlError('ZATCA_XML_COMPLEXITY', 'XML exceeds element or nesting limits');
    if (capture)
      xmlError('ZATCA_XML_STRUCTURE', 'Expected a simple text element');
    if (
      depth === 1 &&
      (tag.uri !== invoiceNamespace || tag.local !== 'Invoice')
    ) {
      xmlError('ZATCA_XML_ROOT', 'Expected a UBL Invoice root');
    }

    const { local } = tag;
    if (depth === 2 && tag.uri === cac) {
      if (local === 'InvoiceLine') lineCount++;
      if (local === 'LegalMonetaryTotal') {
        if (sawMonetaryTotal)
          xmlError('ZATCA_XML_DUPLICATE', 'Duplicate legal monetary total');
        sawMonetaryTotal = true;
        monetaryDepth = depth;
      }
    }
    if (
      tag.uri === 'http://www.w3.org/2000/09/xmldsig#' &&
      local === 'Signature'
    )
      hasXmlSignature = true;
    if (tag.uri !== cbc) return;
    if (depth === 2 && contains(headerKeys, local)) {
      if (header[local] !== undefined)
        xmlError('ZATCA_XML_DUPLICATE', 'Duplicate invoice header field');
      capture = {
        depth,
        value: '',
        write: (value) => {
          header[local] = value;
        },
      };
      if (local === 'InvoiceTypeCode') {
        invoiceSubtype = Object.values(tag.attributes).find(
          ({ local, uri }) => local === 'name' && uri === '',
        )?.value;
      }
    } else if (
      monetaryDepth &&
      depth === monetaryDepth + 1 &&
      contains(totalKeys, local)
    ) {
      if (totals[local] !== undefined)
        xmlError('ZATCA_XML_DUPLICATE', 'Duplicate invoice total');
      capture = {
        depth,
        value: '',
        write: (value) => {
          totals[local] = value;
        },
      };
    }
  });
  function append(value: string) {
    if (capture) capture.value += value;
  }
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', () => {
    if (capture?.depth === depth) {
      capture.write(capture.value);
      capture = undefined;
    }
    if (monetaryDepth === depth) monetaryDepth = 0;
    depth--;
  });
  parser.write(xml).close();
  return Object.freeze({
    header: Object.freeze(header),
    totals: Object.freeze(totals),
    ...(invoiceSubtype === undefined ? {} : { invoiceSubtype }),
    lineCount,
    hasXmlSignature,
  });
}

/** Checks the draft envelope and reports structural issues for local inspection. */
export function validateInvoiceXml(xml: string): {
  readonly structureValid: boolean;
  readonly errors: readonly ZatcaIssue[];
} {
  let parsed: ParsedInvoice;
  try {
    parsed = parseInvoiceXml(xml);
  } catch (error) {
    if (!(error instanceof ZatcaValidationError)) throw error;
    return { structureValid: false, errors: error.issues };
  }
  const errors: ZatcaIssue[] = [];
  for (const key of headerKeys) {
    if (!parsed.header[key]?.trim())
      errors.push({
        code: 'ZATCA_XML_REQUIRED_HEADER',
        severity: 'error',
        path: `/xml/${key}`,
        message: 'Missing invoice header value',
      });
  }
  for (const key of totalKeys) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(parsed.totals[key] ?? ''))
      errors.push({
        code: 'ZATCA_XML_REQUIRED_TOTAL',
        severity: 'error',
        path: `/xml/LegalMonetaryTotal/${key}`,
        message: 'Expected a nonnegative monetary total',
      });
  }
  if (parsed.lineCount === 0)
    errors.push({
      code: 'ZATCA_XML_REQUIRED_LINE',
      severity: 'error',
      path: '/xml/InvoiceLine',
      message: 'At least one invoice line is required',
    });
  return { structureValid: errors.length === 0, errors };
}
