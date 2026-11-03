import assert from 'node:assert/strict';
import root, { encodeQrBase64, GenerateQrCode } from 'zatca';
import {
  decodeQrBase64,
  encodeQrBase64 as subpathEncode,
  ZatcaValidationError,
} from 'zatca/qr';
import fixture from './phase1-golden.json' with { type: 'json' };

assert.equal(root.GenerateQrCode, GenerateQrCode);
assert.equal(encodeQrBase64, subpathEncode);
assert.equal(encodeQrBase64(fixture.arabic.input), fixture.arabic.base64);
assert.throws(() => encodeQrBase64({}), ZatcaValidationError);
const qr = new GenerateQrCode(
  'Example Shop',
  '300000000000003',
  '2023-07-17T12:00:00.000Z',
  '115',
  '15',
);
assert.ok(Buffer.isBuffer(await qr.getTLV()));
assert.match(await qr.render(), /^data:image\/png;base64,/);
assert.deepEqual(
  decodeQrBase64(fixture.arabic.base64).fields,
  fixture.arabic.input,
);
