import { parseInvoiceXml } from '../xml/parse.js';
import {
  type ApiEnvironment,
  type Csid,
  type CsidKind,
  type Diagnostic,
  decodePayload,
  type InvoiceSubmission,
  invoicePayload,
  parseCsid,
} from './protocol.js';
import {
  diagnostics,
  type HttpTransport,
  type ResponseMetadata,
  record,
  send,
  ZatcaApiError,
} from './transport.js';

export type {
  ApiEnvironment,
  Csid,
  Diagnostic,
  InvoiceDocumentState,
  InvoiceSubmission,
} from './protocol.js';
export { getCsidExpiry } from './protocol.js';
export { type HttpTransport, ZatcaApiError } from './transport.js';

const baseUrls = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
} as const;
const operations = {
  requestComplianceCsid: ['POST', '/compliance'],
  checkCompliance: ['POST', '/compliance/invoices'],
  requestProductionCsid: ['POST', '/production/csids'],
  renewProductionCsid: ['PATCH', '/production/csids'],
  clear: ['POST', '/invoices/clearance/single'],
  report: ['POST', '/invoices/reporting/single'],
} as const;

type Operation = keyof typeof operations;
type AuditEvent = {
  readonly environment: ApiEnvironment;
  readonly operation: Operation;
} & (
  | { readonly phase: 'response'; readonly metadata: ResponseMetadata }
  | { readonly phase: 'interrupted'; readonly outcomeUnknown: boolean }
);

interface Options {
  readonly environment: ApiEnvironment;
  readonly timeoutMs?: number;
  readonly transport?: HttpTransport;
  readonly onEvent?: (event: AuditEvent) => void | Promise<void>;
}

