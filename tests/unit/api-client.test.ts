import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  type Csid,
  createZatcaApi,
  getCsidExpiry,
  type HttpTransport,
} from '../../src/api/client.js';

const token = btoa('test-only-certificate-placeholder');
const secret = 'synthetic-auth-secret';
const otp = '654321';
const csr = btoa(
  '-----BEGIN CERTIFICATE REQUEST-----\nQUJD\n-----END CERTIFICATE REQUEST-----\n',
);
const uuid = '36bfc762-c463-4bc5-bc6d-93c7d833a2af';
const invoiceHash = btoa('x'.repeat(32));

const compliance: Csid<'compliance'> = {
  environment: 'sandbox',
  kind: 'compliance',
  requestId: '101',
  binarySecurityToken: token,
  secret,
};
const production: Csid<'production'> = {
  ...compliance,
  kind: 'production',
  requestId: '102',
};
const issued = {
  requestID: 101,
  dispositionMessage: 'ISSUED',
  binarySecurityToken: token,
  secret,
};
const validationResults = {
  status: 'PASS',
  infoMessages: { code: 'XSD', message: 'Schema validated' },
  warningMessages: [],
  errorMessages: [],
};

function invoice(profile: 'standard' | 'simplified', code = '388') {
  const ns = 'urn:oasis:names:specification:ubl:schema:xsd:';
  const xml = `<Invoice xmlns="${ns}Invoice-2" xmlns:b="${ns}CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><b:UUID>${uuid}</b:UUID><b:InvoiceTypeCode name="${profile === 'standard' ? '01' : '02'}00000">${code}</b:InvoiceTypeCode>${profile === 'simplified' ? '<ds:Signature/>' : ''}</Invoice>`;
  return { xml, invoiceHash };
}

function responder(...responses: Response[]) {
  return vi.fn<HttpTransport>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  });
}

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, ...(headers ? { headers } : {}) });
}

function requestAt(transport: ReturnType<typeof responder>, index: number) {
  const [url, init] = transport.mock.calls[index] ?? [];
  if (!url || !init || typeof init.body !== 'string')
    throw new Error('Missing captured request');
  return {
    url,
    method: init.method,
    headers: new Headers(init.headers),
    body: JSON.parse(init.body),
    redirect: init.redirect,
  };
}

