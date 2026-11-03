import { decodeBase64, decodeUtf8, encodeBase64, encodeUtf8 } from 'zatca/qr';

const seller = 'شركة';
const result = decodeUtf8(decodeBase64(encodeBase64(encodeUtf8(seller))));
if (result !== seller)
  throw new Error('Portable UTF-8/Base64 round-trip failed');
const output = document.querySelector('output');
if (output) output.value = result;
