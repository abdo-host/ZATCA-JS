# QR rendering and migration from v1

The private development build exposes Phase 1 encoding at `zatca/qr` and image rendering at `zatca/qr/render`. The renderer is a separate import, so applications that only encode or inspect payloads can keep the renderer out of their bundle.

```ts
import { encodeQrBase64 } from 'zatca/qr';
import { qrToDataUrl, qrToPngBytes, qrToSvg } from 'zatca/qr/render';

const base64 = encodeQrBase64({
  sellerName: 'شركة',
  vatNumber: '300000000000003',
  issuedAt: '2024-02-29T15:30:00+03:00',
  invoiceTotal: '115.00',
  vatTotal: '15.00',
});

const png = await qrToPngBytes(base64, { width: 320 });
const imageUrl = await qrToDataUrl(base64, { width: 320 });
const svg = await qrToSvg(base64, { width: 320 });
const svgUrl = await qrToDataUrl(base64, { format: 'svg', width: 320 });
```

All three render functions return promises and validate the Phase 1 payload before rendering. `qrToSvg` returns SVG text. `qrToPngBytes` returns `Uint8Array`. `qrToDataUrl` defaults to PNG and accepts `format: 'svg'`. Node renders PNG directly. Browser bundlers must honor the renderer dependency's browser mapping, and browser PNG output requires DOM Canvas. SVG generation works without Canvas. [Renderer documentation](https://github.com/soldair/node-qrcode)

| Option | Meaning |
| --- | --- |
| `errorCorrectionLevel` | `L`, `M`, `Q` or `H`. The modern default is `M`. |
| `margin` | Quiet zone in modules, from 0 to 32. Defaults to 4. |
| `scale` | Integer pixels per module, from 1 to 32. Defaults to 4. |
| `width` | Explicit square image size in pixels. It takes precedence over scale and must fit the symbol plus its quiet zone. Output is capped at 2048 pixels per side. |
| `color` | Optional `dark` and `light` hex RGB or RGBA colors, including short hex. Defaults to black on white. |

Invalid payloads and options reject with `ZatcaValidationError`. The error's `issues` array contains stable codes and paths. Renderer failures reject with `ZatcaEncodingError`. Catch these using the classes from `zatca/qr`.

## Existing Node consumers

`require('zatca').GenerateQrCode`, the ESM named export, and the property on the ESM default export are retained. The class is deprecated and takes the same five positional arguments.

| Existing call | Current return | Migration |
| --- | --- | --- |
| `await qr.getTLV()` | Node `Buffer` | Use `encodeQrTlv(input)` for a portable `Uint8Array`. |
| `await qr.toBase64()` | Base64 string | Use `encodeQrBase64(input)`. |
| `await qr.render()` | PNG data URL | Pass the Base64 to `qrToDataUrl`. |

The legacy adapter keeps the v1 PNG default, `H` error correction and its 2.5-module default margin. Historical `image/jpeg` and `image/webp` option values retain their Node PNG fallback. New code uses the renderer's explicit `format` field. Modern geometry requires integer values, and legacy margin accepts 2.5 for compatibility. Other out-of-range options now reject. PNG compression options in the legacy adapter are bounded.

Legacy numeric amounts use their JavaScript decimal spelling. Pass decimal strings to retain trailing zeroes and avoid exponential notation or rounding before the SDK receives the value. Valid zoned timestamps are accepted and preserved. Arabic lengths now use UTF-8 bytes. Oversized fields and invalid invoices reject with typed errors. Replace code that looked for an HTML string with an error handler.

## Verification

All 91 tests passed on Node 22, 24 and 26 on Windows. The packed package is checked with CommonJS, ESM, TypeScript, Express JS and TypeScript, and separate Vite builds for the encoder and renderer. Tests scan generated PNG pixels and rasterized SVG with `jsQR` and compare the decoded content with the exact Phase 1 Base64. A local headless Chrome run also generated and scanned a Canvas PNG from the Vite-built consumer. See the [compliance matrix](compliance-matrix.md) for official verification status.
