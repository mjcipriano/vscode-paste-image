import { afterEach, beforeEach, describe, it } from 'node:test';
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
var configurationValues: any = {};
var configurationConfigured: any = {};

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
        getConfiguration: function (section: string) {
            return createConfiguration(section);
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

describe('extension activation', () => {
    beforeEach(() => {
        resetMessages();
        registeredCommands = [];
    });

    it('registers the internal paste image command', () => {
        var context = { subscriptions: [] };

        extension.activate(context);

        assert.equal(registeredCommands.length, 1);
        assert.equal(registeredCommands[0].command, 'paste-image-internal.pasteImage');
        assert.equal(context.subscriptions.length, 2);
    });
});

describe('Paster configuration helpers', () => {
    beforeEach(() => {
        resetConfigurations();
    });

    it('uses internal configuration values', () => {
        setConfigValue('pasteImageInternal', 'path', 'internal-images', true);

        assert.equal(PasterAny.getConfigValue('path'), 'internal-images');
    });

    it('does not read legacy configuration values', () => {
        setConfigValue('pasteImageInternal', 'path', '${currentFileDir}', false);
        setConfigValue('pasteImage', 'path', 'legacy-images', true);

        assert.equal(PasterAny.getConfigValue('path'), '${currentFileDir}');
    });

    it('uses internal defaults', () => {
        setConfigValue('pasteImageInternal', 'path', '${currentFileDir}', false);

        assert.equal(PasterAny.getConfigValue('path'), '${currentFileDir}');
    });
});

describe('Paster path helpers', () => {
    beforeEach(() => {
        resetPasterConfig();
        resetMessages();
        nextInputBoxValue = null;
        inputBoxOptions = [];
    });

    it('replacePathVariable substitutes file and project tokens', () => {
        var result = Paster.replacePathVariable(
            [
                '${projectRoot}',
                '${projectRootName}',
                '${currentFileDir}',
                '${currentFileDirName}',
                '${currentFileParentDir}',
                '${currentFileParentDirName}',
                '${currentFileName}',
                '${currentFileNameWithoutExt}',
                '${currentFileExt}'
            ].join('|'),
            '/workspace',
            '/workspace/docs/api/guide.md',
            (value: string) => '[' + value + ']'
        );

        assert.equal(result, '[/workspace]|[workspace]|[/workspace/docs/api]|[api]|[/workspace/docs]|[docs]|[guide.md]|[guide]|[.md]');
    });

    it('getImagePath can prepend the current directory name to the image filename', async () => {
        Paster.namePrefixConfig = Paster.replacePathVariable('${currentFileDirName}_', '/workspace', '/workspace/docs/api/guide.md');

        await new Promise<void>((resolve, reject) => {
            Paster.getImagePath('/workspace/docs/api/guide.md', 'diagram', 'images', false, 'fullPath', function (err, imagePath) {
                try {
                    assert.ifError(err);
                    assert.equal(imagePath, path.join('/workspace/docs/api/images', 'api_diagram.png'));
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('getImagePath builds a path beside the current file for relative image folders', async () => {
        Paster.namePrefixConfig = 'pre-';
        Paster.nameSuffixConfig = '-post';

        await new Promise<void>((resolve, reject) => {
            Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', false, 'fullPath', function (err, imagePath) {
                try {
                    assert.ifError(err);
                    assert.equal(imagePath, path.join('/workspace/docs/images', 'pre-diagram-post.png'));
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('getImagePath respects absolute image folders', async () => {
        await new Promise<void>((resolve, reject) => {
            Paster.getImagePath('/workspace/docs/guide.md', 'diagram', '/var/tmp/images', false, 'fullPath', function (err, imagePath) {
                try {
                    assert.ifError(err);
                    assert.equal(imagePath, path.join('/var/tmp/images', 'diagram.png'));
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('getImagePath confirms only the filename when configured for onlyName mode', async () => {
        nextInputBoxValue = 'custom-name';

        await new Promise<void>((resolve, reject) => {
            Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', true, 'onlyName', function (err, imagePath) {
                try {
                    assert.ifError(err);
                    assert.equal(inputBoxOptions.length, 1);
                    assert.equal(inputBoxOptions[0].value, 'diagram.png');
                    assert.equal(imagePath, path.join('/workspace/docs/images', 'custom-name.png'));
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('getImagePath confirms the full path when configured for fullPath mode', async () => {
        nextInputBoxValue = '/tmp/custom-name';

        await new Promise<void>((resolve, reject) => {
            Paster.getImagePath('/workspace/docs/guide.md', 'diagram', 'images', true, 'fullPath', function (err, imagePath) {
                try {
                    assert.ifError(err);
                    assert.equal(inputBoxOptions.length, 1);
                    assert.equal(inputBoxOptions[0].value, path.join('/workspace/docs/images', 'diagram.png'));
                    assert.equal(imagePath, '/tmp/custom-name.png');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('renderFilePath creates markdown syntax with relative URL-safe paths', () => {
        Paster.encodePathConfig = 'urlEncodeSpace';
        Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';

        var result = Paster.renderFilePath('markdown', '/workspace', '/workspace/docs/my image.png', true, '', '');

        assert.equal(result, '![](docs/my%20image.png)');
    });

    it('renderFilePath creates asciidoc syntax', () => {
        Paster.encodePathConfig = 'none';
        Paster.insertPatternConfig = '${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}';

        var result = Paster.renderFilePath('asciidoc', '/workspace', '/workspace/docs/diagram.png', true, '', '');

        assert.equal(result, 'image::docs/diagram.png[]');
    });

    it('renderFilePath supports custom insert patterns and file name tokens', () => {
        Paster.encodePathConfig = 'urlEncode';
        Paster.insertPatternConfig = '${imageFileNameWithoutExt}|${imageFileName}|${imageOriginalFilePath}|${imageFilePath}';

        var result = Paster.renderFilePath('plaintext', '', '/workspace/docs/my image.png', true, '<', '>');

        assert.equal(result, 'my image|my image.png|/workspace/docs/my image.png|%3C/workspace/docs/my%20image.png%3E');
    });
});

describe('Paster save and paste', () => {
    var originalCreateImageDirWithImagePath: any;
    var originalSaveClipboardImageToFileAndGetPath: any;

    beforeEach(() => {
        resetPasterConfig();
        resetMessages();
        originalCreateImageDirWithImagePath = PasterAny.createImageDirWithImagePath;
        originalSaveClipboardImageToFileAndGetPath = PasterAny.saveClipboardImageToFileAndGetPath;
    });

    afterEach(() => {
        PasterAny.createImageDirWithImagePath = originalCreateImageDirWithImagePath;
        PasterAny.saveClipboardImageToFileAndGetPath = originalSaveClipboardImageToFileAndGetPath;
    });

    it('inserts rendered image syntax after saving clipboard image', async () => {
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

        await waitForAsyncWork();
        assert.equal(editor.insertedText, '![](docs/my%20image.png)');
        assert.equal(editor.replacedText, null);
    });

    it('does not edit when the clipboard does not contain an image', async () => {
        var editor = createEditor('markdown', true);

        PasterAny.createImageDirWithImagePath = function (imagePath: string) {
            return Promise.resolve(imagePath);
        };
        PasterAny.saveClipboardImageToFileAndGetPath = function (imagePath: string, cb: Function) {
            cb(imagePath, 'no image in clipboard');
        };

        Paster.saveAndPaste(editor, '/workspace/docs/image.png');

        await waitForAsyncWork();
        assert.equal(editor.insertedText, null);
        assert.equal(infoMessages[0], 'There is not an image in the clipboard.');
    });

    it('replaces selection when the editor has selected text', async () => {
        var editor = createEditor('markdown', false);
        Paster.basePathConfig = '/workspace';

        PasterAny.createImageDirWithImagePath = function (imagePath: string) {
            return Promise.resolve(imagePath);
        };
        PasterAny.saveClipboardImageToFileAndGetPath = function (imagePath: string, cb: Function) {
            cb(imagePath, imagePath);
        };

        Paster.saveAndPaste(editor, '/workspace/docs/image.png');

        await waitForAsyncWork();
        assert.equal(editor.insertedText, null);
        assert.equal(editor.replacedText, '![](docs/image.png)');
    });
});

describe('Paster WSL and subprocess helpers', () => {
    var spawnCalls: any[];

    beforeEach(() => {
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

    afterEach(() => {
        childProcess.spawn = originalSpawn;
        fs.readFileSync = originalReadFileSync;
        if (originalPlatformDescriptor) {
            Object.defineProperty(process, 'platform', originalPlatformDescriptor);
        }
        restoreEnv('WSL_DISTRO_NAME', originalWslDistroName);
        restoreEnv('WSL_INTEROP', originalWslInterop);
    });

    it('isWsl detects WSL environment variables', () => {
        process.env['WSL_DISTRO_NAME'] = 'Ubuntu';

        assert.equal(PasterAny.isWsl(), true);
    });

    it('isWsl detects Microsoft kernel release text', () => {
        fs.readFileSync = function (filePath: string, encoding: string) {
            assert.equal(filePath, '/proc/sys/kernel/osrelease');
            assert.equal(encoding, 'utf8');
            return '5.15.90.1-microsoft-standard-WSL2';
        };

        assert.equal(PasterAny.isWsl(), true);
    });

    it('isWsl returns false when no WSL signals exist', () => {
        fs.readFileSync = function () {
            throw new Error('missing osrelease');
        };

        assert.equal(PasterAny.isWsl(), false);
    });

    it('convertWslPathToWindowsPath resolves trimmed stdout', async () => {
        const conversion = new Promise<void>((resolve, reject) => {
            PasterAny.convertWslPathToWindowsPath('/workspace/file.png', 'image output path', function (windowsPath: string) {
                try {
                    assert.equal(windowsPath, 'C:\\workspace\\file.png');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'wslpath');
        assert.deepEqual(spawnCalls[0].args, ['-w', '/workspace/file.png']);
        spawnCalls[0].proc.stdout.emit('data', Buffer.from('C:\\workspace\\file.png\r\n'));
        spawnCalls[0].proc.emit('close', 0);
        await conversion;
    });

    it('convertWslPathToWindowsPath reports conversion failures', () => {
        var callbackCalled = false;

        PasterAny.convertWslPathToWindowsPath('/workspace/file.png', 'image output path', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stderr.emit('data', Buffer.from('bad path'));
        spawnCalls[0].proc.emit('close', 1);

        assert.equal(callbackCalled, false);
        assert.equal(errorMessages[0], 'Failed to convert image output path for PowerShell. message=bad path');
    });

    it('runPowerShellClipboardScript uses stable noninteractive PowerShell arguments', async () => {
        const run = new Promise<void>((resolve, reject) => {
            PasterAny.runPowerShellClipboardScript('powershell.exe', 'C:\\script.ps1', 'C:\\out.png', '/workspace/out.png', function (imagePath: string, result: string) {
                try {
                    assert.equal(imagePath, '/workspace/out.png');
                    assert.equal(result, 'C:\\out.png');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
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
        spawnCalls[0].proc.stdout.emit('data', Buffer.from('C:\\out.png\r\n'));
        spawnCalls[0].proc.emit('close', 0);
        await run;
    });

    it('runPowerShellClipboardScript reports nonzero exits with stderr', () => {
        var callbackCalled = false;

        PasterAny.runPowerShellClipboardScript('powershell.exe', 'C:\\script.ps1', 'C:\\out.png', '/workspace/out.png', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stderr.emit('data', Buffer.from('clipboard error'));
        spawnCalls[0].proc.emit('close', 1);

        assert.equal(callbackCalled, false);
        assert.equal(errorMessages[0], 'Failed to save clipboard image. message=clipboard error');
    });

    it('saveClipboardImageToFileWithWslPowerShell converts script and output paths before invoking PowerShell', () => {
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

    it('saveClipboardImageToFileAndGetPath routes WSL Linux through Windows PowerShell', async () => {
        var originalIsWsl = PasterAny.isWsl;
        var originalWslSave = PasterAny.saveClipboardImageToFileWithWslPowerShell;

        setPlatform('linux');
        PasterAny.isWsl = function () { return true; };
        PasterAny.saveClipboardImageToFileWithWslPowerShell = function (imagePath: string, cb: Function) {
            assert.equal(imagePath, '/workspace/docs/image.png');
            cb(imagePath, imagePath);
        };

        await new Promise<void>((resolve, reject) => {
            PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function (imagePath: string, result: string) {
                try {
                    PasterAny.isWsl = originalIsWsl;
                    PasterAny.saveClipboardImageToFileWithWslPowerShell = originalWslSave;
                    assert.equal(imagePath, '/workspace/docs/image.png');
                    assert.equal(result, '/workspace/docs/image.png');
                    assert.equal(spawnCalls.length, 0);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    });

    it('saveClipboardImageToFileAndGetPath keeps non-WSL Linux on xclip script', async () => {
        var originalIsWsl = PasterAny.isWsl;

        setPlatform('linux');
        PasterAny.isWsl = function () { return false; };

        const save = new Promise<void>((resolve, reject) => {
            PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function (imagePath: string, result: string) {
                try {
                    PasterAny.isWsl = originalIsWsl;
                    assert.equal(imagePath, '/workspace/docs/image.png');
                    assert.equal(result, '/workspace/docs/image.png');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'sh');
        assert.equal(spawnCalls[0].args[1], '/workspace/docs/image.png');
        spawnCalls[0].proc.stdout.emit('data', Buffer.from('/workspace/docs/image.png\n'));
        await save;
    });

    it('saveClipboardImageToFileAndGetPath reports missing xclip on non-WSL Linux', () => {
        var originalIsWsl = PasterAny.isWsl;
        var callbackCalled = false;

        setPlatform('linux');
        PasterAny.isWsl = function () { return false; };

        PasterAny.saveClipboardImageToFileAndGetPath('/workspace/docs/image.png', function () {
            callbackCalled = true;
        });

        spawnCalls[0].proc.stdout.emit('data', Buffer.from('no xclip\n'));

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

function resetConfigurations() {
    configurationValues = {};
    configurationConfigured = {};
}

function setConfigValue(section: string, key: string, value: any, configured: boolean) {
    if (!configurationValues[section]) {
        configurationValues[section] = {};
    }
    if (!configurationConfigured[section]) {
        configurationConfigured[section] = {};
    }

    configurationValues[section][key] = value;
    configurationConfigured[section][key] = configured;
}

function createConfiguration(section: string) {
    var values = configurationValues[section] || {};
    var configured = configurationConfigured[section] || {};
    var config: any = {};

    Object.keys(values).forEach(function (key) {
        config[key] = values[key];
    });

    config.inspect = function (key: string): any {
        if (!Object.prototype.hasOwnProperty.call(values, key)) {
            return undefined;
        }

        if (configured[key]) {
            return { globalValue: values[key] };
        }

        return { defaultValue: values[key] };
    };

    return config;
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

function waitForAsyncWork() {
    return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
