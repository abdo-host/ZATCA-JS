import { decodeQrBase64, encodeQrBase64, type QrPhase1Input } from 'zatca/qr';
import fixture from './phase1-golden.json';

const input: QrPhase1Input = fixture.arabic.input;
const encoded = encodeQrBase64(input);
const result = decodeQrBase64(encoded);
if (
  encoded !== fixture.arabic.base64 ||
  !result.valid ||
  result.fields.sellerName !== input.sellerName
) {
  throw new Error('Portable Phase 1 QR round-trip failed');
}
const output = document.querySelector('output');
if (output) output.value = encoded;
