import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixtures = join(root, 'tests/consumers');
const temp = mkdtempSync(join(tmpdir(), 'zatca-consumers-'));
const npmCli = process.env.npm_execpath;
const nodeTypesVersion = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).devDependencies['@types/node'];

function node(args, cwd = root, options = {}) {
  return execFileSync(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    ...options,
  });
}

function npm(args, cwd = root, options = {}) {
  return node([npmCli, ...args], cwd, options);
}

function tsc(args, cwd) {
  node([join(root, 'node_modules/typescript/bin/tsc'), ...args], cwd);
}

try {
  const [pack] = JSON.parse(
    npm(
      ['pack', '--ignore-scripts', '--json', '--pack-destination', temp],
      root,
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    ),
  );
  const tarball = join(temp, pack.filename);
  assert.deepEqual(pack.files.map(({ path }) => path).sort(), [
    'LICENSE',
    'README.md',
    'dist/index.cjs',
    'dist/index.cjs.map',
    'dist/index.d.cts',
    'dist/index.d.mts',
    'dist/index.mjs',
    'dist/index.mjs.map',
    'dist/qr.cjs',
    'dist/qr.cjs.map',
    'dist/qr.d.cts',
    'dist/qr.d.mts',
    'dist/qr.mjs',
    'dist/qr.mjs.map',
    'package.json',
  ]);
  console.log(`Verified contents of ${pack.filename}`);

  const consumersOnly = process.argv.includes('--consumers-only');
  if (!consumersOnly) {
    npm(['exec', '--offline', '--', 'publint', '--strict', tarball]);
    npm(['exec', '--offline', '--', 'attw', '--profile', 'node16', tarball]);
  }

  for (const name of ['node-cjs', 'node-esm', 'browser']) {
    const cwd = join(temp, name);
    cpSync(join(fixtures, name), cwd, { recursive: true });
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true }));
    npm(
      [
        'install',
        '--ignore-scripts',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        tarball,
      ],
      cwd,
    );

    if (name === 'browser') {
      tsc(['-p', 'tsconfig.json'], cwd);
      node([join(root, 'node_modules/vite/bin/vite.js'), 'build'], cwd);
      continue;
    }

    const commonjs = name === 'node-cjs';
    node([commonjs ? 'index.cjs' : 'index.mjs'], cwd);
    if (commonjs) {
      if (!consumersOnly) {
        node([join(root, 'scripts/verify-licenses.mjs'), cwd]);
      }
      node(['--conditions=browser', 'browser-conditions.cjs'], cwd);
      node(['--test', join(root, 'tests/legacy-baseline.test.cjs')], cwd, {
        env: {
          ...process.env,
          ZATCA_LEGACY_ENTRY: join(cwd, 'node_modules/zatca/dist/index.cjs'),
        },
      });
    }

    npm(
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        `@types/node@${nodeTypesVersion}`,
      ],
      cwd,
    );
    for (const module of ['NodeNext', 'Node16']) {
      tsc(
        [
          '--noEmit',
          '--strict',
          '--target',
          'ES2022',
          '--module',
          module,
          commonjs ? 'index.cts' : 'index.mts',
        ],
        cwd,
      );
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
