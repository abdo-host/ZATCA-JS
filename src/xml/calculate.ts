import { ZatcaValidationError } from '../core/errors.js';
import {
  type InvoiceAdjustment,
  type InvoiceDraft,
  readInvoiceDraft,
  type TaxCategory,
} from './model.js';

export interface CalculatedLine {
  readonly netAmount: string;
  readonly vatAmount: string;
  readonly grossAmount: string;
}

export interface VatBreakdown {
  readonly tax: Readonly<TaxCategory>;
  readonly taxableAmount: string;
  readonly vatAmount: string;
}

export interface CalculatedInvoice {
  readonly lines: readonly CalculatedLine[];
  readonly vatBreakdown: readonly VatBreakdown[];
  readonly lineNetTotal: string;
  readonly allowanceTotal: string;
  readonly chargeTotal: string;
  readonly taxExclusiveTotal: string;
  readonly vatTotal: string;
  readonly taxInclusiveTotal: string;
  readonly payableTotal: string;
}

const units = 1_000_000n;

function fixed(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function decimal(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

function totals(adjustments: readonly InvoiceAdjustment[] = []) {
  let allowances = 0n;
  let charges = 0n;
  for (const adjustment of adjustments) {
    if (adjustment.kind === 'allowance')
      allowances += fixed(adjustment.amount, 2);
    else charges += fixed(adjustment.amount, 2);
  }
  return { allowances, charges };
}

function invalid(path: string, message: string, specReference: string): never {
  throw new ZatcaValidationError('Invalid invoice calculation', [
    {
      code: 'ZATCA_XML_CALCULATION',
      severity: 'error',
      path,
      message,
      specReference,
    },
  ]);
}

function vat(cents: bigint, tax: TaxCategory): bigint {
  return tax.category === 'S' ? roundHalfUp(cents * 15n, 100n) : 0n;
}

export function calculateDraft(draft: InvoiceDraft): CalculatedInvoice {
  const groups = new Map<string, { tax: TaxCategory; cents: bigint }>();
  function addTax(tax: TaxCategory, cents: bigint) {
    const existing = groups.get(tax.category);
    if (existing) {
      if (
        'exemptionCode' in existing.tax &&
        'exemptionCode' in tax &&
        existing.tax.exemptionCode !== tax.exemptionCode
      ) {
        invalid(
          '/vatBreakdown',
          'Use one exemption code per category in this invoice profile',
          'XML Standard §9.6',
        );
      }
      existing.cents += cents;
    } else {
      groups.set(tax.category, { tax, cents });
    }
  }

  let lineNetTotal = 0n;
  const lines = draft.lines.map((line, index) => {
    const numerator = fixed(line.unitPrice, 6) * fixed(line.quantity, 6) * 100n;
    const denominator = fixed(line.priceBaseQuantity ?? '1', 6) * units;
    const base = roundHalfUp(numerator, denominator);
    const { allowances, charges } = totals(line.adjustments);
    const net = base - allowances + charges;
    if (net < 0n)
      invalid(
        `/lines/${index}`,
        'Line allowances exceed the line price and charges',
        'XML Standard §9.3',
      );
    const tax = vat(net, line.tax);
    lineNetTotal += net;
    addTax(line.tax, net);
    return Object.freeze({
      netAmount: decimal(net),
      vatAmount: decimal(tax),
      grossAmount: decimal(net + tax),
    });
  });

  for (const adjustment of draft.adjustments ?? []) {
    const amount = fixed(adjustment.amount, 2);
    addTax(adjustment.tax, adjustment.kind === 'charge' ? amount : -amount);
  }

  let vatTotal = 0n;
  const vatBreakdown = [...groups.values()].map(({ tax, cents }) => {
    if (cents < 0n)
      invalid(
        '/adjustments',
        'Document allowances exceed the taxable amount for a VAT category',
        'XML Standard §9.6',
      );
    const taxCents = vat(cents, tax);
    vatTotal += taxCents;
    return Object.freeze({
      tax: Object.freeze({ ...tax }),
      taxableAmount: decimal(cents),
      vatAmount: decimal(taxCents),
    });
  });
  const { allowances, charges } = totals(draft.adjustments);
  const net = lineNetTotal - allowances + charges;
  return Object.freeze({
    lines: Object.freeze(lines),
    vatBreakdown: Object.freeze(vatBreakdown),
    lineNetTotal: decimal(lineNetTotal),
    allowanceTotal: decimal(allowances),
    chargeTotal: decimal(charges),
    taxExclusiveTotal: decimal(net),
    vatTotal: decimal(vatTotal),
    taxInclusiveTotal: decimal(net + vatTotal),
    payableTotal: decimal(net + vatTotal),
  });
}

/** Calculates exact SAR totals for the supported unsigned invoice draft. */
export function calculateInvoice(draft: InvoiceDraft): CalculatedInvoice {
  return calculateDraft(readInvoiceDraft(draft));
}
