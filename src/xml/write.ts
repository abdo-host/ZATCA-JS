import { create } from 'xmlbuilder2';
import { calculateDraft } from './calculate.js';
import {
  exemptionText,
  type InvoiceAdjustment,
  type InvoiceDraft,
  type InvoiceParty,
  readInvoiceDraft,
  type TaxCategory,
} from './model.js';
import { cac, cbc, checkXmlSize, invoiceNamespace } from './structure.js';

type Element = ReturnType<typeof create>;

const typeCodes = {
  invoice: '388',
  'credit-note': '381',
  'debit-note': '383',
} as const;

function aggregate(parent: Element, tag: string) {
  return parent.ele(cac, `cac:${tag}`);
}

function basic(
  parent: Element,
  tag: string,
  value: string,
  attributes: Record<string, string> = {},
) {
  return parent.ele(cbc, `cbc:${tag}`, attributes).txt(value);
}

function amount(parent: Element, tag: string, value: string) {
  basic(parent, tag, value, { currencyID: 'SAR' });
}

function vatScheme(parent: Element) {
  basic(aggregate(parent, 'TaxScheme'), 'ID', 'VAT');
}

function writeParty(parent: Element, tag: string, party?: InvoiceParty) {
  const account = aggregate(parent, tag);
  if (!party) return;
  const node = aggregate(account, 'Party');
  if (party.registrationId) {
    basic(aggregate(node, 'PartyIdentification'), 'ID', party.registrationId, {
      schemeID: 'CRN',
    });
  }
  const address = aggregate(node, 'PostalAddress');
  basic(address, 'StreetName', party.address.street);
  basic(address, 'BuildingNumber', party.address.buildingNumber);
  basic(address, 'CitySubdivisionName', party.address.district);
  basic(address, 'CityName', party.address.city);
  basic(address, 'PostalZone', party.address.postalCode);
  basic(
    aggregate(address, 'Country'),
    'IdentificationCode',
    party.address.country,
  );
  if (party.vatNumber) {
    const tax = aggregate(node, 'PartyTaxScheme');
    basic(tax, 'CompanyID', party.vatNumber);
    vatScheme(tax);
  }
  basic(aggregate(node, 'PartyLegalEntity'), 'RegistrationName', party.name);
}

function writeTax(
  parent: Element,
  tag: string,
  tax: TaxCategory,
  breakdown = false,
) {
  const element = aggregate(parent, tag);
  basic(element, 'ID', tax.category);
  basic(element, 'Percent', tax.category === 'S' ? '15' : '0');
  if (breakdown && tax.category !== 'S') {
    basic(element, 'TaxExemptionReasonCode', tax.exemptionCode);
    basic(element, 'TaxExemptionReason', exemptionText[tax.exemptionCode]);
  }
  vatScheme(element);
}

function writeAdjustment(
  parent: Element,
  adjustment: InvoiceAdjustment,
  tax?: TaxCategory,
) {
  const node = aggregate(parent, 'AllowanceCharge');
  basic(node, 'ChargeIndicator', String(adjustment.kind === 'charge'));
  basic(node, 'AllowanceChargeReason', adjustment.reason);
  amount(node, 'Amount', adjustment.amount);
  if (tax) writeTax(node, 'TaxCategory', tax);
}

