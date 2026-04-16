'use strict';

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const workspacePath = path.resolve(__dirname, '../../../test/fixture/workspace');

    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [workspacePath],
        version: process.env['VSCODE_VERSION']
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
