import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createZatcaApi, ZatcaApiError } from '../../src/api/client.js';

const document = z.strictObject({
  file: z.string().min(1),
  invoiceHash: z.string().length(44),
});
const manifestSchema = z.strictObject({
  csrFile: z.string().min(1),
  compliance: z.array(document).min(1).max(6),
  clearance: document,
  reporting: document,
});

it('runs a caller-supplied test EGS through the Integration Sandbox', async () => {
  const manifestPath = process.env.ZATCA_SANDBOX_INPUT;
  const otp = process.env.ZATCA_SANDBOX_OTP;
  if (!manifestPath || !otp)
    throw new Error(
      'Set ZATCA_SANDBOX_INPUT and ZATCA_SANDBOX_OTP for the explicit Sandbox run',
    );

  const manifest = manifestSchema.safeParse(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );
  if (!manifest.success) throw new Error('Invalid Sandbox test manifest');

  const input = manifest.data;
  const load = (file: string) =>
    readFile(resolve(dirname(manifestPath), file), 'utf8');
  const loadInvoice = async ({
    file,
    invoiceHash,
  }: z.infer<typeof document>) => ({
    xml: await load(file),
    invoiceHash,
  });
  const api = createZatcaApi({ environment: 'sandbox' });

  // Load every input before requesting an OTP-consuming operation.
  const [csr, complianceInvoices, clearance, reporting] = await Promise.all([
    load(input.csrFile).then((pem) => Buffer.from(pem).toString('base64')),
    Promise.all(input.compliance.map(loadInvoice)),
    loadInvoice(input.clearance),
    loadInvoice(input.reporting),
  ]);
  let step = 'compliance CSID';
  try {
    const compliance = await api.requestComplianceCsid(csr, otp);
    step = 'compliance invoices';
    for (const invoice of complianceInvoices)
      expect((await api.checkCompliance(invoice, compliance)).status).toBe(
        'compliant',
      );
    step = 'production-class test CSID';
    const production = await api.requestProductionCsid(compliance);
    step = 'standard clearance';
    expect((await api.clear(clearance, production)).status).toBe('cleared');
    step = 'simplified reporting';
    expect(
      (await api.report(reporting, production, { clearanceEnabled: true }))
        .status,
    ).toBe('reported');
  } catch (error) {
    if (error instanceof ZatcaApiError)
      throw new Error(
        `Sandbox ${step} failed (${error.code}, HTTP ${error.metadata?.httpStatus ?? 'unavailable'})`,
      );
    throw error;
  }
});
