import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { createZatcaApi, ZatcaApiError } from '../../src/api/client.js';

const manifestPath = process.env.ZATCA_SANDBOX_RENEWAL_INPUT;
const manifestSchema = z.strictObject({
  requestId: z.string().regex(/^\d{1,32}$/),
  tokenFile: z.string().min(1),
  secretFile: z.string().min(1),
  csrFile: z.string().min(1),
  expectedStatus: z.enum(['renewed', 'compliance-required']),
});

it.skipIf(!manifestPath)('runs an explicit Sandbox renewal case', async () => {
  const otp = process.env.ZATCA_SANDBOX_RENEWAL_OTP;
  if (!manifestPath || !otp)
    throw new Error(
      'Set ZATCA_SANDBOX_RENEWAL_INPUT and ZATCA_SANDBOX_RENEWAL_OTP',
    );

  const parsed = manifestSchema.safeParse(
    JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
  );
  if (!parsed.success) throw new Error('Invalid Sandbox renewal manifest');
  const input = parsed.data;
  const load = (file: string) =>
    readFile(resolve(dirname(manifestPath), file), 'utf8');
  const [token, secret, pem] = await Promise.all([
    load(input.tokenFile),
    load(input.secretFile),
    load(input.csrFile),
  ]);

  const api = createZatcaApi({ environment: 'sandbox' });
  try {
    const result = await api.renewProductionCsid(
      {
        environment: 'sandbox',
        kind: 'production',
        requestId: input.requestId,
        binarySecurityToken: token.trim(),
        secret: secret.trim(),
      },
      Buffer.from(pem).toString('base64'),
      otp,
    );
    expect(result.status).toBe(input.expectedStatus);
  } catch (error) {
    if (error instanceof ZatcaApiError)
      throw new Error(
        `Sandbox renewal failed (${error.code}, HTTP ${error.metadata?.httpStatus ?? 'unavailable'})`,
      );
    throw error;
  }
});
