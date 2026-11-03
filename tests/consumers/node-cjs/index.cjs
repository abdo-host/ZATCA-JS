const assert = require('node:assert/strict');
const { GenerateQrCode, encodeQrBase64 } = require('zatca');
const qrApi = require('zatca/qr');
const { arabic } = require('./phase1-golden.json');

(async () => {
  assert.equal(encodeQrBase64, qrApi.encodeQrBase64);
  assert.equal(encodeQrBase64(arabic.input), arabic.base64);
  assert.throws(() => encodeQrBase64({}), qrApi.ZatcaValidationError);
  const qr = new GenerateQrCode(
    'Example Shop',
    '300000000000003',
    '2023-07-17T12:00:00.000Z',
    115,
    15,
  );
  assert.ok(Buffer.isBuffer(await qr.getTLV()));
  assert.match(await qr.render(), /^data:image\/png;base64,/);
  assert.equal(qrApi.encodeBase64(qrApi.encodeUtf8('شركة')), '2LTYsdmD2Kk=');

  const failure = new Error('encoder failed');
  qr.toBase64 = async () => {
    throw failure;
  };
  await assert.rejects(qr.render(), failure);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
