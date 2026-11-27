import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const root = path.resolve(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = `"${process.execPath}"`;
const expectedVersion = (require('../package.json') as { version: string }).version;

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`PACKAGE SMOKE FAILED: ${message}`);
  console.log(`  ok - ${message}`);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'permiscope-package-'));
try {
  console.log(`Packing permiscope@${expectedVersion}...`);
  const packed = JSON.parse(execSync(`${npm} pack --json`, { cwd: root, encoding: 'utf8' })) as
    | Array<{ filename: string }>;
  const tarball = path.join(root, packed[0].filename);
  check(packed[0].filename.includes(expectedVersion), `tarball version is ${expectedVersion}`);

  console.log('Installing the tarball in a clean directory...');
  execSync(`${npm} init -y`, { cwd: temp, stdio: 'ignore' });
  execSync(`${npm} install "${tarball}" --no-audit --no-fund`, { cwd: temp, stdio: 'ignore' });

  const installed = require(path.join(temp, 'node_modules', 'permiscope', 'package.json')) as {
    version: string;
  };
  check(installed.version === expectedVersion, `installed package reports ${expectedVersion}`);

  execSync(`${node} -e "require('permiscope')"`, { cwd: temp, stdio: 'ignore' });
  check(true, 'CommonJS entry point loads from the installed package');

  execSync(
    `${node} --input-type=module -e "import('permiscope').then(function(){console.log('esm ok')})"`,
    { cwd: temp, stdio: 'ignore' },
  );
  check(true, 'ESM entry point loads from the installed package');

  const demo = execSync(`${node} node_modules/permiscope/dist/cli/index.js --demo`, {
    cwd: temp,
    encoding: 'utf8',
  });
  check(demo.includes('Demo Complete'), 'README npx demo runs from the installed package');

  const quickStart = `
const { createAgent } = require('permiscope');
createAgent()
  .act('run_command', { command: 'echo smoke' })
  .then(function(out) {
    if (!String(out).includes('smoke')) throw new Error('unexpected output: ' + out);
    console.log('quick-start ok');
  })
  .catch(function(error) {
    console.error(error);
    process.exit(1);
  });
`;
  fs.writeFileSync(path.join(temp, 'quick-start.js'), quickStart);
  const output = execSync(`${node} quick-start.js`, { cwd: temp, encoding: 'utf8' });
  check(output.includes('quick-start ok'), 'README quick-start governs a real action');

  console.log('PACKAGE SMOKE PASSED');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
