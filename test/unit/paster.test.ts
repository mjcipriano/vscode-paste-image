import * as assert from 'assert';

var Module = require('module');
var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var originalModuleLoad = Module._load;
var originalSpawn = childProcess.spawn;
var originalReadFileSync = fs.readFileSync;
var originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
var originalWslDistroName = process.env['WSL_DISTRO_NAME'];
var originalWslInterop = process.env['WSL_INTEROP'];

var infoMessages: string[] = [];
var errorMessages: string[] = [];
var inputBoxOptions: any[] = [];
var nextInputBoxValue: string = null;
var registeredCommands: any[] = [];

var vscodeMock = {
    window: {
        activeTextEditor: null,
        createOutputChannel: function (name: string) {
            return {
                name: name,
                lines: [],
                appendLine: function (value: string) {
                    this.lines.push(value);
                },
                dispose: function () { }
            };
        },
        showInformationMessage: function (message: string) {
            infoMessages.push(message);
            return resolvedThenable(undefined);
        },
        showErrorMessage: function (message: string) {
            errorMessages.push(String(message));
            return resolvedThenable(undefined);
        },
        showInputBox: function (options: any) {
            inputBoxOptions.push(options);
            return resolvedThenable(nextInputBoxValue);
        }
    },
    commands: {
        registerCommand: function (command: string, callback: Function) {
            registeredCommands.push({ command: command, callback: callback });
            return { dispose: function () { } };
        }
    },
    workspace: {
        rootPath: '/workspace',
        getConfiguration: function () {
            return {};
        }
    }
};

Module._load = function (request: string) {
    if (request === 'vscode') {
        return vscodeMock;
    }

    return originalModuleLoad.apply(this, arguments);
};

var extension = require('../../src/extension');
var Paster = extension.Paster;
var Logger = extension.Logger;
var PasterAny = <any>Paster;

suite('extension activation', () => {
    setup(() => {
        resetMessages();
        registeredCommands = [];
    });

    test('registers the internal paste image command', () => {
        var context = { subscriptions: [] };

        extension.activate(context);

        assert.equal(registeredCommands.length, 1);
        assert.equal(registeredCommands[0].command, 'paste-image-internal.pasteImage');
        assert.equal(context.subscriptions.length, 2);
    });
});

suite('Paster path helpers', () => {
    setup(() => {
        resetPasterConfig();
        resetMessages();
        nextInputBoxValue = null;
        inputBoxOptions = [];
    });

    test('replacePathVariable substitutes file and project tokens', () => {
        var result = Paster.replacePathVariable(
            '${projectRoot}/${currentFileDir}/${currentFileName}/${currentFileNameWithoutExt}',
            '/workspace',
            '/workspace/docs/guide.md',
            (value: string) => '[' + value + ']'
        );

        assert.equal(result, '[/workspace]/[/workspace/docs]/[guide.md]/[guide]');
    });

    test('getImagePath builds a path beside the current file for relative image folders', (done) => {
        Paster.namePrefixConfig = 'pre-';
        Paster.nameSuffixConfig = '-post';

        Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', false, 'fullPath', function (err, imagePath) {
            assert.ifError(err);
            assert.equal(imagePath, path.join('/workspace/docs/images', 'pre-diagram-post.png'));
            done();
        });
    });

    test('getImagePath respects absolute image folders', (done) => {
        Paster.getImagePath('/workspace/docs/guide.md', 'diagram', '/var/tmp/images', false, 'fullPath', function (err, imagePath) {
            assert.ifError(err);
            assert.equal(imagePath, path.join('/var/tmp/images', 'diagram.png'));
            done();
        });
    });

    test('getImagePath confirms only the filename when configured for onlyName mode', (done) => {
        nextInputBoxValue = 'custom-name';

        Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', true, 'onlyName', function (err, imagePath) {
            assert.ifError(err);
            assert.equal(inputBoxOptions.length, 1);
            assert.equal(inputBoxOptions[0].value, 'diagram.png');
            assert.equal(imagePath, path.join('/workspace/docs/images', 'custom-name.png'));
            done();
        });
    });

    test('getImagePath confirms the full path when configured for fullPath mode', (done) => {
        nextInputBoxValue = '/tmp/custom-name';

        Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', true, 'fullPath', function (err, imagePath) {
            assert.ifError(err);
            assert.equal(inputBoxOptions.length, 1);
            assert.equal(inputBoxOptions[0].value, path.join('/workspace/docs/images', 'diagram.png'));
            assert.equal(imagePath, '/tmp/custom-name.png');
            done();
        });
    });

    test('renderFilePath creates markdown syntax with relative URL-safe paths', () => {
        Paster.encodePathConfig = 'urlEncodeSpace';
        Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';

        var result = Paster.renderFilePath('markdown', '/workspace', '/workspace/docs/my image.png', true, '', '');

        assert.equal(result, '![](docs/my%20image.png)');
    });

    test('renderFilePath creates asciidoc syntax', () => {
        Paster.encodePathConfig = 'none';
        Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';

        var result = Paster.renderFilePath('asciidoc', '/workspace', '/workspace/docs/diagram.png', true, '', '');

        assert.equal(result, 'image::docs/diagram.png[]');
    });

    test('renderFilePath supports custom insert patterns and file name tokens', () => {
        Paster.encodePathConfig = 'urlEncode';
        Paster.insertPatternConfig = '${imageFileNameWithoutExt}|${imageFileName}|${imageOriginalFilePath}|${imageFilePath}';

        var result = Paster.renderFilePath('plaintext', '', '/workspace/docs/my image.png', true, '<', '>');

        assert.equal(result, 'my image|my image.png|/workspace/docs/my image.png|%3C/workspace/docs/my%20image.png%3E');
    });
});

