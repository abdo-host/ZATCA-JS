<div id="top"></div>
<div align="center"> 
  <a href="https://salla.dev"> 
    <img src="https://www.tatwerat.com/downloads/zatca-js-icon.svg" alt="Logo" width="80" height="80"> 
  </a>
  <h1 align="center">ZATCA JS Generator</h1>
  <h3>E-Invoice Compatible QR Code And XML</h3>
  <p align="center">    NodeJS package for generate E-Invoice qr-code and valid XML </p>
  <h3><a href="https://www.zatcajs.tatwerat.com">Demo Link</a></h3>
</div>

## Installation

You can install the package via composer:

```bash
npm i @tatwerat/zatca --save
```

## Usage

```js
// Import in your app
const TT_Zatca = require('@tatwerat/zatca');

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
