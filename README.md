<div id="top"></div>
<div align="center"> 
  <a href="https://salla.dev"> 
    <img src="https://www.tatwerat.com/downloads/zatca-js-icon.svg" alt="Logo" width="80" height="80"> 
  </a>
  <h1 align="center">ZATCA JS Generator</h1>
  <h3>QR code generation for ZATCA e-invoicing</h3>
  <p align="center">Node.js QR rendering and portable encoding utilities</p>
  <h3><a href="https://www.tatwerat.com/demo/zatcajs">Demo Link</a></h3>
</div>


## Installation

Install the current v1 release from npm with its renderer dependency.

```bash
npm install zatca@1.0.2 qrcode@1.5.4
```
[![npm](https://img.shields.io/npm/v/zatca.svg)](https://www.npmjs.com/package/zatca)  [![downloads](https://img.shields.io/npm/dm/zatca.svg)](https://npmjs.org/package/zatca)

## Usage

```js
// Import in your app
const TT_Zatca = require('zatca');

/*
* Run Generate QrCode Class
* @param1=company_name
* @param2=tax_id
* @param3=invoice_date
* @param4=grand_total
* @param5=tax_total
*/
const generateQrCode = new TT_Zatca.GenerateQrCode('Tatwerat', '302520021521453', '2011-10-05T14:48:00.000Z', 100.00, 15.00);
```

### Generate Base64

```js
let base64 = await generateQrCode.toBase64();
```

### Generate TLV

```js
let TLV = await generateQrCode.getTLV();
```

### Render QR Code Image

```js
let qrCode = await generateQrCode.render();
```

## Local development build

The TypeScript migration is available as a private development tarball. Build it with a current patch of Node.js 22, 24 or 26.

```sh
npm ci
npm run build
npm test
npm run package:verify
npm pack
```

Install the resulting `zatca-2.0.0-dev.0.tgz` into a separate project. Node and browser applications can encode, decode and validate Phase 1 payloads from `zatca/qr` and render PNG or SVG from `zatca/qr/render`. The Node root retains the deprecated `GenerateQrCode` adapter in CommonJS and ESM. TypeScript users of the Node entry should install `@types/node` for their Node version.

See the [Phase 1 API guide](docs/m2-phase1-qr.md), [rendering and migration guide](docs/migration-v1-v2.md) and [compliance matrix](docs/compliance-matrix.md).