suite('Paster save and paste', () => {
    var originalCreateImageDirWithImagePath: any;
    var originalSaveClipboardImageToFileAndGetPath: any;

    setup(() => {
        resetPasterConfig();
        resetMessages();
        originalCreateImageDirWithImagePath = PasterAny.createImageDirWithImagePath;
        originalSaveClipboardImageToFileAndGetPath = PasterAny.saveClipboardImageToFileAndGetPath;
    });

    teardown(() => {
        PasterAny.createImageDirWithImagePath = originalCreateImageDirWithImagePath;
        PasterAny.saveClipboardImageToFileAndGetPath = originalSaveClipboardImageToFileAndGetPath;
    });

    test('inserts rendered image syntax after saving clipboard image', (done) => {
        var editor = createEditor('markdown', true);
        Paster.basePathConfig = '/workspace';
        Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';
        Paster.encodePathConfig = 'urlEncodeSpace';
        Paster.forceUnixStyleSeparatorConfig = true;

        PasterAny.createImageDirWithImagePath = function (imagePath: string) {
            return Promise.resolve(imagePath);
        };
        PasterAny.saveClipboardImageToFileAndGetPath = function (imagePath: string, cb: Function) {
            cb(imagePath, imagePath);
        };

        Paster.saveAndPaste(editor, '/workspace/docs/my image.png');

        setTimeout(function () {
            assert.equal(editor.insertedText, '![](docs/my%20image.png)');
            assert.equal(editor.replacedText, null);
            done();
        }, 0);
    });

    test('does not edit when the clipboard does not contain an image', (done) => {
        var editor = createEditor('markdown', true);

        PasterAny.createImageDirWithImagePath = function (imagePath: string) {
            return Promise.resolve(imagePath);
        };
        PasterAny.saveClipboardImageToFileAndGetPath = function (imagePath: string, cb: Function) {
            cb(imagePath, 'no image in clipboard');
        };

        Paster.saveAndPaste(editor, '/workspace/docs/image.png');

        setTimeout(function () {
            assert.equal(editor.insertedText, null);
            assert.equal(infoMessages[0], 'There is not an image in the clipboard.');
            done();
        }, 0);
    });

    test('replaces selection when the editor has selected text', (done) => {
        var editor = createEditor('markdown', false);
        Paster.basePathConfig = '/workspace';

        PasterAny.createImageDirWithImagePath = function (imagePath: string) {
            return Promise.resolve(imagePath);
        };
        PasterAny.saveClipboardImageToFileAndGetPath = function (imagePath: string, cb: Function) {
            cb(imagePath, imagePath);
        };

        Paster.saveAndPaste(editor, '/workspace/docs/image.png');

        setTimeout(function () {
            assert.equal(editor.insertedText, null);
            assert.equal(editor.replacedText, '![](docs/image.png)');
            done();
        }, 0);
    });
});

