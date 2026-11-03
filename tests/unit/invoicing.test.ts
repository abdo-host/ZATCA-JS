import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type {
  InvoiceChainEntry,
  InvoiceChainStore,
} from '../../src/crypto/invoice-chain.js';
import {
  createInvoicing,
  generateXml,
  hashInvoiceXml,
  type InvoiceInput,
} from '../../src/server/invoicing.js';

function storeFixture() {
  const entries = new Map<string, InvoiceChainEntry>();
  const claimed = new Set<string>();
  let head: InvoiceChainEntry | undefined;
  const store = {
    transaction: async (_scope, task) =>
      task({
        readHead: async () => head,
        find: async (id) => entries.get(id),
        append: async (entry) => {
          head = entry;
          entries.set(entry.issuanceId, entry);
        },
      }),
    async claimSubmission(_scope: unknown, id: string) {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
  } satisfies InvoiceChainStore & {
    claimSubmission(scope: unknown, id: string): Promise<boolean>;
  };
  return { store, entries };
}

const fixture = JSON.parse(
  readFileSync(
    new URL('../../examples/invoicing/invoice.json', import.meta.url),
    'utf8',
  ),
) as InvoiceInput;

it('generates unsigned XML independently using the supplied chain link', () => {
  const xml = generateXml({
    ...fixture,
    invoiceCounter: '2',
    previousInvoiceHash: Buffer.alloc(32).toString('base64'),
  });
  expect(xml).toContain(
    '<cbc:PayableAmount currencyID="SAR">230.00</cbc:PayableAmount>',
  );
  expect(xml).not.toContain('ds:Signature');
});

const validationResults = {
  status: 'PASS',
  errorMessages: [],
  warningMessages: [],
  infoMessages: [],
};
const xmllintPath = process.env.ZATCA_TEST_XMLLINT;
const token = Buffer.from('synthetic-test-certificate').toString('base64');

function settings() {
  return {
    environment: 'sandbox',
    csid: {
      environment: 'sandbox',
      kind: 'production',
      requestId: '101',
      binarySecurityToken: token,
      secret: 'synthetic-test-secret',
    },
  } as const;
}

it.skipIf(!xmllintPath)(
  'sends the JSON example for clearance and prevents a second send',
  async () => {
    if (!xmllintPath) throw new Error('Missing test canonicalizer');
    const { store } = storeFixture();
    const transport = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain('/developer-portal/invoices/clearance/single');
      expect(new Headers(init.headers).get('Authorization')).toBe(
        `Basic ${Buffer.from(`${token}:synthetic-test-secret`).toString('base64')}`,
      );
      const { invoice, uuid, invoiceHash } = JSON.parse(String(init.body));
      expect(uuid).toBe(fixture.uuid);
      expect(invoiceHash).toMatch(/^[A-Za-z0-9+/]{43}=$/);
      expect(Buffer.from(invoice, 'base64').toString('utf8')).toContain(
        '230.00',
      );
      return Response.json({
        validationResults,
        clearanceStatus: 'CLEARED',
        clearedInvoice: invoice,
      });
    });
    const invoicing = createInvoicing({
      ...settings(),
      issuance: { egsId: 'test-device', xmllintPath, store },
      transport,
    });
    const result = await invoicing.issueInvoice(fixture, 'first-invoice');
    expect(result).toMatchObject({
      status: 'cleared',
      entry: { invoiceCounter: '1' },
    });
    expect(
      await invoicing.issueInvoice(fixture, 'first-invoice'),
    ).toMatchObject({ status: 'already-attempted' });
    expect(transport).toHaveBeenCalledTimes(1);
  },
);

