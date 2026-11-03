import { decodeQrBase64, decodeUtf8 } from '../src/qr/index.js';
import { qrToDataUrl } from '../src/render/index.js';
import type { createDemoInvoice } from './invoice.js';
import {
  type Profile,
  route,
  type Scenario,
  simulateSubmission,
} from './model.js';
import './style.css';

function get<ElementType extends HTMLElement = HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element ${id}`);
  return element as ElementType;
}

const form = get<HTMLFormElement>('invoice-form');
const image = get<HTMLImageElement>('qr-image');
const saveQr = get<HTMLButtonElement>('save-qr');
const saveXml = get<HTMLButtonElement>('save-xml');
const simulate = get<HTMLButtonElement>('simulate');
const outcome = get('outcome');
const message = get('form-message');
const receipt = get('receipt');
let generation = 0;
let current:
  | {
      profile: Profile;
      xml: string;
      svg: string;
    }
  | undefined;

function show(id: string, value: string) {
  get(id).textContent = value;
}

function resetOutcome() {
  outcome.dataset.tone = '';
  outcome.textContent = 'شغّل المحاكاة لرؤية نتيجة الإرسال.';
}

function clearResult() {
  current = undefined;
  image.hidden = true;
  image.removeAttribute('src');
  saveQr.disabled = true;
  saveXml.disabled = true;
  simulate.disabled = true;
  for (const id of [
    'receipt-quantity',
    'receipt-net',
    'receipt-tax',
    'xml-output',
    'payload',
    'tags',
    'tag-count',
  ]) {
    show(id, '');
  }
  show('receipt-total', '—');
  show('step-draft', 'في انتظار المسودة');
  show('step-check', 'فحص البنية وQR');
  resetOutcome();
}

function fieldError(error: unknown) {
  if (!(error instanceof Error))
    return 'تعذّر إنشاء المسودة. راجع البيانات وحاول مرة أخرى.';
  const path = error.message;
  if (path.includes('vatNumber'))
    return 'اكتب رقمًا ضريبيًا من 15 رقمًا يبدأ وينتهي بـ3.';
  if (path.includes('quantity'))
    return 'أدخل كمية أكبر من صفر بالأرقام الإنجليزية.';
  if (path.includes('unitPrice'))
    return 'أدخل سعر وحدة صالحًا بالأرقام الإنجليزية.';
  if (path.includes('name') || path.includes('sellerName'))
    return 'أدخل اسم بائع صالحًا، أو استخدم اسمًا أقصر.';
  return 'راجع قيم الفاتورة وحاول مرة أخرى.';
}

async function generate() {
  const token = ++generation;
  clearResult();
  receipt.setAttribute('aria-busy', 'true');
  message.dataset.tone = '';
  message.textContent = '';
  const values = new FormData(form);
  const profile: Profile =
    values.get('profile') === 'standard' ? 'standard' : 'simplified';
  const seller = String(values.get('seller') ?? '').trim();
  const vatNumber = String(values.get('vat') ?? '').trim();
  const quantity = String(values.get('quantity') ?? '').trim();
  const unitPrice = String(values.get('price') ?? '').trim();

  try {
    const response = await fetch('./api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, seller, vatNumber, quantity, unitPrice }),
    });
    if (!response.ok) {
      const problem = (await response.json()) as { path?: string };
      throw new Error(problem.path);
    }
    const result = (await response.json()) as ReturnType<
      typeof createDemoInvoice
    >;
    const decoded = decodeQrBase64(result.payload);
    if (!decoded.valid) throw new Error('Invalid QR');
    const svg = await qrToDataUrl(result.payload, {
      format: 'svg',
      width: 360,
    });
    if (token !== generation) return;

    current = { profile, xml: result.xml, svg };
    show('receipt-seller', seller);
    show('receipt-vat', vatNumber);
    show(
      'receipt-profile',
      profile === 'standard' ? 'فاتورة قياسية' : 'فاتورة مبسطة',
    );
    show('receipt-quantity', `× ${quantity}`);
    show('receipt-net', result.totals.taxExclusiveTotal);
    show('receipt-tax', result.totals.vatTotal);
    show('receipt-total', result.totals.payableTotal);
    show('xml-output', result.xml);
    show('payload', result.payload);
    show('tag-count', `${decoded.tags.length} TLV tags`);
    image.src = svg;
    image.hidden = false;
    saveQr.disabled = false;
    saveXml.disabled = false;
    simulate.disabled = false;

    const rows = decoded.tags.map(({ tag, value }) => {
      const row = document.createElement('tr');
      for (const text of [
        String(tag),
        decodeUtf8(value),
        String(value.length),
      ]) {
        const cell = row.insertCell();
        cell.textContent = text;
        cell.dir = 'auto';
      }
      return row;
    });
    get('tags').replaceChildren(...rows);
    show('step-draft', 'مسودة غير موقّعة جاهزة');
    show('step-check', 'بنية XML وQR صالحان للفحص المحلي');
    show('step-route', route[profile].label);
    show('step-endpoint', route[profile].path);
    message.textContent = 'تم إنشاء المسودة والرمز.';
  } catch (error) {
    if (token !== generation) return;
    message.dataset.tone = 'danger';
    message.textContent = fieldError(error);
  } finally {
    if (token === generation) receipt.setAttribute('aria-busy', 'false');
  }
}

function download(url: string, name: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void generate();
});
form.addEventListener('reset', () => {
  setTimeout(() => void generate(), 0);
});
form.addEventListener('input', () => {
  if (current) {
    message.dataset.tone = '';
    message.textContent = 'اضغط إنشاء المسودة لتطبيق التعديلات.';
  }
});

const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-panel]')];
for (const button of tabs) {
  button.addEventListener('click', () => {
    for (const tab of tabs) {
      const active = tab === button;
      tab.setAttribute('aria-pressed', String(active));
      get(`panel-${tab.dataset.panel}`).hidden = !active;
    }
  });
}

const scenario = get<HTMLSelectElement>('scenario');
scenario.addEventListener('change', resetOutcome);
simulate.addEventListener('click', () => {
  if (!current) return;
  const result = simulateSubmission(
    current.profile,
    scenario.value as Scenario,
  );
  const title = document.createElement('strong');
  title.textContent = result.title;
  const detail = document.createElement('bdi');
  detail.textContent = result.detail;
  outcome.replaceChildren(title, detail);
  outcome.dataset.tone = result.tone;
});

saveXml.addEventListener('click', () => {
  if (!current) return;
  const url = URL.createObjectURL(
    new Blob([current.xml], { type: 'application/xml' }),
  );
  download(url, 'LAB-001-draft.xml');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
saveQr.addEventListener('click', () => {
  if (current) download(current.svg, 'LAB-001-phase1.svg');
});

void generate();
