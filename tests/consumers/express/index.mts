import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { encodeQrBase64, type QrPhase1Input } from 'zatca/qr';
import { qrToPngBytes, type QrRenderOptions } from 'zatca/qr/render';
import fixture from './phase1-golden.json' with { type: 'json' };

test('Express TypeScript serves PNG from the packed package', async () => {
  const input: QrPhase1Input = fixture.arabic.input;
  const options: QrRenderOptions = { width: 320 };
  const payload = encodeQrBase64(input);
  assert.equal(payload, fixture.arabic.base64);
  const app = express();
  app.get('/qr', async (_req, res) => {
    res.type('png').send(Buffer.from(await qrToPngBytes(payload, options)));
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/qr`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 320);
  } finally {
    server.close();
  }
});
