import { initialPreviousInvoiceHash, type InvoiceDraft } from '../../src/xml/index.js';

const address = {
  street: 'شارع الاختبار',
  buildingNumber: '1234',
  district: 'حي الاختبار',
  city: 'الرياض',
  postalCode: '12345',
  country: 'SA',
} as const;

export function invoiceDraft(): InvoiceDraft {
  return {
    kind: 'standard',
    documentKind: 'invoice',
    id: 'INV-001',
    uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adcb',
    issuedAt: '2024-02-29T15:30:00+03:00',
    supplyDate: '2024-02-29',
    currency: 'SAR',
    seller: {
      name: 'شركة الاختبار & الشركاء',
      vatNumber: '300000000000003',
      registrationId: '1234567890',
      address,
    },
    buyer: { name: 'المشتري التجريبي', address },
    paymentMeansCode: '30',
    invoiceCounter: '1',
    previousInvoiceHash: initialPreviousInvoiceHash,
    lines: [{
      id: '1', name: 'صنف <تجريبي>', sellerItemId: 'SKU-001',
      quantity: '10', unitCode: 'PCE', unitPrice: '400', priceBaseQuantity: '2',
      tax: { category: 'S' },
    }],
  };
}

export function invoiceExamples(): Record<string, InvoiceDraft> {
  const note = {
    noteReason: 'تصحيح كمية الفاتورة',
    references: [{ id: 'INV-001', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adcb', issueDate: '2024-02-29' }],
  } as const;
  const { buyer: _buyer, ...simplified } = invoiceDraft();
  const simplifiedReference = [{ id: 'INV-002', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc2', issueDate: '2024-02-29' }];
  return {
    'standard-invoice': invoiceDraft(),
    'simplified-invoice': { ...simplified, kind: 'simplified', id: 'INV-002', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc2' },
    'standard-credit-note': { ...invoiceDraft(), ...note, references: [...note.references], documentKind: 'credit-note', id: 'CN-001', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc3' },
    'standard-debit-note': { ...invoiceDraft(), ...note, references: [...note.references], documentKind: 'debit-note', id: 'DN-001', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc4' },
    'simplified-credit-note': { ...simplified, ...note, references: simplifiedReference, kind: 'simplified', documentKind: 'credit-note', id: 'CN-002', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc5' },
    'simplified-debit-note': { ...simplified, ...note, references: simplifiedReference, kind: 'simplified', documentKind: 'debit-note', id: 'DN-002', uuid: 'a2e8e2b6-858c-4c16-bca8-ec820b12adc6' },
  };
}
