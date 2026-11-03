const assert = require('node:assert/strict');

assert.throws(() => require('zatca'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
assert.throws(() => require('zatca/crypto'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
assert.throws(() => require('zatca/api'), {
  code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
});
assert.equal(require('zatca/qr').decodeUtf8(Uint8Array.of(97)), 'a');
