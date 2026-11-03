import type { Buffer } from 'node:buffer';
import root, { GenerateQrCode, type LegacyRenderOptions } from 'zatca';
import { decodeBase64, decodeUtf8 } from 'zatca/qr';

const legacy: typeof GenerateQrCode = root.GenerateQrCode;
const tlv: Promise<Buffer | string> = new legacy().getTLV();
const options: LegacyRenderOptions = { width: 256, errorCorrectionLevel: 'H' };
const image: Promise<string> = new GenerateQrCode().render(options);
const seller: string = decodeUtf8(decodeBase64('2LTYsdmD2Kk='));
void tlv;
void image;
void seller;
