const assert = require('node:assert/strict');
const { once } = require('node:events');
const { test } = require('node:test');
const express = require('express');
const { encodeQrBase64 } = require('zatca');
const { qrToSvg } = require('zatca/qr/render');
const { arabic } = require('./phase1-golden.json');

test('Express CommonJS serves SVG from the packed package', async () => {
  const payload = encodeQrBase64(arabic.input);
  assert.equal(payload, arabic.base64);
  const app = express();
  app.get('/qr', async (_req, res) => {
    res.type('svg').send(await qrToSvg(payload, { width: 320 }));
  });
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/qr`,
      { signal: AbortSignal.timeout(5000) },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml/);
    assert.match(await response.text(), /^<svg .*width="320"/);
  } finally {
    server.close();
  }
});
