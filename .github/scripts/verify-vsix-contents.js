'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packagePath = path.resolve(__dirname, '../../package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const vsixPath = process.argv[2] || path.resolve(process.cwd(), `paste-image-internal-${pkg.version}.vsix`);

const expectedFiles = new Set([
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/LICENSE.txt',
  'extension/out/src/extension.js',
  'extension/res/icon.png',
  'extension/res/linux.sh',
  'extension/res/mac.applescript',
  'extension/res/pc.ps1'
]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(vsixPath)) {
  fail(`VSIX not found: ${vsixPath}`);
}

let archiveList;
try {
  archiveList = execFileSync('unzip', ['-Z1', vsixPath], { encoding: 'utf8' });
} catch (error) {
  fail(`Failed to inspect VSIX contents with unzip. message=${error.message}`);
}

const actualFiles = archiveList
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const unexpectedFiles = actualFiles.filter((file) => !expectedFiles.has(file));
const missingFiles = Array.from(expectedFiles).filter((file) => actualFiles.indexOf(file) < 0);

if (unexpectedFiles.length > 0 || missingFiles.length > 0) {
  const lines = [];
  if (missingFiles.length > 0) {
    lines.push(`Missing VSIX entries:\n${missingFiles.join('\n')}`);
  }
  if (unexpectedFiles.length > 0) {
    lines.push(`Unexpected VSIX entries:\n${unexpectedFiles.join('\n')}`);
  }
  fail(lines.join('\n\n'));
}

console.log(`Verified VSIX contents for ${path.basename(vsixPath)}`);
