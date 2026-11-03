import { encodeQrBase64 } from '../src/qr/index.js';
import {
  buildInvoiceXml,
  calculateInvoice,
  type InvoiceDraft,
  initialPreviousInvoiceHash,
  validateInvoiceXml,
} from '../src/xml/index.js';

import type { Profile } from './model.js';

interface DraftInput {
  readonly profile: Profile;
  readonly seller: string;
  readonly vatNumber: string;
  readonly quantity: string;
  readonly unitPrice: string;
}

const date = '2026-11-03';
const issuedAt = `${date}T10:30:00+03:00`;
const address = {
  street: 'شارع التجربة',
  buildingNumber: '1234',
  district: 'حي الاختبار',
  city: 'الرياض',
  postalCode: '12345',
  country: 'SA',
} as const;

export function createDemoInvoice(input: DraftInput) {
  const draft: InvoiceDraft = {
    kind: input.profile,
    documentKind: 'invoice',
    id: 'LAB-001',
    uuid: '41a5263f-77cc-438a-9696-f154ba7130d8',
    issuedAt,
    supplyDate: date,
    currency: 'SAR',
    seller: {
      name: input.seller,
      vatNumber: input.vatNumber,
      registrationId: '1234567890',
      address,
    },
    ...(input.profile === 'standard'
      ? { buyer: { name: 'المشتري التجريبي', address } }
      : {}),
    paymentMeansCode: '30',
    invoiceCounter: '1',
    previousInvoiceHash: initialPreviousInvoiceHash,
    lines: [
      {
        id: '1',
        name: 'خدمة تجريبية',
        quantity: input.quantity,
        unitCode: 'PCE',
        unitPrice: input.unitPrice,
        tax: { category: 'S' },
      },
    ],
  };

  const totals = calculateInvoice(draft);
  const xml = buildInvoiceXml(draft);
  const payload = encodeQrBase64({
    sellerName: input.seller,
    vatNumber: input.vatNumber,
    issuedAt,
    invoiceTotal: totals.taxInclusiveTotal,
    vatTotal: totals.vatTotal,
  });
  if (!validateInvoiceXml(xml).structureValid)
    throw new Error('Local invoice output failed structural validation');
  return { totals, xml, payload };
}