it.skipIf(!xmllintPath)(
  'delegates simplified signing, reports and keeps a claim after a transport error',
  async () => {
    if (!xmllintPath) throw new Error('Missing test canonicalizer');
    const { store, entries } = storeFixture();
    const signSimplified = vi.fn(async (xml: string) =>
      xml.replace(
        '</Invoice>',
        '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></Invoice>',
      ),
    );
    const transport = vi.fn(async (url: string) => {
      expect(url).toContain('/developer-portal/invoices/reporting/single');
      return Response.json({ validationResults, reportingStatus: 'REPORTED' });
    });
    const invoicing = createInvoicing({
      ...settings(),
      issuance: { egsId: 'test-device', xmllintPath, store, signSimplified },
      transport,
    });
    const invoice = { ...fixture, kind: 'simplified' } as const;
    expect((await invoicing.issueInvoice(invoice, 'b2c')).status).toBe(
      'reported',
    );
    transport.mockRejectedValueOnce(new Error('lost connection'));
    const next = {
      ...invoice,
      uuid: '4aa3f00d-7d08-47b1-b876-a9922bcbfb90',
      id: 'INV-1002',
    };
    await expect(invoicing.issueInvoice(next, 'b2c-2')).rejects.toMatchObject({
      outcomeUnknown: true,
    });
    expect(entries.get('b2c-2')?.previousInvoiceHash).toBe(
      entries.get('b2c')?.invoiceHash,
    );
    expect((await invoicing.issueInvoice(next, 'b2c-2')).status).toBe(
      'already-attempted',
    );
    expect(signSimplified).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenCalledTimes(2);
  },
);

it('requires a signer for simplified JSON issuance and isolates credential environments', async () => {
  const { store, entries } = storeFixture();
  const path = new URL('../../', import.meta.url).pathname;
  // The canonicalizer is never invoked in this case.
  const absolute = process.platform === 'win32' ? path.slice(1) : path;
  const transport = vi.fn();
  const invoicing = createInvoicing({
    ...settings(),
    issuance: { egsId: 'test-device', xmllintPath: absolute, store },
    transport,
  });
  await expect(
    invoicing.issueInvoice({ ...fixture, kind: 'simplified' }, 'b2c'),
  ).rejects.toThrow('Phase 2 signer is required');
  expect(entries.size).toBe(0);
  expect(transport).not.toHaveBeenCalled();
  expect(() =>
    createInvoicing({
      ...settings(),
      environment: 'production',
    }),
  ).toThrow();
});

it('reports ready XML using only the environment and CSID settings', async () => {
  const transport = vi.fn(async () =>
    Response.json({ validationResults, reportingStatus: 'REPORTED' }),
  );
  const invoicing = createInvoicing({ ...settings(), transport });
  const invoiceHash = Buffer.alloc(32).toString('base64');
  const xml = generateXml({
    ...fixture,
    kind: 'simplified',
    invoiceCounter: '1',
    previousInvoiceHash: invoiceHash,
  }).replace(
    '</Invoice>',
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></Invoice>',
  );
  expect((await invoicing.reportXml({ xml, invoiceHash })).status).toBe(
    'reported',
  );
  await expect(invoicing.issueInvoice(fixture, 'a')).rejects.toThrow(
    'JSON issuance settings are required',
  );
  expect(transport).toHaveBeenCalledTimes(1);
});

it.skipIf(!xmllintPath)(
  'passes the same generated, prepared and hashed XML to reporting in memory',
  async () => {
    if (!xmllintPath) throw new Error('Missing test canonicalizer');
    const draftXml = generateXml({
      ...fixture,
      kind: 'simplified',
      invoiceCounter: '1',
      previousInvoiceHash: Buffer.alloc(32).toString('base64'),
    });
    const xml = draftXml.replace(
      '</Invoice>',
      '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"/></Invoice>',
    );
    const invoiceHash = hashInvoiceXml(xml, xmllintPath);
    const transport = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      expect(payload.uuid).toBe(fixture.uuid);
      expect(payload.invoiceHash).toBe(invoiceHash);
      expect(Buffer.from(payload.invoice, 'base64').toString('utf8')).toBe(xml);
      return Response.json({ validationResults, reportingStatus: 'REPORTED' });
    });
    const invoicing = createInvoicing({ ...settings(), transport });
    expect((await invoicing.reportXml({ xml, invoiceHash })).status).toBe(
      'reported',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  },
);