/** Builds an unsigned UBL 2.1 draft from validated fields and freshly calculated totals. */
export function buildInvoiceXml(input: InvoiceDraft): string {
  const draft = readInvoiceDraft(input);
  const totals = calculateDraft(draft);
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele(
    invoiceNamespace,
    'Invoice',
  );
  root.att('xmlns:cac', cac).att('xmlns:cbc', cbc);

  basic(root, 'ProfileID', 'reporting:1.0');
  basic(root, 'ID', draft.id);
  basic(root, 'UUID', draft.uuid);
  basic(root, 'IssueDate', draft.issuedAt.slice(0, 10));
  basic(root, 'IssueTime', draft.issuedAt.slice(11).replace(/\+03:00$/, ''));
  basic(root, 'InvoiceTypeCode', typeCodes[draft.documentKind], {
    name: draft.kind === 'standard' ? '0100000' : '0200000',
  });
  basic(root, 'DocumentCurrencyCode', draft.currency);
  basic(root, 'TaxCurrencyCode', 'SAR');

  for (const reference of draft.references ?? []) {
    const invoice = aggregate(
      aggregate(root, 'BillingReference'),
      'InvoiceDocumentReference',
    );
    basic(invoice, 'ID', reference.id);
    if (reference.uuid) basic(invoice, 'UUID', reference.uuid);
    if (reference.issueDate) basic(invoice, 'IssueDate', reference.issueDate);
  }

  const counter = aggregate(root, 'AdditionalDocumentReference');
  basic(counter, 'ID', 'ICV');
  basic(counter, 'UUID', draft.invoiceCounter);
  const pih = aggregate(root, 'AdditionalDocumentReference');
  basic(pih, 'ID', 'PIH');
  basic(
    aggregate(pih, 'Attachment'),
    'EmbeddedDocumentBinaryObject',
    draft.previousInvoiceHash,
    { mimeCode: 'text/plain' },
  );
  writeParty(root, 'AccountingSupplierParty', draft.seller);
  writeParty(root, 'AccountingCustomerParty', draft.buyer);

  if (draft.supplyDate)
    basic(aggregate(root, 'Delivery'), 'ActualDeliveryDate', draft.supplyDate);
  if (draft.paymentMeansCode) {
    const payment = aggregate(root, 'PaymentMeans');
    basic(payment, 'PaymentMeansCode', draft.paymentMeansCode);
    if (draft.noteReason) basic(payment, 'InstructionNote', draft.noteReason);
  }
  for (const adjustment of draft.adjustments ?? [])
    writeAdjustment(root, adjustment, adjustment.tax);

  // BR-KSA-EN16931-09 requires a separate total without subtotals for BT-6.
  amount(aggregate(root, 'TaxTotal'), 'TaxAmount', totals.vatTotal);
  const taxTotal = aggregate(root, 'TaxTotal');
  amount(taxTotal, 'TaxAmount', totals.vatTotal);
  for (const breakdown of totals.vatBreakdown) {
    const subtotal = aggregate(taxTotal, 'TaxSubtotal');
    amount(subtotal, 'TaxableAmount', breakdown.taxableAmount);
    amount(subtotal, 'TaxAmount', breakdown.vatAmount);
    writeTax(subtotal, 'TaxCategory', breakdown.tax, true);
  }

  const monetary = aggregate(root, 'LegalMonetaryTotal');
  amount(monetary, 'LineExtensionAmount', totals.lineNetTotal);
  amount(monetary, 'TaxExclusiveAmount', totals.taxExclusiveTotal);
  amount(monetary, 'TaxInclusiveAmount', totals.taxInclusiveTotal);
  if (draft.adjustments?.some(({ kind }) => kind === 'allowance'))
    amount(monetary, 'AllowanceTotalAmount', totals.allowanceTotal);
  if (draft.adjustments?.some(({ kind }) => kind === 'charge'))
    amount(monetary, 'ChargeTotalAmount', totals.chargeTotal);
  amount(monetary, 'PayableAmount', totals.payableTotal);

  for (const [index, line] of draft.lines.entries()) {
    const calculated = totals.lines[index];
    if (!calculated) throw new Error('Missing calculated invoice line');
    const node = aggregate(root, 'InvoiceLine');
    basic(node, 'ID', line.id);
    basic(node, 'InvoicedQuantity', line.quantity, { unitCode: line.unitCode });
    amount(node, 'LineExtensionAmount', calculated.netAmount);
    for (const adjustment of line.adjustments ?? [])
      writeAdjustment(node, adjustment);
    const lineTax = aggregate(node, 'TaxTotal');
    amount(lineTax, 'TaxAmount', calculated.vatAmount);
    amount(lineTax, 'RoundingAmount', calculated.grossAmount);
    const item = aggregate(node, 'Item');
    basic(item, 'Name', line.name);
    if (line.sellerItemId)
      basic(
        aggregate(item, 'SellersItemIdentification'),
        'ID',
        line.sellerItemId,
      );
    writeTax(item, 'ClassifiedTaxCategory', line.tax);
    const price = aggregate(node, 'Price');
    amount(price, 'PriceAmount', line.unitPrice);
    if (line.priceBaseQuantity)
      basic(price, 'BaseQuantity', line.priceBaseQuantity, {
        unitCode: line.unitCode,
      });
  }

  const xml = root.end();
  checkXmlSize(xml);
  return xml;
}