suite('Paster WSL and subprocess helpers', () => {
    var spawnCalls: any[];

    setup(() => {
        resetPasterConfig();
        resetMessages();
        spawnCalls = [];
        childProcess.spawn = function (command: string, args: string[]) {
            var proc = createProcess();
            spawnCalls.push({ command: command, args: args, proc: proc });
            return proc;
        };
        delete process.env['WSL_DISTRO_NAME'];
        delete process.env['WSL_INTEROP'];
    });

    teardown(() => {
        childProcess.spawn = originalSpawn;
        fs.readFileSync = originalReadFileSync;
        if (originalPlatformDescriptor) {
            Object.defineProperty(process, 'platform', originalPlatformDescriptor);
        }
        restoreEnv('WSL_DISTRO_NAME', originalWslDistroName);
        restoreEnv('WSL_INTEROP', originalWslInterop);
    });

    test('isWsl detects WSL environment variables', () => {
        process.env['WSL_DISTRO_NAME'] = 'Ubuntu';

        assert.equal(PasterAny.isWsl(), true);
    });

    test('isWsl detects Microsoft kernel release text', () => {
        fs.readFileSync = function (filePath: string, encoding: string) {
            assert.equal(filePath, '/proc/sys/kernel/osrelease');
            assert.equal(encoding, 'utf8');
            return '5.15.90.1-microsoft-standard-WSL2';
        };

        assert.equal(PasterAny.isWsl(), true);
    });

    test('isWsl returns false when no WSL signals exist', () => {
        fs.readFileSync = function () {
            throw new Error('missing osrelease');
        };

        assert.equal(PasterAny.isWsl(), false);
    });

    test('convertWslPathToWindowsPath resolves trimmed stdout', (done) => {
        PasterAny.convertWslPathToWindowsPath('/workspace/file.png', 'image output path', function (windowsPath: string) {
            assert.equal(windowsPath, 'C:\\workspace\\file.png');
            done();
        });

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'wslpath');
        assert.deepEqual(spawnCalls[0].args, ['-w', '/workspace/file.png']);
        spawnCalls[0].proc.stdout.emit('data', new Buffer('C:\\workspace\\file.png\r\n'));
        spawnCalls[0].proc.emit('close', 0);
    });

    test('convertWslPathToWindowsPath reports conversion failures', () => {
        var callbackCalled = false;

        PasterAny.convertWslPathToWindowsPath('/workspace/file.png', 'image output path', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stderr.emit('data', new Buffer('bad path'));
        spawnCalls[0].proc.emit('close', 1);

        assert.equal(callbackCalled, false);
        assert.equal(errorMessages[0], 'Failed to convert image output path for PowerShell. message=bad path');
    });

    test('runPowerShellClipboardScript uses stable noninteractive PowerShell arguments', (done) => {
        PasterAny.runPowerShellClipboardScript('powershell.exe', 'C:\\script.ps1', 'C:\\out.png', '/workspace/out.png', function (imagePath: string, result: string) {
            assert.equal(imagePath, '/workspace/out.png');
            assert.equal(result, 'C:\\out.png');
            done();
        });

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'powershell.exe');
        assert.deepEqual(spawnCalls[0].args, [
            '-NoProfile',
            '-NonInteractive',
            '-NoLogo',
            '-STA',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden',
            '-File', 'C:\\script.ps1',
            'C:\\out.png'
        ]);
        spawnCalls[0].proc.stdout.emit('data', new Buffer('C:\\out.png\r\n'));
        spawnCalls[0].proc.emit('close', 0);
    });

    test('runPowerShellClipboardScript reports nonzero exits with stderr', () => {
        var callbackCalled = false;

        PasterAny.runPowerShellClipboardScript('powershell.exe', 'C:\\script.ps1', 'C:\\out.png', '/workspace/out.png', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stderr.emit('data', new Buffer('clipboard error'));
        spawnCalls[0].proc.emit('close', 1);

        assert.equal(callbackCalled, false);
        assert.equal(errorMessages[0], 'Failed to save clipboard image. message=clipboard error');
    });

    test('saveClipboardImageToFileWithWslPowerShell converts script and output paths before invoking PowerShell', () => {
        var convertedPaths: any[] = [];
        var runArgs: any[] = null;
        var originalConvert = PasterAny.convertWslPathToWindowsPath;
        var originalRun = PasterAny.runPowerShellClipboardScript;

        PasterAny.convertWslPathToWindowsPath = function (wslPath: string, description: string, callback: Function) {
            convertedPaths.push({ wslPath: wslPath, description: description });
            callback(description === 'PowerShell helper path' ? 'C:\\repo\\res\\pc.ps1' : 'C:\\repo\\docs\\image.png');
        };
        PasterAny.runPowerShellClipboardScript = function () {
            runArgs = Array.prototype.slice.call(arguments);
        };

        PasterAny.saveClipboardImageToFileWithWslPowerShell('/workspace/docs/image.png', function () { });

        PasterAny.convertWslPathToWindowsPath = originalConvert;
        PasterAny.runPowerShellClipboardScript = originalRun;

        assert.equal(convertedPaths.length, 2);
        assert.equal(convertedPaths[0].description, 'PowerShell helper path');
        assert.equal(convertedPaths[1].description, 'image output path');
        assert.equal(runArgs[0], 'powershell.exe');
        assert.equal(runArgs[1], 'C:\\repo\\res\\pc.ps1');
        assert.equal(runArgs[2], 'C:\\repo\\docs\\image.png');
        assert.equal(runArgs[3], '/workspace/docs/image.png');
    });

    test('saveClipboardImageToFileAndGetPath routes WSL Linux through Windows PowerShell', (done) => {
        var originalIsWsl = PasterAny.isWsl;
        var originalWslSave = PasterAny.saveClipboardImageToFileWithWslPowerShell;

        setPlatform('linux');
        PasterAny.isWsl = function () { return true; };
        PasterAny.saveClipboardImageToFileWithWslPowerShell = function (imagePath: string, cb: Function) {
            assert.equal(imagePath, '/workspace/docs/image.png');
            cb(imagePath, imagePath);
        };

        PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function (imagePath: string, result: string) {
            PasterAny.isWsl = originalIsWsl;
            PasterAny.saveClipboardImageToFileWithWslPowerShell = originalWslSave;
            assert.equal(imagePath, '/workspace/docs/image.png');
            assert.equal(result, '/workspace/docs/image.png');
            assert.equal(spawnCalls.length, 0);
            done();
        });
    });

    test('saveClipboardImageToFileAndGetPath keeps non-WSL Linux on xclip script', (done) => {
        var originalIsWsl = PasterAny.isWsl;

        setPlatform('linux');
        PasterAny.isWsl = function () { return false; };

        PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function (imagePath: string, result: string) {
            PasterAny.isWsl = originalIsWsl;
            assert.equal(imagePath, '/workspace/docs/image.png');
            assert.equal(result, '/workspace/docs/image.png');
            done();
        });

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'sh');
        assert.equal(spawnCalls[0].args[1], '/workspace/docs/image.png');
        spawnCalls[0].proc.stdout.emit('data', new Buffer('/workspace/docs/image.png\n'));
    });

    test('saveClipboardImageToFileAndGetPath reports missing xclip on non-WSL Linux', () => {
        var originalIsWsl = PasterAny.isWsl;
        var callbackCalled = false;

        setPlatform('linux');
        PasterAny.isWsl = function () { return false; };

        PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stdout.emit('data', new Buffer('no xclip\n'));

        PasterAny.isWsl = originalIsWsl;
        assert.equal(callbackCalled, false);
        assert.equal(infoMessages[0], 'You need to install xclip command first.');
    });
});

