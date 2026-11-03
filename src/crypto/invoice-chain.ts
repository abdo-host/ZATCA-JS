import {
  initialPreviousInvoiceHash,
  isInvoiceDigest,
} from '../core/invoice-digest.js';

export interface InvoiceChainScope {
  readonly environment: 'sandbox' | 'simulation' | 'production';
  readonly egsId: string;
}

export interface InvoiceChainLink {
  readonly invoiceCounter: string;
  readonly previousInvoiceHash: string;
}

interface PreparedInvoice {
  readonly invoiceHash: string;
  readonly xml: string;
}

export interface InvoiceChainEntry extends InvoiceChainLink, PreparedInvoice {
  readonly issuanceId: string;
  readonly intentHash: string;
}

export interface InvoiceChainTransaction {
  readHead(): Promise<
    Pick<InvoiceChainEntry, 'invoiceCounter' | 'invoiceHash'> | undefined
  >;
  find(issuanceId: string): Promise<InvoiceChainEntry | undefined>;
  append(entry: InvoiceChainEntry): Promise<void>;
}

export interface InvoiceChainStore {
  /**
   * Serialize all reads and writes per scope across processes. Commit the entry
   * and new head together before resolving, or roll back if the callback fails.
   */
  transaction<T>(
    scope: InvoiceChainScope,
    task: (transaction: InvoiceChainTransaction) => Promise<T>,
  ): Promise<T>;
}

/**
 * Stores a prepared artifact before external issuance or submission.
 * The caller must hash all material inputs into intentHash and bind the given
 * PIH/ICV to the returned XML and its canonical digest. Preparation must not
 * publish the artifact or perform any irreversible work.
 */
export async function appendInvoice(
  store: InvoiceChainStore,
  scope: InvoiceChainScope,
  request: { readonly issuanceId: string; readonly intentHash: string },
  prepare: (link: InvoiceChainLink) => Promise<PreparedInvoice>,
): Promise<InvoiceChainEntry> {
  const { environment, egsId } = scope;
  const { issuanceId, intentHash } = request;
  if (
    !['sandbox', 'simulation', 'production'].includes(environment) ||
    typeof egsId !== 'string' ||
    egsId.length > 256 ||
    !egsId.trim() ||
    typeof issuanceId !== 'string' ||
    issuanceId.length > 256 ||
    !issuanceId.trim() ||
    !isInvoiceDigest(intentHash)
  )
    throw new Error('Invalid invoice chain request');

  return store.transaction({ environment, egsId }, async (transaction) => {
    const previous = await transaction.find(issuanceId);
    if (previous) {
      if (previous.intentHash !== intentHash)
        throw new Error('Issuance ID already exists with different inputs');
      return previous;
    }

    const head = await transaction.readHead();
    if (
      head &&
      (typeof head.invoiceCounter !== 'string' ||
        !/^[1-9]\d{0,19}$/.test(head.invoiceCounter) ||
        !isInvoiceDigest(head.invoiceHash))
    )
      throw new Error('Invalid invoice chain head');

    const invoiceCounter = head
      ? (BigInt(head.invoiceCounter) + 1n).toString()
      : '1';
    if (invoiceCounter.length > 20)
      throw new Error('Invoice counter exceeds the supported XML draft range');
    const link = Object.freeze({
      invoiceCounter,
      previousInvoiceHash: head?.invoiceHash ?? initialPreviousInvoiceHash,
    });

    const { invoiceHash, xml } = await prepare(link);
    if (!isInvoiceDigest(invoiceHash) || typeof xml !== 'string' || !xml.trim())
      throw new Error('Invalid prepared invoice');

    const entry = Object.freeze({
      ...link,
      issuanceId,
      intentHash,
      invoiceHash,
      xml,
    });
    await transaction.append(entry);
    return entry;
  });
}
