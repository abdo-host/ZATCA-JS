import type { Buffer } from 'node:buffer';
import root = require('zatca');
import qr = require('zatca/qr');

const tlv: Promise<Buffer | string> = new root.GenerateQrCode().getTLV();
const payload: string = qr.encodeBase64(qr.encodeUtf8('شركة'));
void tlv;
void payload;