interface Receipt {
  readonly metadata: ResponseMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

type ComplianceResult = Receipt & { readonly status: 'compliant' | 'rejected' };
type ReportingResult = Receipt & {
  readonly status: 'reported' | 'rejected' | 'duplicate';
};
type ClearanceResult = Receipt &
  (
    | { readonly status: 'cleared'; readonly clearedInvoiceBase64: string }
    | { readonly status: 'rejected' | 'clearance-disabled' }
  );
type RenewalResult =
  | { readonly status: 'renewed'; readonly csid: Csid<'production'> }
  | {
      readonly status: 'compliance-required';
      readonly csid: Csid<'compliance'>;
    };

function csrPayload(csr: string, otp: string) {
  try {
    const text = Buffer.from(decodePayload(csr, 16384)).toString('ascii');
    if (
      !/^\d{6}$/.test(otp) ||
      !/^-----BEGIN CERTIFICATE REQUEST-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END CERTIFICATE REQUEST-----\s*$/.test(
        text,
      )
    )
      throw new Error();
    return { csr };
  } catch {
    throw new ZatcaApiError('invalid-input');
  }
}

function clearanceHeader(enabled: boolean) {
  if (typeof enabled !== 'boolean') throw new ZatcaApiError('invalid-input');
  return { 'Clearance-Status': enabled ? '1' : '0' };
}

function isPositiveValidation(
  body: Record<string, unknown>,
  receipt: Receipt,
): boolean {
  const { status } = record(body.validationResults);
  return (
    (status === 'PASS' || status === 'WARNING') &&
    !receipt.diagnostics.some((entry) => entry.severity === 'error')
  );
}

export function createZatcaApi(options: Options) {
  const {
    environment,
    transport = fetch,
    timeoutMs = 15000,
    onEvent,
  } = options;
  if (
    (environment !== 'sandbox' && environment !== 'production') ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 120_000
  )
    throw new ZatcaApiError('invalid-input');

  function notify(event: AuditEvent) {
    try {
      void Promise.resolve(onEvent?.(event)).catch(() => undefined);
    } catch {
      // Observers cannot turn a committed remote outcome into a retryable failure.
    }
  }

  function authorization(csid: Csid, kind: CsidKind) {
    if (
      csid.environment !== environment ||
      csid.kind !== kind ||
      !parseCsid({ ...csid, requestID: csid.requestId }, environment, kind)
    )
      throw new ZatcaApiError('invalid-input');
    return `Basic ${Buffer.from(`${csid.binarySecurityToken}:${csid.secret}`, 'utf8').toString('base64')}`;
  }

  async function call(
    operation: Operation,
    payload: Record<string, string>,
    headers: Record<string, string>,
    signal?: AbortSignal,
    sensitive: readonly string[] = [],
  ) {
    const [method, path] = operations[operation];
    const secrets = [
      ...sensitive,
      ...Object.values(payload),
      headers.OTP ?? '',
      headers.Authorization ?? '',
      headers.Authorization?.slice(6) ?? '',
    ];
    const requestBody = JSON.stringify(payload);
    let result: Awaited<ReturnType<typeof send>>;
    try {
      result = await send(
        transport,
        baseUrls[environment] + path,
        {
          method,
          headers: {
            'Accept-Version': 'V2',
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...headers,
          },
          body: requestBody,
        },
        timeoutMs,
        signal,
        secrets,
      );
    } catch (error) {
      notify({
        environment,
        operation,
        phase: 'interrupted',
        outcomeUnknown: error instanceof ZatcaApiError && error.outcomeUnknown,
      });
      throw error;
    }
    const body = record(result.body);
    const responseSecrets = [
      body.binarySecurityToken,
      body.secret,
      body.clearedInvoice,
    ].filter((item): item is string => typeof item === 'string');
    const receipt: Receipt = {
      metadata: result.metadata,
      diagnostics: diagnostics(body, [...secrets, ...responseSecrets]),
    };
    notify({
      environment,
      operation,
      phase: 'response',
      metadata: { ...result.metadata },
    });
    return {
      body,
      receipt,
      status: result.metadata.httpStatus,
      malformed: result.malformed,
    };
  }

  type Exchange = Awaited<ReturnType<typeof call>>;

  function unexpected({ receipt, status, malformed }: Exchange): never {
    const uncertain =
      status < 200 ||
      status >= 500 ||
      status === 408 ||
      status === 428 ||
      status === 429 ||
      (status >= 200 && status < 300);
    throw new ZatcaApiError(
      (status >= 200 && status < 300) || (status === 428 && !malformed)
        ? 'invalid-response'
        : 'http',
      uncertain,
      receipt.metadata,
      receipt.diagnostics,
    );
  }

  function issued<Kind extends CsidKind>(
    exchange: Exchange,
    kind: Kind,
    complianceRequired = false,
  ): Csid<Kind> {
    const expectedStatus = complianceRequired ? 428 : 200;
    const expectedDisposition = complianceRequired ? 'NOT_COMPLIANT' : 'ISSUED';
    if (
      exchange.status === expectedStatus &&
      exchange.body.dispositionMessage === expectedDisposition
    ) {
      const csid = parseCsid(exchange.body, environment, kind);
      if (csid) return csid;
    }
    return unexpected(exchange);
  }

  async function submit(
    operation: 'checkCompliance' | 'clear' | 'report',
    input: InvoiceSubmission,
    csid: Csid,
    kind: CsidKind,
    headers: Record<string, string>,
    profile: 'standard' | 'simplified' | undefined,
    signal: AbortSignal | undefined,
  ) {
    const payload = invoicePayload(input, profile);
    const exchange = await call(
      operation,
      payload,
      { ...headers, Authorization: authorization(csid, kind) },
      signal,
      [csid.binarySecurityToken, csid.secret, input.xml],
    );
    return { ...exchange, uuid: payload.uuid };
  }

  return {
    async requestComplianceCsid(
      csr: string,
      otp: string,
      signal?: AbortSignal,
    ) {
      return issued(
        await call(
          'requestComplianceCsid',
          csrPayload(csr, otp),
          { OTP: otp },
          signal,
        ),
        'compliance',
      );
    },

    async checkCompliance(
      input: InvoiceSubmission,
      csid: Csid<'compliance'>,
      signal?: AbortSignal,
    ): Promise<ComplianceResult> {
      const exchange = await submit(
        'checkCompliance',
        input,
        csid,
        'compliance',
        {},
        undefined,
        signal,
      );
      const { status, body, receipt } = exchange;
      if (status === 200 && isPositiveValidation(body, receipt))
        return { ...receipt, status: 'compliant' };
      if (
        status === 400 &&
        receipt.diagnostics.some((entry) => entry.severity === 'error')
      )
        return { ...receipt, status: 'rejected' };
      return unexpected(exchange);
    },

    async requestProductionCsid(
      csid: Csid<'compliance'>,
      signal?: AbortSignal,
    ) {
      const exchange = await call(
        'requestProductionCsid',
        { compliance_request_id: csid.requestId },
        { Authorization: authorization(csid, 'compliance') },
        signal,
        [csid.binarySecurityToken, csid.secret],
      );
      return issued(exchange, 'production');
    },

    async renewProductionCsid(
      current: Csid<'production'>,
      csr: string,
      otp: string,
      signal?: AbortSignal,
    ): Promise<RenewalResult> {
      const exchange = await call(
        'renewProductionCsid',
        csrPayload(csr, otp),
        { OTP: otp, Authorization: authorization(current, 'production') },
        signal,
        [current.binarySecurityToken, current.secret],
      );
      if (exchange.status === 428)
        return {
          status: 'compliance-required',
          csid: issued(exchange, 'compliance', true),
        };
      return { status: 'renewed', csid: issued(exchange, 'production') };
    },

    async clear(
      input: InvoiceSubmission,
      csid: Csid<'production'>,
      signal?: AbortSignal,
    ): Promise<ClearanceResult> {
      const exchange = await submit(
        'clear',
        input,
        csid,
        'production',
        clearanceHeader(true),
        'standard',
        signal,
      );
      const { status, body, receipt } = exchange;
      if (status === 303) return { ...receipt, status: 'clearance-disabled' };
      if (status === 400 && body.clearanceStatus === 'NOT_CLEARED')
        return { ...receipt, status: 'rejected' };
      if (
        [200, 202, 208].includes(status) &&
        body.clearanceStatus === 'CLEARED' &&
        isPositiveValidation(body, receipt)
      ) {
        const clearedInvoiceBase64 = body.clearedInvoice;
        if (typeof clearedInvoiceBase64 === 'string') {
          try {
            const bytes = decodePayload(clearedInvoiceBase64, 3 * 1024 * 1024);
            const cleared = parseInvoiceXml(
              new TextDecoder('utf-8', { fatal: true }).decode(bytes),
            );
            if (cleared.header.UUID === exchange.uuid)
              return { ...receipt, status: 'cleared', clearedInvoiceBase64 };
          } catch {
            return unexpected(exchange);
          }
        }
      }
      return unexpected(exchange);
    },

    async report(
      input: InvoiceSubmission,
      csid: Csid<'production'>,
      settings: {
        readonly clearanceEnabled: boolean;
        readonly signal?: AbortSignal;
      },
    ): Promise<ReportingResult> {
      const exchange = await submit(
        'report',
        input,
        csid,
        'production',
        clearanceHeader(settings.clearanceEnabled),
        settings.clearanceEnabled ? 'simplified' : undefined,
        settings.signal,
      );
      const { status, body, receipt } = exchange;
      if (
        [200, 202].includes(status) &&
        body.reportingStatus === 'REPORTED' &&
        isPositiveValidation(body, receipt)
      )
        return { ...receipt, status: 'reported' };
      if (status === 400 && body.reportingStatus === 'NOT_REPORTED')
        return { ...receipt, status: 'rejected' };
      if (status === 409 && body.reportingStatus === 'NOT_REPORTED')
        return { ...receipt, status: 'duplicate' };
      return unexpected(exchange);
    },
  };
}
