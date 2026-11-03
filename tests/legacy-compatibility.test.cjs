const assert = require('node:assert/strict');
const { test } = require('node:test');
const { GenerateQrCode } = require('zatca');
const { ZatcaValidationError } = require('zatca/qr');
const { ascii, arabic } = require('./fixtures/legacy-v1.json');

test('keeps Promise, Buffer and exact ASCII Base64 contracts', async () => {
  const qr = new GenerateQrCode(...ascii.args);
  const tlv = qr.getTLV();
  const base64 = qr.toBase64();
  assert.ok(tlv instanceof Promise);
  assert.ok(base64 instanceof Promise);
  assert.ok(Buffer.isBuffer(await tlv));
  assert.equal((await tlv).toString('hex'), ascii.tlvHex);
  assert.equal(await base64, ascii.base64);
});

test('keeps the default Node PNG MIME type and geometry', async () => {
  const qr = new GenerateQrCode(...ascii.args);
  const rendered = qr.render();
  assert.ok(rendered instanceof Promise);
  const [mime, payload] = (await rendered).split(',');
  assert.equal(mime, 'data:image/png;base64');
  const png = Buffer.from(payload, 'base64');
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), ascii.renderSize);
  assert.equal(png.readUInt32BE(20), ascii.renderSize);
  assert.match(
    await qr.render({ type: 'image/jpeg', width: 256 }),
    /^data:image\/png;base64,/,
  );
});

test('corrects Arabic lengths and accepts valid offset timestamps and decimal strings', async () => {
  const qr = new GenerateQrCode(
    arabic.seller,
    ascii.args[1],
    '2024-02-29T15:30:00+03:00',
    '115.00',
    '15.00',
  );
  const bytes = await qr.getTLV();
  assert.equal(bytes.subarray(0, 10).toString('hex'), '0108d8b4d8b1d983d8a9');
  assert.equal(await qr.toBase64(), bytes.toString('base64'));
});

test('rejects invalid legacy inputs with typed errors across all three methods', async () => {
  for (const sellerName of ['', 'A'.repeat(256)]) {
    const qr = new GenerateQrCode(sellerName, ...ascii.args.slice(1));
    await assert.rejects(qr.getTLV(), ZatcaValidationError);
    await assert.rejects(qr.toBase64(), ZatcaValidationError);
    await assert.rejects(qr.render(), ZatcaValidationError);
  }
});
