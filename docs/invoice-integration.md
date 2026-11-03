# دليل تكامل الفواتير للمطورين

التكامل يبدأ إما من **بيانات الفاتورة** أو من **ملف UBL XML جاهز**. في الحالتين زاتكا تستقبل ملف XML مرمّز بـBase64، ومعه UUID وهاش الفاتورة. خادم التطبيق يتولى إعداد المستند واختيار الإبلاغ أو التخليص. [دليل زاتكا للمطورين، §2.3.10.5 و§2.3.10.6][developer]

| نقطة البداية | التطبيق يوفّر | الكود الحالي في المشروع |
| --- | --- | --- |
| نظام مبيعات أو ERP يحتفظ بالبيانات | بيانات البائع والعميل والبنود، ومعرّف الفاتورة ووقت الإصدار وحالة سلسلة الجهاز | يحسب الإجماليات ويولّد مسودة UBL. مسار الإرسال يستقبل مستندًا جاهزًا في استدعاء منفصل. |
| ERP يولّد UBL بالفعل | ملف XML النهائي والهاش. الفاتورة المبسطة تُجهّز وتُوقّع لدى النظام المصدِر. | يقرأ UUID ونوع المستند من XML، ويرمّز XML ويرسله، ويعيد الحالة والتحذيرات والأخطاء. |

## 1. من JSON إلى XML

خادم التطبيق يربط نموذج الفاتورة عنده بـ`InvoiceDraft`. أسعار الوحدات والكميات والمبالغ تُمرّر كنصوص عشرية. البند يستخدم `tax.category` بدل تمرير إجمالي ضريبة محسوب يدويًا. الفاتورة القياسية تتطلب بيانات العميل وتاريخ التوريد. المثال التالي يحتوي على بيانات اصطناعية لفاتورة قياسية محلية بالريال.

```json
{
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
  "invoiceCounter": "1",
  "previousInvoiceHash": "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==",
  "lines": [
    {
      "id": "1",
      "name": "خدمة تجريبية",
      "quantity": "2",
      "unitCode": "PCE",
      "unitPrice": "100.00",
      "tax": { "category": "S" }
    }
  ]
}
```

احفظ المثال في ملف `invoice.json`. في مثال TypeScript داخل `scripts/` في هذا المستودع، يمكنك قراءة الملف وتوليد المسودة من واجهات المصدر الحالية.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import {
  buildInvoiceXml,
  calculateInvoice,
  type InvoiceDraft,
  validateInvoiceXml,
} from '../src/xml/index.js';

const draft = JSON.parse(await readFile('invoice.json', 'utf8')) as InvoiceDraft;
const totals = calculateInvoice(draft);
const xml = buildInvoiceXml(draft);
const validation = validateInvoiceXml(xml);

if (!validation.structureValid) {
  throw new Error('Invoice XML failed structural validation');
}

await writeFile('invoice-draft.xml', xml, 'utf8');
console.log(totals.payableTotal); // 230.00
```

`calculateInvoice` و`buildInvoiceXml` يفحصان شكل المدخلات أثناء التشغيل. `validateInvoiceXml` يفحص البنية محليًا. المخرجات مسودة غير موقّعة. الرقم `1` والـPIH الابتدائي في المثال يخصّان أول مستند لجهاز جديد. في التكامل الفعلي يحصل الخادم على ICV وPIH من مخزن سلسلة دائم ومعاملة ذرّية لكل جهاز، بدل تثبيتهما في كل طلب. [دليل XML](m5-ubl-invoices.md) · [عقد سلسلة الفواتير](m6-crypto-foundation.md#chain-behavior)

## 2. من XML جاهز إلى زاتكا

- **قياسية (B2B).** جهّز XML والهاش وأرسلها بـ`clear()`. عند نجاح التخليص يحفظ التطبيق نسخة XML التي رجعتها زاتكا.
- **مبسطة (B2C).** جهّز ملف XML الموقّع بما يلزم من QR المرحلة الثانية واحسب هاشه، ثم أرسله بـ`report()`. عميل المشروع يفحص وجود عنصر التوقيع فقط. التحقق التشفيري وإنتاج التوقيع مساران منفصلان. [دليل زاتكا للمطورين][developer]

يقبل العميل الداخلي `{ xml, invoiceHash }`. `xml` نص UTF-8، و`invoiceHash` هو Base64 لبايتات SHA-256 الناتجة عن التحويل وC14N 1.1. التطبيق يستطيع تزويد العميل بهاش الأداة التي جهّزت المستند. توجد أداة هاش داخلية في المشروع تعتمد على `xmllint` موثوق على الخادم. عميل الإرسال يأخذ الهاش الممرّر ويستخرج UUID ويرمّز XML داخليًا. [طريقة الهاش](m6-crypto-foundation.md#invoice-reference)

مثال استدعاء من خادم التطبيق باستخدام شهادة إصدار اختبار للـSandbox. قيم الشهادة تأتي من مخزن الخادم بعد خطوات التهيئة والامتثال.

```ts
import { createZatcaApi, type Csid } from '../src/api/client.js';

export function submitReadyInvoice(
  kind: 'standard' | 'simplified',
  xml: string,
  invoiceHash: string,
  sandboxCsid: Csid<'production'>,
) {
  const zatca = createZatcaApi({ environment: 'sandbox' });
  const document = { xml, invoiceHash };

  return kind === 'standard'
    ? zatca.clear(document, sandboxCsid)
    : zatca.report(document, sandboxCsid, { clearanceEnabled: true });
}
```

يحفظ التطبيق المستند والهاش والحالة قبل الإرسال. عند `cleared` يحفظ النسخة المرجعة في `clearedInvoiceBase64`، وعند `reported` يحفظ حالة الإبلاغ. مع انتهاء المهلة أو `outcomeUnknown`، يحتفظ بالمستند ويراجع نتيجة الطلب قبل إعادة الإرسال. [عقود API والاسترجاع](m7-zatca-api.md#workflow-and-recovery)

## حدود النسخة الحالية

المتاح اليوم داخل المستودع هو توليد مسودة من البيانات، وإرسال XML جاهز بعميل Node. اختبار Sandbox الحي غطّى التهيئة والتجديد المباشر وتخليص فاتورة قياسية وإبلاغ فاتورة مبسطة باستخدام عينات زاتكا. حزمة npm الحالية تعرض وظائف QR. واجهات XML والإرسال ما زالت داخلية.

تصميم التكامل الكامل المقترح هو أن يرسل نظام المبيعات JSON إلى خادمه، ويتولى الخادم توليد المستند وحفظه، ثم تجهيز الهاش والتوقيع حيث يلزم، وإرساله عبر المسار المناسب. ويمكن لنظام عنده UBL جاهز أن يدخل من خطوة الإرسال. هذا تصميم لتطبيق يستضيف المكتبة. التوقيع المدمج وخدمة HTTP تستقبل JSON وتصدر وترسل الفاتورة تلقائيًا غير متاحين حاليًا. الديمو يوضح إنشاء المسودة والـQR للمرحلة الأولى ومحاكاة نتيجة الإرسال. [الديمو](invoice-demo.md) · [نتائج Sandbox](m7-zatca-api.md#verification)

[developer]: https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf
