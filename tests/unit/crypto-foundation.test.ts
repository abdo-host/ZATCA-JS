import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { checkCertificateLocally } from '../../src/crypto/certificate.js';
import {
  filterInvoiceHashXml,
  hashInvoiceXml,
} from '../../src/crypto/invoice-hash.js';

const ubl = 'urn:oasis:names:specification:ubl:schema:xsd:';
const namespaces = [
  `xmlns:x="urn:other"`,
  `xmlns:e="${ubl}CommonExtensionComponents-2"`,
  `xmlns:b="${ubl}CommonBasicComponents-2"`,
  `xmlns:a="${ubl}CommonAggregateComponents-2"`,
  `xmlns="${ubl}Invoice-2"`,
].join(' ');
const body = [
  '<e:UBLExtensions><x:Signature/></e:UBLExtensions>',
  '<b:ID z="2" a="1">فاتورة &amp; A\r\nB</b:ID>',
  '<a:AdditionalDocumentReference><b:ID>Q<![CDATA[R]]></b:ID><x:Payload/></a:AdditionalDocumentReference>',
  '<a:AdditionalDocumentReference><b:ID>ICV</b:ID><b:UUID>1</b:UUID></a:AdditionalDocumentReference>',
  '<a:Signature/>',
  '<x:Signature/>',
  '<b:Note>]]<!-- split -->></b:Note>',
].join('');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\r\n<!--prolog--><?before sample?><Invoice ${namespaces}>${body}</Invoice><?after sample?>`;

it('filters by namespace and XPath string value while preserving signed source bytes', () => {
  const filtered = filterInvoiceHashXml(xml);
  expect(filtered).not.toMatch(/<e:UBLExtensions|Payload|<a:Signature|<!--/);
  expect(filtered).toContain('<x:Signature/>');
  expect(filtered).toContain('<b:ID>ICV</b:ID>');
  expect(filtered).toContain('فاتورة &amp; A\r\nB');
  expect(filtered).toContain('<?before sample?>');
  expect(filtered).toContain(']]<![CDATA[]]>>');
  expect(
    filterInvoiceHashXml(
      xml.replace('<b:ID>Q<![CDATA[R]]></b:ID>', '<b:ID> QR </b:ID>'),
    ),
  ).toContain('<x:Payload/>');
});

it('rejects DTDs, invalid encoding, malformed XML and nonabsolute tooling paths', () => {
  expect(() =>
    filterInvoiceHashXml(`<!DOCTYPE Invoice SYSTEM "file:///private">${xml}`),
  ).toThrow('Invalid invoice XML');
  expect(() => filterInvoiceHashXml(xml.replace('UTF-8', 'UTF-16'))).toThrow(
    'Invalid invoice XML',
  );
  expect(() =>
    filterInvoiceHashXml(xml.replace('</Invoice>', '</Bad>')),
  ).toThrow('Invalid invoice XML');
  expect(() => hashInvoiceXml(xml, 'xmllint')).toThrow('absolute path');
  expect(() => hashInvoiceXml(xml, resolve('unavailable-xmllint'))).toThrow(
    'Invoice XML canonicalization failed',
  );
});

const xmllint = process.env.ZATCA_TEST_XMLLINT;
it.skipIf(!xmllint)(
  'matches a fixed UTF-8 C14N digest and detects hashed content changes',
  () => {
    if (!xmllint) throw new Error('Expected a configured canonicalizer');
    const expected = 'CmnnoLNA+vTDmaS6EoOY6BcT2YhyfpEgglYFfTdKebM=';
    expect(hashInvoiceXml(xml, xmllint)).toBe(expected);
    expect(
      hashInvoiceXml(
        xml.replace('A\r\nB', 'A\nB').replace('Payload', 'Changed'),
        xmllint,
      ),
    ).toBe(expected);
    expect(hashInvoiceXml(xml.replace('فاتورة', 'إشعار'), xmllint)).not.toBe(
      expected,
    );
    expect(
      hashInvoiceXml(xml.replace('<b:UUID>1', '<b:UUID>2'), xmllint),
    ).not.toBe(expected);
  },
);

it('checks local certificate dates and public-key binding without exposing input', () => {
  const pem = readFileSync(
    new URL('../fixtures/synthetic-leaf.pem', import.meta.url),
  );
  const certificate = new X509Certificate(pem);
  const { publicKey } = certificate;
  const other = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  }).publicKey;
  const validTime = new Date('2026-01-01T00:00:00Z');
  expect(checkCertificateLocally(pem, publicKey, validTime)).toBe(
    'local-checks-passed',
  );
  expect(checkCertificateLocally(certificate.raw, other, validTime)).toBe(
    'key-mismatch',
  );
  expect(
    checkCertificateLocally(pem, publicKey, new Date('2024-12-31T23:59:59Z')),
  ).toBe('not-yet-valid');
  expect(
    checkCertificateLocally(pem, publicKey, new Date('2030-01-01T00:00:01Z')),
  ).toBe('expired');
  expect(
    checkCertificateLocally('synthetic-invalid-data', publicKey, validTime),
  ).toBe('malformed');
});
