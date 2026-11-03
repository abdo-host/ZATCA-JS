# Tatwerat ZATCA JS

Generate QR payloads for Saudi e-invoicing in JavaScript.

مكتبة JavaScript لتوليد رموز QR للفواتير الإلكترونية السعودية.

## Published package / الإصدار المنشور

**npm `zatca@1.0.2`** provides the legacy Phase 1 QR generator for Node.js.

الإصدار المنشور يوفّر مولّد QR للمرحلة الأولى على Node.js. مثال الاستخدام التالي خاص بالإصدار المنشور.

```sh
npm install zatca@1.0.2 qrcode@1.5.4
```

```js
const { GenerateQrCode } = require('zatca');

async function main() {
  const qr = new GenerateQrCode(
    'Example Store',
    '300000000000003',
    '2026-11-03T12:30:00.000Z',
    230.00,
    30.00,
  );

  const base64 = await qr.toBase64();
  const tlv = await qr.getTLV();
  const pngDataUrl = await qr.render();

  console.log({ base64, tlvBytes: tlv.length, pngDataUrl });
}

main().catch(console.error);
```

| Method / الدالة | Result / الناتج |
| --- | --- |
| `toBase64()` | Base64 QR payload / حمولة الرمز بترميز Base64 |
| `getTLV()` | Raw TLV bytes / بايتات TLV |
| `render()` | PNG data URL / رابط بيانات لصورة PNG |

## Development preview / نسخة التطوير

The source repository builds a private `2.0.0-dev.0` tarball. The preview provides Phase 1 UTF-8 encoding, decoding, validation and QR rendering through `zatca/qr` and `zatca/qr/render`. These subpaths are available from the development tarball.

المستودع يحتوي على نسخة تطوير محلية `2.0.0-dev.0`. فيها دعم UTF-8، وتوليد وقراءة وفحص حمولة QR للمرحلة الأولى، ورسم QR. المسارات الجديدة في ملف الحزمة المبني من المستودع.

Build and verify on Node.js 22 or later.

أوامر بناء وفحص نسخة التطوير على Node.js 22 أو أحدث.

```sh
npm ci
npm run build
npm test
npm run package:verify
npm pack
```

Install the resulting tarball in a separate project for evaluation.

ثبّت ملف الحزمة الناتج داخل مشروع منفصل للتجربة.

```sh
npm install ./zatca-2.0.0-dev.0.tgz
```

```js
import { decodeQrBase64, encodeQrBase64 } from 'zatca/qr';

const payload = encodeQrBase64({
  sellerName: 'شركة مدار التجريبية',
  vatNumber: '300000000000003',
  issuedAt: '2026-11-03T15:30:00+03:00',
  invoiceTotal: '230.00',
  vatTotal: '30.00',
});

console.log(decodeQrBase64(payload).valid);
```

## Invoice integration status / حالة ربط الفواتير

The repository includes internal Node.js code for unsigned UBL drafts, canonical hashes and submitting prepared XML. Reporting and clearance were exercised against ZATCA Sandbox with prepared XML examples. The invoice APIs remain internal, and the complete flow from invoice data through signing and submission remains pending release verification.

المستودع فيه كود Node داخلي لتوليد مسودة UBL غير موقّعة، وحساب الهاش، وإرسال XML مجهّز. جرّبنا الإبلاغ والتخليص على Sandbox باستخدام XML جاهز. واجهات الفواتير لسه داخلية، ومسار بيانات الفاتورة إلى التوقيع والإرسال يحتاج تحقق كامل قبل إتاحته للمستخدمين.

- [Phase 1 API and examples / أمثلة QR](docs/m2-phase1-qr.md)
- [Migration guide / دليل الترقية](docs/migration-v1-v2.md)
- [Invoice integration guide / دليل ربط الفواتير](docs/invoice-integration.html)
- [Sandbox test results / نتائج الاختبار](docs/m7-zatca-api.md#verification)

## License / الترخيص

MIT.
