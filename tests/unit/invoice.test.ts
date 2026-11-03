import { describe, expect, it } from 'vitest';
import { ZatcaValidationError } from '../../src/core/errors.js';
import {
  buildInvoiceXml,
  calculateInvoice,
  type InvoiceDraft,
  parseInvoiceXml,
  validateInvoiceXml,
} from '../../src/xml/index.js';
import { invoiceDraft, invoiceExamples } from '../fixtures/invoice-drafts.js';

describe('SAR accounting', () => {
  it('reproduces the official §9.3 price base quantity example', () => {
    const result = calculateInvoice(invoiceDraft());
    expect(result.lines).toEqual([
      { netAmount: '2000.00', vatAmount: '300.00', grossAmount: '2300.00' },
    ]);
    expect(result).toMatchObject({
      lineNetTotal: '2000.00',
      vatTotal: '300.00',
      payableTotal: '2300.00',
    });
    expect(Object.isFrozen(result.lines[0])).toBe(true);
  });

  it('reproduces the official §9.3 amount with a line allowance and charge', () => {
    const draft = invoiceDraft();
    const line = draft.lines[0];
    if (!line) throw new Error('Missing fixture line');
    draft.lines = [
      {
        ...line,
        unitPrice: '100',
        priceBaseQuantity: '1',
        adjustments: [
          { kind: 'allowance', amount: '100', reason: 'Discount' },
          { kind: 'charge', amount: '25', reason: 'Service' },
        ],
      },
    ];
    expect(calculateInvoice(draft).lines).toEqual([
      { netAmount: '925.00', vatAmount: '138.75', grossAmount: '1063.75' },
    ]);
  });

  it('rounds half up and does not sum rounded line VAT for document VAT', () => {
    const draft = invoiceDraft();
    const line = draft.lines[0];
    if (!line) throw new Error('Missing fixture line');
    const result = calculateInvoice({
      ...draft,
      lines: [
        {
          ...line,
          id: '1',
          quantity: '1',
          priceBaseQuantity: '1',
          unitPrice: '0.025',
        },
        {
          ...line,
          id: '2',
          quantity: '1',
          priceBaseQuantity: '1',
          unitPrice: '0.025',
        },
      ],
    });
    expect(
      result.lines.map(({ netAmount, vatAmount }) => [netAmount, vatAmount]),
    ).toEqual([
      ['0.03', '0.00'],
      ['0.03', '0.00'],
    ]);
    expect(result).toMatchObject({
      lineNetTotal: '0.06',
      vatTotal: '0.01',
      payableTotal: '0.07',
    });
  });

  it('handles mixed categories and document-level adjustments', () => {
    const draft = invoiceDraft();
    const line = draft.lines[0];
    if (!line) throw new Error('Missing fixture line');
    const s = { category: 'S' } as const;
    const z = { category: 'Z', exemptionCode: 'VATEX-SA-35' } as const;
    const e = { category: 'E', exemptionCode: 'VATEX-SA-29' } as const;
    draft.lines = [
      { ...line, id: '1', tax: s },
      { ...line, id: '2', tax: z },
      { ...line, id: '3', tax: e },
    ];
    draft.adjustments = [
      { kind: 'allowance', amount: '10.00', reason: 'Discount', tax: s },
      { kind: 'charge', amount: '5.00', reason: 'Service', tax: z },
    ];
    expect(calculateInvoice(draft)).toMatchObject({
      lineNetTotal: '6000.00',
      allowanceTotal: '10.00',
      chargeTotal: '5.00',
      taxExclusiveTotal: '5995.00',
      vatTotal: '298.50',
      payableTotal: '6293.50',
      vatBreakdown: [
        { tax: s, taxableAmount: '1990.00', vatAmount: '298.50' },
        { tax: z, taxableAmount: '2005.00', vatAmount: '0.00' },
        { tax: e, taxableAmount: '2000.00', vatAmount: '0.00' },
      ],
    });
    expect(buildInvoiceXml(draft)).toContain(
      '<cbc:TaxExemptionReasonCode>VATEX-SA-35</cbc:TaxExemptionReasonCode>',
    );
  });

  it('rejects negative category balances and unsupported input', () => {
    const draft = invoiceDraft();
    expect(() =>
      calculateInvoice({
        ...draft,
        adjustments: [
          {
            kind: 'allowance',
            amount: '2000.01',
            reason: 'Discount',
            tax: { category: 'S' },
          },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        issues: [expect.objectContaining({ path: '/adjustments' })],
      }),
    );
    expect(() =>
      calculateInvoice({ ...draft, prepaidAmount: '10.00' } as InvoiceDraft),
    ).toThrow(ZatcaValidationError);
    expect(() =>
      calculateInvoice({
        ...draft,
        currency: 'USD',
      } as unknown as InvoiceDraft),
    ).toThrow(ZatcaValidationError);
    expect(() =>
      calculateInvoice({ ...draft, issuedAt: '2023-02-29T00:00:00Z' }),
    ).toThrow(ZatcaValidationError);
    expect(() => calculateInvoice({ ...draft, buyer: undefined })).toThrow(
      ZatcaValidationError,
    );
    expect(() =>
      calculateInvoice({ ...draft, documentKind: 'credit-note' }),
    ).toThrow(ZatcaValidationError);
    expect(() =>
      calculateInvoice({
        ...draft,
        documentKind: 'credit-note',
        noteReason: 'Correction',
        references: [{ id: draft.id }],
      }),
    ).toThrow(
      expect.objectContaining({
        issues: [expect.objectContaining({ path: '/references' })],
      }),
    );
  });
});

describe('UBL XML drafts', () => {
  it.each(Object.entries(invoiceExamples()))(
    'builds and inspects %s',
    (_label, draft) => {
      const xml = buildInvoiceXml(draft);
      expect(buildInvoiceXml(draft)).toBe(xml);
      const parsed = parseInvoiceXml(xml);
      expect(validateInvoiceXml(xml)).toEqual({
        structureValid: true,
        errors: [],
      });
      expect(parsed).toMatchObject({
        header: {
          ID: draft.id,
          UUID: draft.uuid,
          IssueDate: '2024-02-29',
          IssueTime: '15:30:00',
          DocumentCurrencyCode: 'SAR',
        },
        totals: {
          TaxExclusiveAmount: '2000.00',
          TaxInclusiveAmount: '2300.00',
          PayableAmount: '2300.00',
        },
        invoiceSubtype: draft.kind === 'standard' ? '0100000' : '0200000',
        lineCount: 1,
        hasXmlSignature: false,
      });
      const code =
        draft.documentKind === 'invoice'
          ? '388'
          : draft.documentKind === 'credit-note'
            ? '381'
            : '383';
      expect(parsed.header.InvoiceTypeCode).toBe(code);
      const topLevel = xml.split('<cac:InvoiceLine>')[0] ?? '';
      expect(topLevel.match(/<cac:TaxTotal>/g)).toHaveLength(2);
      expect(topLevel.match(/<cac:TaxSubtotal>/g)).toHaveLength(1);
      expect(xml).toContain('صنف &lt;تجريبي&gt;');
      expect(xml).toContain('شركة الاختبار &amp; الشركاء');
      if (draft.documentKind !== 'invoice') {
        expect(xml).toContain('<cac:BillingReference>');
        expect(xml).toContain('<cbc:InstructionNote>');
      }
    },
  );

  it('retains UTC time and identifies fields by namespace rather than prefix', () => {
    const xml = buildInvoiceXml({
      ...invoiceDraft(),
      issuedAt: '2024-02-29T12:30:00Z',
    })
      .replaceAll('xmlns:cbc', 'xmlns:b')
      .replaceAll('cbc:', 'b:');
    expect(parseInvoiceXml(xml).header.IssueTime).toBe('12:30:00Z');
  });

  it.each([
    [
      '<!DOCTYPE Invoice [<!ENTITY x SYSTEM "file:///secret">]><Invoice>&x;</Invoice>',
      'ZATCA_XML_DTD',
    ],
    [
      '<!DOCTYPE Invoice [<!ENTITY a "expanded">]><Invoice>&a;</Invoice>',
      'ZATCA_XML_DTD',
    ],
    ['<Invoice/>', 'ZATCA_XML_ROOT'],
    ['<Invoice', 'ZATCA_XML_MALFORMED'],
    ['x'.repeat(2 * 1024 * 1024 + 1), 'ZATCA_XML_SIZE'],
  ])('rejects unsafe or malformed input', (xml, code) => {
    expect(validateInvoiceXml(xml)).toMatchObject({
      structureValid: false,
      errors: [{ code }],
    });
  });

  it('rejects deep input and duplicated captured fields', () => {
    const xml = buildInvoiceXml(invoiceDraft());
    expect(
      validateInvoiceXml(
        xml.replace(
          '</Invoice>',
          `${'<x>'.repeat(70) + '</x>'.repeat(70)}</Invoice>`,
        ),
      ).errors[0]?.code,
    ).toBe('ZATCA_XML_COMPLEXITY');
    expect(
      validateInvoiceXml(
        xml.replace(
          '<cbc:ID>INV-001</cbc:ID>',
          '<cbc:ID>INV-001</cbc:ID><cbc:ID>INV-002</cbc:ID>',
        ),
      ).errors[0]?.code,
    ).toBe('ZATCA_XML_DUPLICATE');
  });
});
