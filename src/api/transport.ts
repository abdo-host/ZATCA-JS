import type { Diagnostic } from './protocol.js';

export type ApiErrorCode =
  | 'invalid-input'
  | 'cancelled'
  | 'timeout'
  | 'transport'
  | 'invalid-response'
  | 'http';

export interface ResponseMetadata {
  readonly httpStatus: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
}

const messages: Record<ApiErrorCode, string> = {
  'invalid-input': 'Invalid ZATCA API input or configuration',
  cancelled: 'ZATCA API request cancelled',
  timeout: 'ZATCA API request timed out',
  transport: 'ZATCA API transport failed',
  'invalid-response': 'Unexpected ZATCA API response',
  http: 'ZATCA API returned an HTTP error',
};

export class ZatcaApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly outcomeUnknown = false,
    readonly metadata?: ResponseMetadata,
    readonly diagnostics: readonly Diagnostic[] = [],
  ) {
    super(messages[code]);
    this.name = 'ZatcaApiError';
  }
}

export type HttpTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

interface HttpResult {
  readonly metadata: ResponseMetadata;
  readonly body: unknown;
  readonly malformed: boolean;
}

const maxResponseBytes = 4 * 1024 * 1024;
const controlChars = /[\p{Cc}\p{Cf}]/gu;

function redact(text: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (value, secret) =>
      secret ? value.replaceAll(secret, '[redacted]') : value,
    text,
  );
}

function safeId(
  value: unknown,
  secrets: readonly string[],
): string | undefined {
  if (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_.:-]{1,128}$/.test(value) &&
    redact(value, secrets) === value
  )
    return value;
  return undefined;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function diagnostics(
  body: unknown,
  secrets: readonly string[],
): readonly Diagnostic[] {
  const root = record(body);
  const results = record(root.validationResults);
  const output: Diagnostic[] = [];
  function add(value: unknown, severity: Diagnostic['severity']) {
    const entries = Array.isArray(value) ? value : [value];
    for (const item of entries.slice(0, 100)) {
      const { code, category, message } = record(item);
      const safeCode = safeId(code, secrets);
      const safeCategory =
        typeof category === 'string'
          ? redact(category, secrets).replace(controlChars, ' ').slice(0, 128)
          : undefined;
      const safeMessage =
        typeof message === 'string'
          ? redact(message, secrets).replace(controlChars, ' ').slice(0, 2048)
          : undefined;
      if (safeCode || safeCategory || safeMessage)
        output.push({
          severity,
          ...(safeCode ? { code: safeCode } : {}),
          ...(safeCategory ? { category: safeCategory } : {}),
          ...(safeMessage ? { message: safeMessage } : {}),
        });
    }
  }
  add(results.infoMessages, 'info');
  add(results.warningMessages ?? root.warnings, 'warning');
  add(
    results.errorMessages ?? results.erroMessages ?? root.errors ?? root.erros,
    'error',
  );
  if (!output.length && (root.code || root.category)) add(root, 'error');
  return output;
}

function responseMetadata(
  headers: Headers,
  httpStatus: number,
  secrets: readonly string[],
) {
  const requestId = safeId(
    headers.get('x-request-id') ?? headers.get('x-correlation-id'),
    secrets,
  );
  const retryAfter = headers.get('retry-after');
  const retryAfterSeconds =
    retryAfter && /^\d{1,9}$/.test(retryAfter) ? Number(retryAfter) : undefined;
  return {
    httpStatus,
    ...(requestId ? { requestId } : {}),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

async function readResponse(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) return undefined;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal.aborted) {
    cancel();
    reader.releaseLock();
    return undefined;
  }
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let count = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxResponseBytes) throw new Error();
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text.trim() ? (JSON.parse(text) as unknown) : undefined;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

export async function send(
  transport: HttpTransport,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  secrets: readonly string[],
): Promise<HttpResult> {
  if (callerSignal?.aborted) throw new ZatcaApiError('cancelled');

  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const timeout = deadline.signal;
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeout])
    : timeout;
  let stop: (() => void) | undefined;
  let metadata: ResponseMetadata | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    stop = () =>
      reject(
        new ZatcaApiError(
          callerSignal?.aborted ? 'cancelled' : 'timeout',
          true,
          metadata,
        ),
      );
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    const exchange = async (): Promise<HttpResult> => {
      const response = await transport(url, {
        ...init,
        redirect: 'manual',
        signal,
      });
      metadata = responseMetadata(response.headers, response.status, secrets);
      try {
        return {
          metadata,
          body: await readResponse(response, signal),
          malformed: false,
        };
      } catch {
        return { metadata, body: undefined, malformed: true };
      }
    };
    return await Promise.race([exchange(), interrupted]);
  } catch {
    // A custom transport may throw arbitrary values containing credentials.
    if (signal.aborted)
      throw new ZatcaApiError(
        callerSignal?.aborted ? 'cancelled' : 'timeout',
        true,
        metadata,
      );
    throw new ZatcaApiError('transport', true, metadata);
  } finally {
    clearTimeout(timer);
    if (stop) signal.removeEventListener('abort', stop);
  }
}
