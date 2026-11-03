import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import {
  type ApiEnvironment,
  type Csid,
  createZatcaApi,
  type HttpTransport,
  type InvoiceSubmission,
  ZatcaApiError,
} from '../api/client.js';
import { invoicePayload, parseCsid } from '../api/protocol.js';
import {
  appendInvoice,
  type InvoiceChainScope,
  type InvoiceChainStore,
} from '../crypto/invoice-chain.js';
import { hashInvoiceXml } from '../crypto/invoice-hash.js';
import { encodeQrBase64 } from '../qr/index.js';
import {
  buildInvoiceXml,
  type InvoiceDraft,
  initialPreviousInvoiceHash,
  parseInvoiceXml,
} from '../xml/index.js';
import { readInvoiceDraft } from '../xml/model.js';

export type InvoiceInput = Omit<
  InvoiceDraft,
  'invoiceCounter' | 'previousInvoiceHash'
>;

interface IssuanceStore extends InvoiceChainStore {
  /** Persist a unique claim per environment, EGS and issuance ID before dispatch. */
  claimSubmission(
    scope: InvoiceChainScope,
    issuanceId: string,
  ): Promise<boolean>;
}

interface InvoicingOptions {
  readonly environment: ApiEnvironment;
  readonly csid: Csid<'production'>;
  readonly transport?: HttpTransport;
  readonly issuance?: {
    readonly egsId: string;
    readonly xmllintPath: string;
    readonly store: IssuanceStore;
    /** Trusted server signer. Return signed UBL with its Phase 2 QR already embedded. */
    readonly signSimplified?: (xml: string) => Promise<string>;
  };
}

export function createInvoicing(options: InvoicingOptions) {
  const { environment, issuance, transport } = options;
  const inputCsid = options.csid;
  const parsedCsid = parseCsid(
    { ...inputCsid, requestID: inputCsid.requestId },
    environment,
    'production',
  );
  if (
    !parsedCsid ||
    inputCsid.environment !== environment ||
    inputCsid.kind !== 'production'
  )
    throw new ZatcaApiError('invalid-input');

  const csid = parsedCsid;
  const api = createZatcaApi({
    environment,
    ...(transport ? { transport } : {}),
  });

  function reportXml(document: InvoiceSubmission, signal?: AbortSignal) {
    return api.report(document, csid, {
      clearanceEnabled: true,
      ...(signal ? { signal } : {}),
    });
  }

  function clearXml(document: InvoiceSubmission, signal?: AbortSignal) {
    return api.clear(document, csid, signal);
  }

  async function issueInvoice(
    invoice: InvoiceInput,
    issuanceId: string,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) throw new ZatcaApiError('cancelled');
    if (!issuance) throw new Error('JSON issuance settings are required');
    const { egsId, xmllintPath, store, signSimplified } = issuance;
    if (
      !isAbsolute(xmllintPath) ||
      typeof egsId !== 'string' ||
      !egsId.trim() ||
      egsId.length > 256
    )
      throw new ZatcaApiError('invalid-input');
    const scope = Object.freeze({ environment, egsId });
    // The invoice schema orders fields and validates the caller's business data.
    const draft = readInvoiceDraft({
      ...invoice,
      invoiceCounter: '1',
      previousInvoiceHash: initialPreviousInvoiceHash,
    });
    const { kind } = draft;
    const intentHash = createHash('sha256')
      .update(JSON.stringify(draft))
      .digest('base64');
    const entry = await appendInvoice(
      store,
      scope,
      { issuanceId, intentHash },
      async (link) => {
        const unsignedXml = buildInvoiceXml({ ...draft, ...link });
        let xml = unsignedXml;
        if (kind === 'simplified') {
          if (!signSimplified)
            throw new Error(
              'A Phase 2 signer is required for simplified issuance',
            );
          xml = await signSimplified(unsignedXml);
          const signed = parseInvoiceXml(xml);
          if (
            signed.header.UUID !== draft.uuid ||
            signed.header.ID !== draft.id ||
            !signed.hasXmlSignature
          )
            throw new Error(
              'Signer must return the same invoice with its signature',
            );
        }
        const invoiceHash = hashInvoiceXml(xml, xmllintPath);
        invoicePayload({ xml, invoiceHash }, kind);
        return { xml, invoiceHash };
      },
    );
    if (signal?.aborted) throw new ZatcaApiError('cancelled');
    if (!(await store.claimSubmission(scope, issuanceId)))
      return { status: 'already-attempted' as const, entry };

    const result =
      kind === 'simplified'
        ? await reportXml(entry, signal)
        : await clearXml(entry, signal);
    return { ...result, entry };
  }

  return { issueInvoice, reportXml, clearXml };
}

/** Generates unsigned XML or hashes a prepared document for split workflows. */
/** The standalone QR API creates Phase 1 payloads without onboarding. */
export {
  buildInvoiceXml as generateXml,
  encodeQrBase64 as generatePhase1Qr,
  hashInvoiceXml,
};
