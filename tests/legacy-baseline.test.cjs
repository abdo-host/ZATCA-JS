const assert = require('node:assert/strict');
const { test } = require('node:test');

const { GenerateQrCode } = require(process.env.ZATCA_LEGACY_ENTRY || '../index.js');
const { ascii, arabic, invalid } = require('./fixtures/legacy-v1.json');

test('v1 exports the positional constructor and resolves to the ASCII TLV Buffer', async () => {
    const qr = new GenerateQrCode(...ascii.args);
    const result = qr.getTLV();
    assert.ok(result instanceof Promise);
    const tlv = await result;
    assert.ok(Buffer.isBuffer(tlv));
    assert.equal(tlv.toString('hex'), ascii.tlvHex);
});

test('v1 resolves to the exact ASCII fixture Base64', async () => {
    const qr = new GenerateQrCode(...ascii.args);
    const result = qr.toBase64();
    assert.ok(result instanceof Promise);
    assert.equal(await result, ascii.base64);
});

test('v1 renders a PNG data URL by default in Node', async () => {
    const qr = new GenerateQrCode(...ascii.args);
    const result = qr.render();
    assert.ok(result instanceof Promise);
    const [header, data] = (await result).split(',');
    assert.equal(header, `data:${ascii.renderMime};base64`);

    const png = Buffer.from(data, 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
    assert.equal(png.readUInt32BE(16), ascii.renderSize);
    assert.equal(png.readUInt32BE(20), ascii.renderSize);
});

// These tests capture defects in v1 for comparison during the migration.
test('v1 incorrectly counts the Arabic seller in UTF-16 code units', async () => {
    const qr = new GenerateQrCode(arabic.seller, ...ascii.args.slice(1));
    const tlv = await qr.getTLV();
    assert.equal(tlv.toString('hex'), arabic.legacyTlvHex);
    assert.equal(tlv[1], 4);
    assert.equal(Buffer.byteLength(arabic.seller, 'utf8'), 8);
});

test('v1 wraps a 256-byte seller length to zero and keeps the full value', async () => {
    const qr = new GenerateQrCode('A'.repeat(256), ...ascii.args.slice(1));
    const tlv = await qr.getTLV();
    assert.deepEqual([...tlv.subarray(0, 2)], [1, 0]);
    assert.equal(tlv.subarray(2, 258).toString('ascii'), 'A'.repeat(256));
    assert.equal(tlv[258], 2);
});

test('v1 resolves invalid invoice data to HTML and still renders an image', async () => {
    const qr = new GenerateQrCode(invalid.seller, ...ascii.args.slice(1));
    assert.equal(await qr.getTLV(), invalid.legacyError);
    assert.equal(await qr.toBase64(), invalid.legacyError);
    assert.match(await qr.render(), /^data:image\/png;base64,/);
});
