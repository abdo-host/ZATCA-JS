import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const allowed = new Set([
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
]);
const cwd = resolve(process.argv[2] ?? '.');
const installed = execFileSync(
  process.execPath,
  [process.env.npm_execpath, 'ls', '--omit=dev', '--all', '--parseable'],
  { cwd, encoding: 'utf8' },
);
const dependencies = installed.trim().split(/\r?\n/).slice(1);
const unreviewed = dependencies
  .map((path) => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')))
  .filter(({ license }) => !allowed.has(license));

if (unreviewed.length) {
  for (const { name, version, license } of unreviewed) {
    console.error(
      `${name}@${version} needs license review (${JSON.stringify(license ?? null)})`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `Reviewed license IDs for ${dependencies.length} production dependencies.`,
  );
}
