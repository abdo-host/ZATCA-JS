import assert from 'node:assert/strict';
import root, { GenerateQrCode } from 'zatca';
import { decodeBase64, decodeUtf8 } from 'zatca/qr';

assert.equal(root.GenerateQrCode, GenerateQrCode);
const qr = new GenerateQrCode(
  'Example Shop',
  '300000000000003',
  '2023-07-17T12:00:00.000Z',
  '115',
  '15',
);
assert.ok(Buffer.isBuffer(await qr.getTLV()));
assert.match(await qr.render(), /^data:image\/png;base64,/);
assert.equal(decodeUtf8(decodeBase64('2LTYsdmD2Kk=')), 'شركة');
