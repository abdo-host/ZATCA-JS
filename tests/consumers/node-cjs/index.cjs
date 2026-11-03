const assert = require('node:assert/strict');
const { GenerateQrCode } = require('zatca');
const { encodeBase64, encodeUtf8 } = require('zatca/qr');

(async () => {
  assert.deepEqual(Object.keys(require('zatca')), ['GenerateQrCode']);
  const qr = new GenerateQrCode(
    'Example Shop',
    '300000000000003',
    '2023-07-17T12:00:00.000Z',
    115,
    15,
  );
  assert.ok(Buffer.isBuffer(await qr.getTLV()));
  assert.match(await qr.render(), /^data:image\/png;base64,/);
  assert.equal(encodeBase64(encodeUtf8('شركة')), '2LTYsdmD2Kk=');

  const failure = new Error('encoder failed');
  qr.toBase64 = async () => {
    throw failure;
  };
  await assert.rejects(qr.render(), failure);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
