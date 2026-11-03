import { describe, expect, it } from 'vitest';
import { createDemoInvoice } from '../../demo/invoice.js';
import { route, simulateSubmission } from '../../demo/model.js';
import { decodeQrBase64 } from '../../src/qr/index.js';
import { parseInvoiceXml } from '../../src/xml/index.js';

const input = {
  profile: 'simplified',
  seller: 'شركة',
  vatNumber: '300000000000003',
  quantity: '2',
  unitPrice: '100.00',
} as const;

describe('invoice lab', () => {
  it('uses matching totals in the receipt, unsigned UBL and Phase 1 QR', () => {
    const { totals, xml, payload } = createDemoInvoice(input);
    expect(totals).toMatchObject({
      taxExclusiveTotal: '200.00',
      vatTotal: '30.00',
      payableTotal: '230.00',
    });
    expect(parseInvoiceXml(xml)).toMatchObject({
      invoiceSubtype: '0200000',
      hasXmlSignature: false,
      totals: { PayableAmount: '230.00' },
    });
    const decoded = decodeQrBase64(payload);
    expect(decoded).toMatchObject({
      valid: true,
      fields: { sellerName: 'شركة', invoiceTotal: '230.00', vatTotal: '30.00' },
    });
    expect(decoded.tags[0]?.value.length).toBe(8);
  });

  it('rejects invalid input and keeps clearance distinct from reporting', () => {
    expect(() => createDemoInvoice({ ...input, vatNumber: '123' })).toThrow();
    expect(
      parseInvoiceXml(createDemoInvoice({ ...input, profile: 'standard' }).xml)
        .invoiceSubtype,
    ).toBe('0100000');
    expect(route.standard.path).toBe('/invoices/clearance/single');
    expect(route.simplified.path).toBe('/invoices/reporting/single');
    expect(simulateSubmission('standard', 'warning').detail).toContain(
      '202 · CLEARED',
    );
    expect(simulateSubmission('simplified', 'rejected').detail).toContain(
      '400 · NOT_REPORTED',
    );
    expect(simulateSubmission('simplified', 'timeout').title).toBe(
      'نتيجة غير مؤكدة',
    );
  });
});
