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
  const files = pack.files.map(({ path }) => path);
  const sharedChunk =
    /^dist\/(?:(?:phase1|render)-[\w-]+\.[cm]js(?:\.map)?|(?:phase1|options)-[\w-]+\.d\.[cm]ts)$/;
  assert.deepEqual(files.filter((path) => !sharedChunk.test(path)).sort(), [
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
    'dist/render.cjs',
    'dist/render.d.cts',
    'dist/render.d.mts',
    'dist/render.mjs',
    'package.json',
  ]);
  assert.equal(files.filter((path) => sharedChunk.test(path)).length, 12);
  console.log(`Verified contents of ${pack.filename}`);

  const consumersOnly = process.argv.includes('--consumers-only');
  if (!consumersOnly) {
    npm(['exec', '--offline', '--', 'publint', '--strict', tarball]);
    npm(['exec', '--offline', '--', 'attw', '--profile', 'node16', tarball]);
  }

  for (const name of ['node-cjs', 'node-esm', 'browser', 'express']) {
    const cwd = join(temp, name);
    cpSync(join(fixtures, name), cwd, { recursive: true });
    cpSync(
      join(root, 'tests/fixtures/phase1-golden.json'),
      join(cwd, 'phase1-golden.json'),
    );
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
      const vite = join(root, 'node_modules/vite/bin/vite.js');
      node([vite, 'build'], cwd);
      node([vite, 'build', '--mode', 'render'], cwd);
      continue;
    }

    if (name === 'express') {
      npm(
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          'express@5.3.0',
          '@types/express@5.0.6',
          `@types/node@${nodeTypesVersion}`,
        ],
        cwd,
      );
      node(['--test', 'index.cjs'], cwd);
      tsc(
        [
          '--strict',
          '--target',
          'ES2022',
          '--module',
          'NodeNext',
          '--outDir',
          'compiled',
          'index.mts',
        ],
        cwd,
      );
      node(['--test', 'compiled/index.mjs'], cwd);
      continue;
    }

    const commonjs = name === 'node-cjs';
    node([commonjs ? 'index.cjs' : 'index.mjs'], cwd);
    if (commonjs) {
      if (!consumersOnly) {
        node([join(root, 'scripts/verify-licenses.mjs'), cwd]);
      }
      node(['--conditions=browser', 'browser-conditions.cjs'], cwd);
      cpSync(
        join(root, 'tests/legacy-compatibility.test.cjs'),
        join(cwd, 'legacy-compatibility.test.cjs'),
      );
      cpSync(join(root, 'tests/fixtures'), join(cwd, 'fixtures'), {
        recursive: true,
      });
      node(['--test', 'legacy-compatibility.test.cjs'], cwd);
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
