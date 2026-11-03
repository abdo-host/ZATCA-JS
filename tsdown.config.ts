import { defineConfig } from 'tsdown';

const shared = {
  clean: false,
  dts: true,
  fixedExtension: true,
  sourcemap: true,
  failOnWarn: true,
} as const;

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts', qr: 'src/qr/index.ts' },
    platform: 'node',
    format: 'cjs',
  },
  {
    ...shared,
    entry: { index: 'src/index-esm.ts', qr: 'src/qr/index.ts' },
    platform: 'node',
    format: 'esm',
  },
]);
