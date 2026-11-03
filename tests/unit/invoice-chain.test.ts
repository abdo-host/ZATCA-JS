import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { initialPreviousInvoiceHash } from '../../src/core/invoice-digest.js';
import {
  appendInvoice,
  type InvoiceChainEntry,
  type InvoiceChainLink,
  type InvoiceChainScope,
  type InvoiceChainStore,
  type InvoiceChainTransaction,
} from '../../src/crypto/invoice-chain.js';

const scope = { environment: 'sandbox', egsId: 'device-1' } as const;

function digest(text: string): string {
  return createHash('sha256').update(text).digest('base64');
}

function request(issuanceId: string, intent = issuanceId) {
  return { issuanceId, intentHash: digest(intent) };
}

async function prepare(link: InvoiceChainLink) {
  const xml = `<fixture counter="${link.invoiceCounter}">${link.previousInvoiceHash}</fixture>`;
  return { xml, invoiceHash: digest(xml) };
}

function mockStore() {
  const entries = new Map<string, InvoiceChainEntry[]>();
  const queues = new Map<string, Promise<unknown>>();
  let loseNextCommitResponse = false;
  let failNextAppend = false;

  const store: InvoiceChainStore = {
    async transaction<T>(
      { environment, egsId }: InvoiceChainScope,
      task: (transaction: InvoiceChainTransaction) => Promise<T>,
    ): Promise<T> {
      const key = JSON.stringify([environment, egsId]);
      const run = (queues.get(key) ?? Promise.resolve()).then(async () => {
        const staged = [...(entries.get(key) ?? [])];
        const result = await task({
          readHead: async () => staged.at(-1),
          find: async (id) => staged.find((entry) => entry.issuanceId === id),
          append: async (entry) => {
            staged.push(entry);
            if (failNextAppend) {
              failNextAppend = false;
              throw new Error('Append failed after staging');
            }
          },
        });
        entries.set(key, staged);
        if (loseNextCommitResponse) {
          loseNextCommitResponse = false;
          throw new Error('Commit response lost');
        }
        return result;
      });
      queues.set(
        key,
        run.catch(() => undefined),
      );
      return run;
    },
  };
  return {
    store,
    failAppend() {
      failNextAppend = true;
    },
    loseCommitResponse() {
      loseNextCommitResponse = true;
    },
  };
}

it('serializes concurrent requests per environment and EGS and links consecutive hashes', async () => {
  const { store } = mockStore();
  const entries = await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      appendInvoice(store, scope, request(String(index)), prepare),
    ),
  );
  const genesisHex = createHash('sha256').update('0').digest('hex');
  expect(entries[0]?.previousInvoiceHash).toBe(btoa(genesisHex));
  entries.forEach((entry, index) => {
    expect(entry.invoiceCounter).toBe(String(index + 1));
    expect(entry.previousInvoiceHash).toBe(
      entries[index - 1]?.invoiceHash ?? initialPreviousInvoiceHash,
    );
  });
  for (const other of [
    { ...scope, egsId: 'device-2' },
    { ...scope, environment: 'simulation' },
  ] as const) {
    const entry = await appendInvoice(store, other, request('0'), prepare);
    expect(entry.invoiceCounter).toBe('1');
    expect(entry.previousInvoiceHash).toBe(initialPreviousInvoiceHash);
  }
});

it('replays a concurrent issuance ID once and rejects conflicting material inputs', async () => {
  const { store } = mockStore();
  const build = vi.fn(prepare);
  const input = request('same');
  const [first, second] = await Promise.all([
    appendInvoice(store, scope, input, build),
    appendInvoice(store, scope, input, build),
  ]);
  expect(first).toEqual(second);
  expect(build).toHaveBeenCalledTimes(1);
  await expect(
    appendInvoice(store, scope, request('same', 'changed'), build),
  ).rejects.toThrow('different inputs');
  expect(build).toHaveBeenCalledTimes(1);
});

it('leaves failed preparation uncommitted and recovers a committed entry after a lost response', async () => {
  const fixture = mockStore();
  const { store } = fixture;
  await expect(
    appendInvoice(store, scope, request('invalid'), async () => ({
      xml: '<fixture/>',
      invoiceHash: initialPreviousInvoiceHash,
    })),
  ).rejects.toThrow('Invalid prepared invoice');

  fixture.failAppend();
  await expect(
    appendInvoice(store, scope, request('interrupted'), prepare),
  ).rejects.toThrow('Append failed after staging');

  const build = vi.fn(prepare);
  fixture.loseCommitResponse();
  await expect(
    appendInvoice(store, scope, request('original'), build),
  ).rejects.toThrow('Commit response lost');
  const original = await appendInvoice(
    store,
    scope,
    request('original'),
    build,
  );
  expect(original.invoiceCounter).toBe('1');
  expect(build).toHaveBeenCalledTimes(1);

  // A remote rejection happens after commit. A correction is a new issuance.
  const correction = await appendInvoice(
    store,
    scope,
    request('corrected'),
    prepare,
  );
  expect(correction.invoiceCounter).toBe('2');
  expect(correction.previousInvoiceHash).toBe(original.invoiceHash);
  expect(await appendInvoice(store, scope, request('original'), build)).toEqual(
    original,
  );
});
