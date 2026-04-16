'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

export async function run() {
    const extension = vscode.extensions.getExtension('mjcipriano.paste-image-internal');
    assert.ok(extension, 'Expected the internal extension to be discoverable by VS Code');

    await extension.activate();
    assert.equal(extension.isActive, true, 'Expected the extension to activate successfully');

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
        commands.indexOf('paste-image-internal.pasteImage') >= 0,
        'Expected the paste image command to be registered'
    );

    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    assert.equal(workspaceFolders.length, 1, 'Expected the smoke workspace to be opened');

    const smokeFile = vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, 'smoke.md'));
    const document = await vscode.workspace.openTextDocument(smokeFile);
    const editor = await vscode.window.showTextDocument(document);

    assert.equal(editor.document.uri.fsPath, smokeFile.fsPath, 'Expected the smoke workspace file to open');
}
