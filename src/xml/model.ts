import { z } from 'zod';
import { ZatcaValidationError } from '../core/errors.js';
import {
  initialPreviousInvoiceHash,
  isInvoiceDigest,
} from '../core/invoice-digest.js';

export { initialPreviousInvoiceHash };

export const exemptionText = {
  'VATEX-SA-29': 'الخدمات المالية',
  'VATEX-SA-29-7': 'عقد تأمين على الحياة',
  'VATEX-SA-30': 'التوريدات العقارية المعفاة من الضريبة',
  'VATEX-SA-35': 'الأدوية والمعدات الطبية',
  'VATEX-SA-36': 'المعادن المؤهلة',
} as const;

const text = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      Boolean(value.trim()) &&
      !/[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(value),
    'Expected nonblank XML 1.0 text',
  );
const vatNumber = z
  .string()
  .regex(/^3[0-9]{13}3$/, 'Expected a Saudi VAT number');
const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'Expected a UUID');
const money = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/,
    'Expected a nonnegative amount with at most two decimals',
  );
const unitDecimal = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/,
    'Expected a nonnegative decimal with at most six decimal places',
  );
const positiveDecimal = unitDecimal.refine(
  (value) => /[1-9]/.test(value),
  'Expected a value greater than zero',
);

const date = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  .refine((value) => {
    const day = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value
    );
  }, 'Expected a real Gregorian date');

const issuedAt = z
  .string()
  .regex(
    /^[1-9]\d{3}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|\+03:00)$/,
    'Expected a timestamp in UTC or Saudi local time with seconds',
  )
  .refine(
    (value) => date.safeParse(value.slice(0, 10)).success,
    'Expected a real Gregorian date',
  );

const address = z.strictObject({
  street: text,
  buildingNumber: z.string().regex(/^\d{4}$/),
  district: text,
  city: text,
  postalCode: z.string().regex(/^\d{5}$/),
  country: z.literal('SA'),
});

const party = z.strictObject({
  name: text,
  vatNumber: vatNumber.optional(),
  registrationId: z
    .string()
    .regex(/^[a-z0-9]{1,30}$/i)
    .optional(),
  address,
});

const seller = party.extend({
  vatNumber,
  registrationId: z.string().regex(/^[a-z0-9]{1,30}$/i),
});

const tax = z.discriminatedUnion('category', [
  z.strictObject({ category: z.literal('S') }),
  z.strictObject({
    category: z.literal('Z'),
    exemptionCode: z.enum(['VATEX-SA-35', 'VATEX-SA-36']),
  }),
  z.strictObject({
    category: z.literal('E'),
    exemptionCode: z.enum(['VATEX-SA-29', 'VATEX-SA-29-7', 'VATEX-SA-30']),
  }),
]);

const adjustment = z.strictObject({
  kind: z.enum(['allowance', 'charge']),
  amount: money,
  reason: text,
});

const invoiceSchema = z
  .strictObject({
    kind: z.enum(['standard', 'simplified']),
    documentKind: z.enum(['invoice', 'credit-note', 'debit-note']),
    id: text,
    uuid,
    issuedAt,
    supplyDate: date.optional(),
    currency: z.literal('SAR'),
    seller,
    buyer: party.optional(),
    paymentMeansCode: z.enum(['10', '30', '48']).optional(),
    noteReason: text.optional(),
    references: z
      .array(
        z.strictObject({
          id: text,
          uuid: uuid.optional(),
          issueDate: date.optional(),
        }),
      )
      .min(1)
      .max(10)
      .optional(),
    invoiceCounter: z.string().regex(/^[1-9]\d{0,19}$/),
    previousInvoiceHash: z
      .string()
      .max(88)
      .refine(
        (value) =>
          value === initialPreviousInvoiceHash || isInvoiceDigest(value),
        'Expected a canonical Base64 SHA-256 digest or the prescribed initial PIH',
      ),
    lines: z
      .array(
        z.strictObject({
          id: text,
          name: text,
          sellerItemId: text.optional(),
          quantity: positiveDecimal,
          unitCode: z.enum(['PCE', 'EA', 'KGM', 'LTR', 'HUR', 'MTR']),
          unitPrice: unitDecimal,
          priceBaseQuantity: positiveDecimal.optional(),
          tax,
          adjustments: z.array(adjustment).max(20).optional(),
        }),
      )
      .min(1)
      .max(200),
    adjustments: z.array(adjustment.extend({ tax })).max(20).optional(),
  })
  .superRefine((draft, context) => {
    function required(key: string, message: string) {
      context.addIssue({ code: 'custom', path: [key], message });
    }
    if (draft.kind === 'standard' && !draft.buyer)
      required('buyer', 'Standard documents require a buyer');
    if (
      draft.kind === 'standard' &&
      draft.documentKind === 'invoice' &&
      !draft.supplyDate
    ) {
      required(
        'supplyDate',
        'Standard invoices require a supply date (BR-KSA-15)',
      );
    }
    if (draft.documentKind === 'invoice') {
      if (draft.noteReason || draft.references)
        required(
          'documentKind',
          'Billing references and note reason are reserved for notes',
        );
    } else {
      if (!draft.references)
        required(
          'references',
          'Credit and debit notes require an original invoice reference (BR-KSA-56)',
        );
      if (!draft.noteReason)
        required(
          'noteReason',
          'Credit and debit notes require a reason (BR-KSA-17)',
        );
      if (!draft.paymentMeansCode)
        required('paymentMeansCode', 'Provide the payment means for the note');
      if (
        draft.references?.some(
          ({ id, uuid }) =>
            id === draft.id || uuid?.toLowerCase() === draft.uuid.toLowerCase(),
        )
      ) {
        required('references', 'A note cannot reference itself');
      }
    }

    const lineIds = new Set<string>();
    for (const [index, line] of draft.lines.entries()) {
      if (lineIds.has(line.id))
        context.addIssue({
          code: 'custom',
          path: ['lines', index, 'id'],
          message: 'Line IDs must be unique',
        });
      lineIds.add(line.id);
    }
  });

export type InvoiceDraft = z.input<typeof invoiceSchema>;
export type TaxCategory = z.infer<typeof tax>;
export type InvoiceLine = InvoiceDraft['lines'][number];
export type InvoiceParty = NonNullable<InvoiceDraft['buyer']>;
export type InvoiceAdjustment = z.infer<typeof adjustment>;

export function readInvoiceDraft(draft: InvoiceDraft): InvoiceDraft {
  const parsed = invoiceSchema.safeParse(draft);
  if (parsed.success) return parsed.data;
  throw new ZatcaValidationError(
    'Invalid or unsupported invoice draft',
    parsed.error.issues.map(({ path, message }) => ({
      code: 'ZATCA_XML_DRAFT_FIELD',
      severity: 'error',
      path: `/${path.map(String).join('/')}`,
      message,
    })),
  );
}
