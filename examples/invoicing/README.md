# نقطة الدخول لتكامل الفواتير

ملف [invoice.json](invoice.json) هو البيانات التي يرسلها نظامك. يحتوي على البائع والعميل والبنود والتصنيف الضريبي. كل كمية وسعر قيمة نصية مثل `"2"` و`"100.00"`. إعدادات زاتكا ثابتة لكل جهاز على الخادم وتُمرر إلى `createInvoicing()` مرة عند التهيئة.

مثال TypeScript داخل المستودع. استيراد المصدر التالي يناسب ملفًا داخل `examples/invoicing/`. قيم `store` و`signSimplified` تأتي من تطبيقك، وبيانات الاعتماد من مخزن أسرار الخادم.

```ts
import { readFile } from 'node:fs/promises';
import {
  createInvoicing,
  type InvoiceInput,
} from '../../src/server/invoicing.js';

const invoicing = createInvoicing({
  environment: 'sandbox',
  csid: {
    environment: 'sandbox',
    kind: 'production',
    requestId: issuedCsid.requestId,
    binarySecurityToken: issuedCsid.binarySecurityToken,
    secret: issuedCsid.secret,
  },
  issuance: {
    egsId: 'device-01',
    xmllintPath: absoluteXmllintPath,
    store,
    signSimplified,
  },
});

const invoice = JSON.parse(
  await readFile(new URL('./invoice.json', import.meta.url), 'utf8'),
) as InvoiceInput;

const result = await invoicing.issueInvoice(invoice, invoice.id);
console.log(result.status);
```

`issueInvoice` يتحقق من بيانات الفاتورة، ويأخذ ICV وPIH من المخزن، ويولّد XML. لو الفاتورة مبسطة يستدعي `signSimplified` ليعيد XML موقّعًا فيه QR المرحلة الثانية. بعدها يحسب الهاش على المستند الجاهز ويستدعي Reporting أو Clearance. العينة قياسية، فتستخدم Clearance. غيّر `kind` إلى `simplified` عند تجربة الإبلاغ مع مزوّد توقيع مُعدّ للاختبار. التوقيع الفعلي مسؤولية المزود، ولا توجد دالة توقيع مدمجة في الحزمة الحالية.

| المطلوب | نقطة الدخول |
| --- | --- |
| JSON إلى XML ثم الإرسال | `invoicing.issueInvoice(invoice, issuanceId)` |
| XML فقط | `generateXml(invoice, { invoiceCounter, previousInvoiceHash })` |
| إرسال XML مبسّط جاهز وموقّع | `invoicing.reportXml({ xml, invoiceHash })` |
| تخليص XML قياسي جاهز | `invoicing.clearXml({ xml, invoiceHash })` |
| حمولة QR للمرحلة الأولى فقط | `generatePhase1Qr({ sellerName, vatNumber, issuedAt, invoiceTotal, vatTotal })` أو `encodeQrBase64` من `zatca/qr` في حزمة التطوير |

للإبلاغ أو التخليص من XML جاهز، أنشئ العميل بإعدادَي `environment` و`csid` فقط. إعدادات `issuance` تخص مسار إنشاء الفاتورة من JSON.

الـCSID في مثال Sandbox هو شهادة **إصدار** من نفس بيئة الاختبار. كلمة `production` في `kind` تميّز شهادة الإصدار عن شهادة الامتثال. حقل `environment` يحدد الوجهة. احصل على الشهادة من خطوات التهيئة الموثّقة. [تهيئة Sandbox](../../docs/m7-zatca-api.md#workflow-and-recovery)

`store` مسؤول عن معاملتين دائمتي الأثر. `transaction` تحفظ المستند النهائي والهاش ورأس سلسلة الجهاز معًا. `claimSubmission` تمنع إرسال نفس معرّف الإصدار مرتين، وتُسجّل قبل الطلب. إذا انقطع الاتصال بعد الحجز، راجع نتيجة الطلب قبل إعادة الإرسال. تكرار الاستدعاء يرجع `already-attempted`؛ خزّن رد زاتكا في تطبيقك لعرضه لاحقًا. الاستدعاء المباشر لـ`reportXml` أو `clearXml` يحتاج إدارة التكرار في التطبيق.

عند `reported` احفظ المستند الموقّع والنتيجة. عند `cleared` احفظ أيضًا XML الراجع في `clearedInvoiceBase64`. التحذيرات والأخطاء وHTTP status موجودة في `diagnostics` و`metadata` عند رجوع النتيجة.

الكود ده نقطة دخول داخلية في المستودع. تثبيت حزمة npm الحالية يوفّر وظائف QR فقط. الاختبارات استخدمت canonicalizer حقيقي ومخزنًا وناقل HTTP تجريبيين. اختبار المبسطة استخدم مزوّدًا وهميًا لتأكيد ترتيب الاستدعاءات. اختبار Sandbox الحي السابق استخدم XML جاهزًا من زاتكا. [نتائج Sandbox](../../docs/m7-zatca-api.md#verification)
