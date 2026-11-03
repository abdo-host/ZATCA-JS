import { encodeQrBase64 } from 'zatca/qr';
import { qrToDataUrl, qrToPngBytes, qrToSvg } from 'zatca/qr/render';
import fixture from './phase1-golden.json';

const payload = encodeQrBase64(fixture.arabic.input);
const options = { width: 320 };
const [svg, png, url] = await Promise.all([
  qrToSvg(payload, options),
  qrToPngBytes(payload, options),
  qrToDataUrl(payload, options),
]);
if (
  !svg.includes('width="320"') ||
  new DataView(png.buffer).getUint32(16) !== 320 ||
  !url.startsWith('data:image/png;base64,')
) {
  throw new Error('Browser QR image rendering failed');
}
const output = document.querySelector('output');
if (output) output.value = url;
