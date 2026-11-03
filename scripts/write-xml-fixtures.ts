import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildInvoiceXml } from '../src/xml/index.js';
import { invoiceExamples } from '../tests/fixtures/invoice-drafts.js';

const output = process.argv[2];
if (!output)
  throw new Error('Provide an output directory for synthetic XML drafts');
mkdirSync(output, { recursive: true });

for (const [name, draft] of Object.entries(invoiceExamples())) {
  writeFileSync(join(output, `${name}.xml`), buildInvoiceXml(draft), {
    flag: 'wx',
  });
}