function resetPasterConfig() {
    Paster.defaultNameConfig = 'Y-MM-DD-HH-mm-ss';
    Paster.namePrefixConfig = '';
    Paster.nameSuffixConfig = '';
    Paster.basePathConfig = '';
    Paster.prefixConfig = '';
    Paster.suffixConfig = '';
    Paster.forceUnixStyleSeparatorConfig = true;
    Paster.encodePathConfig = 'urlEncodeSpace';
    Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';
}

function resetMessages() {
    infoMessages = [];
    errorMessages = [];
    Logger.channel = null;
}

function resolvedThenable(value: any) {
    return {
        then: function (callback: Function) {
            return callback(value);
        }
    };
}

function createEditor(languageId: string, isSelectionEmpty: boolean) {
    var editor: any = {
        selection: {
            isEmpty: isSelectionEmpty,
            start: { line: 0, character: 0 }
        },
        document: {
            languageId: languageId
        },
        insertedText: null,
        replacedText: null,
        edit: function (callback: Function) {
            callback({
                insert: function (location: any, value: string) {
                    editor.insertedText = value;
                },
                replace: function (location: any, value: string) {
                    editor.replacedText = value;
                }
            });
            return resolvedThenable(true);
        }
    };

    return editor;
}

function createProcess() {
    var proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    return proc;
}

function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true
    });
}

function restoreEnv(name: string, value: string) {
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}
