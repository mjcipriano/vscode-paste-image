'use strict';

const fs = require('fs');

const packagePath = 'package.json';
const readmePath = 'README.md';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const match = pkg.version.match(/^(\d+\.\d+\.\d+)-internal\.(\d+)$/);

if (!match) {
  throw new Error(`Expected package version like 1.0.4-internal.3, got ${pkg.version}`);
}

const version = `${match[1]}-internal.${Number(match[2]) + 1}`;
const tag = `v${version}`;
const vsix = `paste-image-internal-${version}.vsix`;

pkg.version = version;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');
  readme = readme.replace(/v\d+\.\d+\.\d+-internal\.\d+/g, tag);
  readme = readme.replace(/paste-image-internal-\d+\.\d+\.\d+-internal\.\d+\.vsix/g, vsix);
  fs.writeFileSync(readmePath, readme);
}

fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=auto\nversion=${version}\ntag=${tag}\nvsix=${vsix}\n`);
