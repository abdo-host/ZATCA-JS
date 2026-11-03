import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute } from 'node:path';
import { SaxesParser } from 'saxes';
import { parseInvoiceXml } from '../xml/parse.js';
import { cac, cbc, xmlError } from '../xml/structure.js';

const ext =
  'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

interface Range {
  readonly start: number;
  readonly end: number;
  readonly inRoot: boolean;
}

interface Element {
  readonly start: number;
  readonly reference: boolean;
  readonly referenceId: boolean;
  exclude: boolean;
  text: string;
}

/** Applies the Security Standard invoice reference filters by expanded name. */
export function filterInvoiceHashXml(xml: string): string {
  parseInvoiceXml(xml);
  const parser = new SaxesParser({ xmlns: true });
  const elements: Element[] = [];
  const removed: Range[] = [];
  let start = 0;

  parser.on('error', () => xmlError('ZATCA_XML_MALFORMED', 'Malformed XML'));
  parser.on('xmldecl', ({ version, encoding }) => {
    if (version !== '1.0' || (encoding && encoding.toUpperCase() !== 'UTF-8'))
      xmlError('ZATCA_XML_ENCODING', 'Expected XML 1.0 encoded as UTF-8');
  });
  parser.on('opentagstart', () => {
    start = xml.lastIndexOf('<', parser.position - 1);
  });
  parser.on('opentag', ({ uri, local }) => {
    const parent = elements.at(-1);
    const reference = uri === cac && local === 'AdditionalDocumentReference';
    elements.push({
      start,
      reference,
      referenceId: parent?.reference === true && uri === cbc && local === 'ID',
      exclude:
        (uri === ext && local === 'UBLExtensions') ||
        (uri === cac && local === 'Signature'),
      text: '',
    });
  });

  function collectText(text: string) {
    for (const element of elements) {
      if (element.referenceId) element.text += text;
    }
  }

  parser.on('text', collectText);
  parser.on('cdata', collectText);
  parser.on('closetag', () => {
    const element = elements.pop();
    if (!element) return;
    const parent = elements.at(-1);
    if (parent && element.referenceId && element.text === 'QR')
      parent.exclude = true;
    if (element.exclude)
      removed.push({
        start: element.start,
        end: parser.position,
        inRoot: true,
      });
  });
  parser.on('comment', () => {
    removed.push({
      start: xml.lastIndexOf('<!--', parser.position - 1),
      // Saxes emits comment before consuming the final '>'.
      end: parser.position + 1,
      inRoot: elements.length > 0,
    });
  });
  parser.write(xml).close();

  // Preserve all surviving source bytes, including namespace declarations.
  // Empty CDATA keeps adjacent text from becoming a new lexical token.
  removed.sort((left, right) => left.start - right.start);
  const fragments: string[] = [];
  let end = 0;
  for (const range of removed) {
    if (range.start < end) continue;
    fragments.push(xml.slice(end, range.start));
    if (range.inRoot) fragments.push('<![CDATA[]]>');
    end = range.end;
  }
  fragments.push(xml.slice(end));
  return fragments.join('');
}

/** Uses a trusted, host-installed libxml2 xmllint with C14N 1.1 enabled. */
export function hashInvoiceXml(xml: string, xmllint: string): string {
  if (!isAbsolute(xmllint))
    throw new Error(
      'Expected an absolute path to the trusted XML canonicalizer',
    );
  const filtered = filterInvoiceHashXml(xml);
  const result = spawnSync(
    xmllint,
    ['--nonet', '--nocatalogs', '--c14n11', '-'],
    {
      input: Buffer.from(filtered, 'utf8'),
      cwd: dirname(xmllint),
      env: { SystemRoot: process.env.SystemRoot },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5_000,
      windowsHide: true,
    },
  );
  if (
    result.error ||
    result.status !== 0 ||
    !result.stdout?.length ||
    result.stderr?.length
  )
    throw new Error('Invoice XML canonicalization failed');

  return createHash('sha256').update(result.stdout).digest('base64');
}
