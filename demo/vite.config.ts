import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vite';
import { z } from 'zod';
import { ZatcaValidationError } from '../src/core/errors.js';
import { createDemoInvoice } from './invoice.js';

const input = z.strictObject({
  profile: z.enum(['standard', 'simplified']),
  seller: z.string().max(200),
  vatNumber: z.string().max(20),
  quantity: z.string().max(24),
  unitPrice: z.string().max(24),
});

function send(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function draft(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    send(response, 405, {});
    return;
  }
  if (request.headers['content-type'] !== 'application/json') {
    send(response, 415, {});
    return;
  }

  try {
    let size = 0;
    const chunks: Buffer[] = [];
    // Keep the socket open long enough to return a useful size error.
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > 4096) {
        send(response, 413, {});
        request.resume();
        return;
      }
      chunks.push(chunk);
    }
    const parsed = input.safeParse(
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
    );
    if (!parsed.success) {
      send(response, 400, { path: parsed.error.issues[0]?.path.join('.') });
      return;
    }
    send(response, 200, createDemoInvoice(parsed.data));
  } catch (error) {
    if (error instanceof ZatcaValidationError) {
      send(response, 422, { path: error.issues[0]?.path });
      return;
    }
    send(response, error instanceof SyntaxError ? 400 : 500, {});
  }
}

function middleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  if (request.url === '/api/draft') void draft(request, response);
  else next();
}

export default defineConfig({
  plugins: [
    {
      name: 'zatca-local-draft',
      configureServer(server) {
        server.middlewares.use(middleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(middleware);
      },
    },
  ],
});
