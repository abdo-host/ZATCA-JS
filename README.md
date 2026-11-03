# Tatwerat ZATCA JS

Generate QR payloads for Saudi e-invoicing in JavaScript.

مكتبة JavaScript لتوليد رموز QR للفواتير الإلكترونية السعودية.

## Manual / خطوات الاستخدام

- [Use the published QR generator / استخدم مولّد QR المنشور](#published-package--الإصدار-المنشور)
- [Show a QR on a web page / اعرض QR في صفحة](#development-preview--نسخة-التطوير)
- [Work with invoices and XML / اشتغل ببيانات الفاتورة وXML](#invoice-integration--ربط-الفواتير)
- [API Reference / مرجع الدوال](#api-reference--مرجع-الدوال)

### Published package / الإصدار المنشور

**Stable npm release `zatca@1.0.2`** provides the legacy Phase 1 QR generator for Node.js.

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

To display the PNG in a web app, pass `pngDataUrl` to the frontend and use it as the image's `src`.

لعرض الصورة، استخدم قيمة `pngDataUrl` كـ`src` للـ`<img>` في الواجهة.

### Development preview / نسخة التطوير

The `next` tag selects the `2.0.0-dev.0` QR preview. It provides Phase 1 UTF-8 encoding, decoding, validation and QR rendering through `zatca/qr` and `zatca/qr/render`.

الوسم `next` يثبّت النسخة التجريبية `2.0.0-dev.0`. فيها دعم UTF-8، وتوليد وقراءة وفحص حمولة QR للمرحلة الأولى، ورسم QR.

```sh
npm install zatca@next
```

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

In a browser app, add an image element and give it the renderer's data URL.

في تطبيق المتصفح، أضف عنصر الصورة واستعمل رابط البيانات الناتج كـ`src`.

```html
<img id="invoice-qr" alt="Invoice QR" width="180" height="180">
```

```js
import { encodeQrTlv, encodeBase64 } from 'zatca/qr';
import { qrToDataUrl } from 'zatca/qr/render';

const fields = {
  sellerName: 'شركة مدار التجريبية',
  vatNumber: '300000000000003',
  issuedAt: '2026-11-03T15:30:00+03:00',
  invoiceTotal: '230.00',
  vatTotal: '30.00',
};

const tlv = encodeQrTlv(fields);
const base64 = encodeBase64(tlv);
const imageUrl = await qrToDataUrl(base64, { width: 320 });

document.querySelector('#invoice-qr').src = imageUrl;
```

For Base64 directly, use `encodeQrBase64(fields)`. In React, use `<img src={imageUrl} alt="Invoice QR" />`. In Vue, use `<img :src="imageUrl" alt="Invoice QR">`.

للحصول على Base64 مباشرةً، استدعِ `encodeQrBase64(fields)`. وفي React أو Vue اربط نفس `imageUrl` بخاصية `src`.

### Invoice integration / ربط الفواتير

**Repository source preview.** The following invoice functions are internal Node.js code. The published npm package provides QR generation. Sandbox reporting and clearance were tested with prepared XML. Simplified invoice signing requires an external signer.

**معاينة من كود المستودع.** الدوال التالية داخلية وتعمل على Node.js. حزمة npm المنشورة توفّر توليد QR. جُرّب الإبلاغ والتخليص على Sandbox باستخدام XML جاهز. توقيع المبسطة يحتاج مزوّدًا خارجيًا.

#### 1. Start with an invoice object / ابدأ ببيانات الفاتورة

Use an object from any source in your application. Amounts and quantities are decimal strings. This is a complete sample for a local standard invoice.

ابدأ بـobject من أي مصدر في تطبيقك. الأسعار والكميات نصوص عشرية. ده مثال كامل لفاتورة قياسية محلية.

```js
const invoice = {
  "kind": "standard",
  "documentKind": "invoice",
  "id": "INV-1001",
  "uuid": "a2e8e2b6-858c-4c16-bca8-ec820b12adcb",
  "issuedAt": "2026-11-03T10:30:00+03:00",
  "supplyDate": "2026-11-03",
  "currency": "SAR",
  "seller": {
    "name": "شركة مدار التجريبية",
    "vatNumber": "300000000000003",
    "registrationId": "1234567890",
    "address": {
      "street": "شارع التجربة",
      "buildingNumber": "1234",
      "district": "حي الاختبار",
      "city": "الرياض",
      "postalCode": "12345",
      "country": "SA"
    }
  },
  "buyer": {
    "name": "شركة العميل التجريبية",
    "address": {
      "street": "شارع العميل",
      "buildingNumber": "2345",
      "district": "حي الاختبار",
      "city": "الرياض",
      "postalCode": "12345",
      "country": "SA"
    }
  },
  "paymentMeansCode": "30",
  "lines": [
    {
      "id": "1",
      "name": "خدمة تجريبية",
      "quantity": "2",
      "unitCode": "PCE",
      "unitPrice": "100.00",
      "tax": {
        "category": "S"
      }
    }
  ]
};
```

#### 2. Generate XML / ولّد XML

`generateXml()` takes one object and returns the XML as a string. In a real device chain, supply the current counter and previous invoice hash from your store. The values below are for the first invoice in a test chain.

`generateXml()` بتاخد object واحد وترجع نص XML. في التطبيق، خذ العدّاد والهاش السابق من مخزن سلسلة الجهاز. القيم هنا لأول فاتورة في سلسلة اختبار.

```ts
import { generateXml } from './src/server/invoicing.js';
import { initialPreviousInvoiceHash } from './src/xml/index.js';

const draftXml = generateXml({
  ...invoice,
  invoiceCounter: '1',
  previousInvoiceHash: initialPreviousInvoiceHash,
});
```

#### 3. Hash and submit / احسب الهاش وأرسل

Create the client on the server with the issuance CSID. For Sandbox, the `csid` object carries `environment: 'sandbox'`, `kind: 'production'`, `requestId`, `binarySecurityToken` and `secret`. Load the credential values from server-side secret storage. `xmllintPath` is the trusted absolute path to the XML canonicalizer on the server.

هيّئ العميل على الخادم بشهادة الإصدار. في Sandbox، الـ`csid` فيه `environment: 'sandbox'` و`kind: 'production'` و`requestId` و`binarySecurityToken` و`secret`. حمّل قيم الاعتماد من مخزن أسرار الخادم. `xmllintPath` هو المسار المطلق لأداة حساب الهاش على الخادم.

```ts
import { createInvoicing, hashInvoiceXml } from './src/server/invoicing.js';

const invoicing = createInvoicing({ environment: 'sandbox', csid });

// Standard invoice
const xml = draftXml;
const invoiceHash = hashInvoiceXml(xml, xmllintPath);
const result = await invoicing.clearXml({ xml, invoiceHash });
```

For a simplified invoice, set `kind` to `simplified` in the input. Prepare the draft with your signer and Phase 2 QR provider, then hash the signed XML and submit that same string.

للفاتورة المبسطة، اختار `kind: 'simplified'`. جهّز المسودة بمزوّد التوقيع وQR المرحلة الثانية، وبعدها احسب الهاش من نفس نص XML الموقّع وابعته.

```ts
const xml = await signSimplified(draftXml);
const invoiceHash = hashInvoiceXml(xml, xmllintPath);
const result = await invoicing.reportXml({ xml, invoiceHash });
```

Read `result.status`, `result.diagnostics` and `result.metadata.httpStatus`. For `cleared`, decode `result.clearedInvoiceBase64` to get ZATCA's cleared XML. If you already have ready XML and its canonical hash, start directly with `clearXml()` or `reportXml()`.

اقرأ الحالة في `result.status`، والتفاصيل في `diagnostics` و`metadata.httpStatus`. لو الحالة `cleared`، فك Base64 من `clearedInvoiceBase64` للحصول على XML الراجع. لو معاك XML جاهز والهاش، ابدأ مباشرةً من `clearXml()` أو `reportXml()`.

## API Reference / مرجع الدوال

Each operation can be used on its own. اختر الوظيفة اللي محتاجها تطبيقك.

### Published QR API / دوال QR المنشورة

| Method | Result / الناتج |
| --- | --- |
| `new GenerateQrCode(name, vat, time, total, tax)` | Phase 1 QR generator / مولّد QR للمرحلة الأولى |
| `qr.getTLV()` | TLV Buffer / بايتات TLV |
| `qr.toBase64()` | Base64 payload / حمولة Base64 |
| `qr.render()` | PNG data URL / رابط بيانات لصورة PNG |

### Development QR API / دوال QR في نسخة التطوير

| Import | Function | Result / الناتج |
| --- | --- | --- |
| `zatca/qr` | `encodeQrTlv(fields)` | TLV bytes / بايتات TLV |
| `zatca/qr` | `encodeQrBase64(fields)` | Base64 payload / حمولة Base64 |
| `zatca/qr` | `decodeQrTlv(bytes)`, `decodeQrBase64(base64)` | Read existing payload / قراءة حمولة جاهزة |
| `zatca/qr` | `validateQrPayload(payload)` | Phase 1 validation / فحص حمولة المرحلة الأولى |
| `zatca/qr` | `inspectPhase2Qr(payload, invoiceType)` | Experimental structural inspection / فحص بنيوي تجريبي |
| `zatca/qr` | `encodeBase64`, `decodeBase64`, `encodeUtf8`, `decodeUtf8` | Text and byte helpers / أدوات تحويل النص والبايتات |
| `zatca/qr/render` | `qrToDataUrl(base64, options?)` | PNG or SVG data URL / رابط بيانات للصورة |
| `zatca/qr/render` | `qrToPngBytes(base64, options?)` | PNG bytes / بايتات PNG |
| `zatca/qr/render` | `qrToSvg(base64, options?)` | SVG markup / نص SVG |

### Internal Node.js functions / دوال Node الداخلية

| Function | Result / الناتج |
| --- | --- |
| `calculateInvoice(draft)` | Totals and VAT / حساب الإجماليات والضريبة |
| `generateXml(draft)`, `buildInvoiceXml(draft)` | Unsigned UBL XML / مسودة XML غير موقّعة |
| `parseInvoiceXml(xml)`, `validateInvoiceXml(xml)` | Read or structurally check XML / قراءة أو فحص بنية XML |
| `hashInvoiceXml(xml, xmllintPath)` | Canonical invoice digest / هاش الفاتورة |
| `initialPreviousInvoiceHash`, `appendInvoice(...)` | Initial hash and host-managed invoice chain / الهاش الابتدائي وسلسلة الفواتير |
| `createInvoicing({ environment, csid })` | Configure submission / تهيئة عميل الإرسال |
| `invoicing.reportXml({ xml, invoiceHash })` | Report signed simplified XML / إبلاغ عن XML مبسّط موقّع |
| `invoicing.clearXml({ xml, invoiceHash })` | Clear standard XML / تخليص XML قياسي |
| `invoicing.issueInvoice(invoice, issuanceId)` | Optional combined workflow with a host store and signer / جمع خطوات الإصدار بمخزن ومزوّد توقيع |
| `createZatcaApi(options)` | Internal API client for onboarding and submission / عميل التهيئة والإرسال الداخلي |
| `requestComplianceCsid`, `checkCompliance`, `requestProductionCsid`, `renewProductionCsid` | Onboard, check and renew CSIDs / تهيئة وفحص وتجديد الشهادات |
| `getCsidExpiry(csid)`, `checkCertificateLocally(...)` | Expiry and local certificate checks / انتهاء الشهادة وفحصها محليًا |

- [HTML guide / دليل HTML](https://github.com/abdo-host/ZATCA-JS/blob/release/qr-preview/docs/invoice-integration.html)
- [Node integration example / مثال الربط](https://github.com/abdo-host/ZATCA-JS/blob/release/qr-preview/examples/invoicing/README.md)
- [Sandbox test results / نتائج Sandbox](https://github.com/abdo-host/ZATCA-JS/blob/release/qr-preview/docs/m7-zatca-api.md#verification)
- [Migration guide / دليل الترقية](https://github.com/abdo-host/ZATCA-JS/blob/release/qr-preview/docs/migration-v1-v2.md)

## License / الترخيص

MIT.