describe('ZATCA API contract', () => {
  it('sends compliance CSR, checks all supported document types and requests a production CSID', async () => {
    const transport = responder(
      json(issued),
      ...Array.from({ length: 6 }, () =>
        json({ validationResults, reportingStatus: 'REPORTED' }),
      ),
      json({ ...issued, requestID: '102' }),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    const credential = await api.requestComplianceCsid(csr, otp);
    expect(credential).toEqual(compliance);
    for (const profile of ['standard', 'simplified'] as const) {
      for (const code of ['388', '381', '383']) {
        const result = await api.checkCompliance(
          invoice(profile, code),
          credential,
        );
        expect(result.status).toBe('compliant');
        expect(result.diagnostics).toEqual([
          { severity: 'info', code: 'XSD', message: 'Schema validated' },
        ]);
      }
    }
    expect(await api.requestProductionCsid(credential)).toEqual(production);

    const base = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal';
    const first = requestAt(transport, 0);
    expect(first).toMatchObject({
      url: `${base}/compliance`,
      method: 'POST',
      body: { csr },
      redirect: 'manual',
    });
    expect(first.headers.get('OTP')).toBe(otp);
    expect(first.headers.get('Accept-Version')).toBe('V2');
    expect(first.headers.has('Authorization')).toBe(false);
    const check = requestAt(transport, 1);
    expect(check).toMatchObject({
      url: `${base}/compliance/invoices`,
      method: 'POST',
      body: {
        uuid,
        invoiceHash,
        invoice: Buffer.from(invoice('standard').xml).toString('base64'),
      },
    });
    expect(check.headers.get('Authorization')).toBe(
      `Basic ${btoa(`${token}:${secret}`)}`,
    );
    const last = requestAt(transport, 7);
    expect(last).toMatchObject({
      url: `${base}/production/csids`,
      method: 'POST',
      body: { compliance_request_id: '101' },
    });
    expect(last.headers.has('OTP')).toBe(false);
  });

  it('handles direct renewal and the distinct 428 compliance continuation', async () => {
    const transport = responder(
      json({ ...issued, requestID: 103 }),
      json(
        { ...issued, dispositionMessage: 'NOT_COMPLIANT', requestID: 104 },
        428,
      ),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    expect(await api.renewProductionCsid(production, csr, otp)).toMatchObject({
      status: 'renewed',
      csid: { kind: 'production', requestId: '103' },
    });
    const result = await api.renewProductionCsid(production, csr, otp);
    expect(result).toMatchObject({
      status: 'compliance-required',
      csid: { kind: 'compliance', requestId: '104' },
    });
    expect(requestAt(transport, 0)).toMatchObject({
      method: 'PATCH',
      url: expect.stringMatching(/\/production\/csids$/),
      body: { csr },
    });
    expect(requestAt(transport, 0).headers.get('OTP')).toBe(otp);
    expect(requestAt(transport, 0).headers.get('Authorization')).toBe(
      `Basic ${btoa(`${token}:${secret}`)}`,
    );
  });

  it('separates clearance, reporting warnings and duplicate outcomes', async () => {
    const standard = invoice('standard');
    const clearedInvoice = Buffer.from(standard.xml).toString('base64');
    const transport = responder(
      json(
        { clearanceStatus: 'CLEARED', validationResults, clearedInvoice },
        208,
      ),
      json(
        {
          reportingStatus: 'REPORTED',
          validationResults: {
            ...validationResults,
            status: 'WARNING',
            warningMessages: [{ code: 'BR-1', message: 'Sample warning' }],
          },
        },
        202,
      ),
      json(
        {
          reportingStatus: 'NOT_REPORTED',
          validationResults: {
            status: 'ERROR',
            errorMessages: [{ message: 'Already reported' }],
          },
        },
        409,
      ),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    const cleared = await api.clear(standard, production);
    expect(cleared).toMatchObject({
      status: 'cleared',
      clearedInvoiceBase64: clearedInvoice,
    });
    expect(requestAt(transport, 0).url).toMatch(
      /\/invoices\/clearance\/single$/,
    );
    expect(requestAt(transport, 0).headers.get('Clearance-Status')).toBe('1');
    const reported = await api.report(
      invoice('simplified', '381'),
      production,
      { clearanceEnabled: true },
    );
    expect(reported).toMatchObject({
      status: 'reported',
      diagnostics: expect.arrayContaining([
        { severity: 'warning', code: 'BR-1', message: 'Sample warning' },
      ]),
    });
    expect(requestAt(transport, 1).url).toMatch(
      /\/invoices\/reporting\/single$/,
    );
    const duplicate = await api.report(invoice('simplified'), production, {
      clearanceEnabled: true,
    });
    expect(duplicate.status).toBe('duplicate');
  });

  it('requires an explicit reporting call after clearance is disabled and never follows Location', async () => {
    const transport = responder(
      json({ message: 'Clearance is disabled' }, 303, {
        Location: 'https://unexpected.invalid/',
      }),
      json({ reportingStatus: 'REPORTED', validationResults }),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    const document = invoice('standard');
    expect((await api.clear(document, production)).status).toBe(
      'clearance-disabled',
    );
    expect(transport).toHaveBeenCalledTimes(1);
    expect(requestAt(transport, 0).redirect).toBe('manual');
    expect(
      (await api.report(document, production, { clearanceEnabled: false }))
        .status,
    ).toBe('reported');
    expect(requestAt(transport, 1).headers.get('Clearance-Status')).toBe('0');
  });

  it('rejects scope mixing, unsupported documents, unsigned simplified XML and mismatched profiles before sending', async () => {
    const transport = responder();
    const api = createZatcaApi({ environment: 'production', transport });
    await expect(
      api.clear(invoice('standard'), production),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    const sandbox = createZatcaApi({ environment: 'sandbox', transport });
    await expect(
      sandbox.clear(invoice('simplified'), production),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      sandbox.report(
        {
          ...invoice('simplified'),
          xml: invoice('simplified').xml.replace('<ds:Signature/>', ''),
        },
        production,
        { clearanceEnabled: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      sandbox.report(invoice('simplified', '386'), production, {
        clearanceEnabled: true,
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(
      sandbox.requestProductionCsid({
        ...compliance,
        environment: 'production',
      }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(() =>
      createZatcaApi({ environment: 'unknown' as 'sandbox', transport }),
    ).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('uses the fixed production route only when the client and credential explicitly select it', async () => {
    const transport = responder(
      json({ validationResults, reportingStatus: 'REPORTED' }),
    );
    const api = createZatcaApi({ environment: 'production', transport });
    const result = await api.report(
      invoice('simplified'),
      { ...production, environment: 'production' },
      { clearanceEnabled: true },
    );
    expect(result.status).toBe('reported');
    expect(requestAt(transport, 0).url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/invoices/reporting/single',
    );
  });

  it('rejects success-shaped responses that lack validation or refer to a different invoice', async () => {
    const standard = invoice('standard');
    const transport = responder(
      json({ reportingStatus: 'REPORTED' }, 202),
      json({
        clearanceStatus: 'CLEARED',
        validationResults,
        clearedInvoice: btoa(
          standard.xml.replace(uuid, '41e4a4e9-5c7e-4619-94ea-202d3b5e4a39'),
        ),
      }),
      new Response('<html>bad gateway</html>', { status: 200 }),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    const error = { code: 'invalid-response', outcomeUnknown: true };
    await expect(
      api.report(invoice('simplified'), production, { clearanceEnabled: true }),
    ).rejects.toMatchObject(error);
    await expect(api.clear(standard, production)).rejects.toMatchObject(error);
    await expect(api.requestComplianceCsid(csr, otp)).rejects.toMatchObject(
      error,
    );
  });

  it('retains validation errors and limits audit metadata to redacted fields', async () => {
    const event = vi.fn();
    const transport = responder(
      json(
        {
          reportingStatus: 'NOT_REPORTED',
          validationResults: {
            status: 'ERROR',
            errorMessages: [
              { code: 'BR-KSA', message: `Bad signature \n ${secret}` },
            ],
          },
        },
        400,
        { 'x-request-id': 'safe-request-1' },
      ),
      json(
        { errors: [{ code: 'INVALID_CSR', message: `Invalid ${otp} ${csr}` }] },
        400,
        { 'x-request-id': otp },
      ),
    );
    const api = createZatcaApi({
      environment: 'sandbox',
      transport,
      onEvent: event,
    });
    const rejected = await api.report(invoice('simplified'), production, {
      clearanceEnabled: true,
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      diagnostics: [{ code: 'BR-KSA', message: 'Bad signature   [redacted]' }],
      metadata: { requestId: 'safe-request-1' },
    });
    await expect(api.requestComplianceCsid(csr, otp)).rejects.toMatchObject({
      code: 'http',
      outcomeUnknown: false,
      metadata: { httpStatus: 400 },
      diagnostics: [
        { code: 'INVALID_CSR', message: 'Invalid [redacted] [redacted]' },
      ],
    });
    expect(event).toHaveBeenCalledTimes(2);
    expect(event.mock.calls[1]?.[0]).toEqual({
      environment: 'sandbox',
      operation: 'requestComplianceCsid',
      phase: 'response',
      metadata: { httpStatus: 400 },
    });
  });

  it('does not retry ambiguous responses or transport failures', async () => {
    const transport = responder(
      json({}, 429, { 'Retry-After': '60' }),
      json({}, 503),
    );
    const api = createZatcaApi({ environment: 'sandbox', transport });
    const submit = () =>
      api.report(invoice('simplified'), production, { clearanceEnabled: true });
    await expect(submit()).rejects.toMatchObject({
      code: 'http',
      outcomeUnknown: true,
      metadata: { httpStatus: 429, retryAfterSeconds: 60 },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(submit()).rejects.toMatchObject({
      code: 'http',
      outcomeUnknown: true,
      metadata: { httpStatus: 503 },
    });
    expect(transport).toHaveBeenCalledTimes(2);
    transport.mockRejectedValueOnce(new Error(`socket: ${secret}`));
    await expect(submit()).rejects.toThrow('ZATCA API transport failed');
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('bounds slow response bodies and honors cancellation before and during requests', async () => {
    const cancelBody = vi.fn();
    const transport = responder(
      new Response(new ReadableStream({ cancel: cancelBody })),
    );
    const api = createZatcaApi({
      environment: 'sandbox',
      transport,
      timeoutMs: 25,
    });
    await expect(
      api.requestComplianceCsid(csr, otp, AbortSignal.abort()),
    ).rejects.toMatchObject({ code: 'cancelled', outcomeUnknown: false });
    expect(transport).not.toHaveBeenCalled();
    await expect(api.requestComplianceCsid(csr, otp)).rejects.toMatchObject({
      code: 'timeout',
      outcomeUnknown: true,
    });
    expect(cancelBody).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    transport.mockImplementationOnce(async () => new Promise(() => undefined));
    const pending = api.requestComplianceCsid(csr, otp, controller.signal);
    controller.abort('sensitive reason');
    await expect(pending).rejects.toMatchObject({
      code: 'cancelled',
      outcomeUnknown: true,
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('reads a certificate expiry without scheduling renewal', () => {
    const pem = readFileSync(
      new URL('../fixtures/synthetic-leaf.pem', import.meta.url),
    );
    const csid = { ...production, binarySecurityToken: pem.toString('base64') };
    expect(getCsidExpiry(csid).toISOString()).toBe('2030-01-01T00:00:00.000Z');
    expect(() => getCsidExpiry(production)).toThrow('Invalid ZATCA API input');
  });
});
