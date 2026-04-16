'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import moment = require('moment');

export class Logger {
    static channel: vscode.OutputChannel;

    static log(message: any) {
        if (this.channel) {
            let time = moment().format("MM-DD HH:mm:ss");
            this.channel.appendLine(`[${time}] ${message}`);
        }
    }

    static showInformationMessage(message: string, ...items: string[]): Thenable<string> {
        this.log(message);
        return vscode.window.showInformationMessage(message, ...items);
    }

    static showErrorMessage(message: string, ...items: string[]): Thenable<string> {
        this.log(message);
        return vscode.window.showErrorMessage(message, ...items);
    }
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error;
}

export function activate(context: vscode.ExtensionContext) {
    Logger.channel = vscode.window.createOutputChannel("PasteImageInternal")
    context.subscriptions.push(Logger.channel);

    Logger.log('Congratulations, your extension "paste-image-internal" is now active!');

    let disposable = vscode.commands.registerCommand('paste-image-internal.pasteImage', () => {
        try {
            Paster.paste();
        } catch (e) {
            Logger.showErrorMessage(getErrorMessage(e))
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
}

export class Paster {
    static CONFIG_SECTION = "pasteImageInternal";

    static PATH_VARIABLE_CURRNET_FILE_DIR = /\$\{currentFileDir\}/g;
    static PATH_VARIABLE_CURRNET_FILE_DIR_NAME = /\$\{currentFileDirName\}/g;
    static PATH_VARIABLE_CURRNET_FILE_PARENT_DIR = /\$\{currentFileParentDir\}/g;
    static PATH_VARIABLE_CURRNET_FILE_PARENT_DIR_NAME = /\$\{currentFileParentDirName\}/g;
    static PATH_VARIABLE_PROJECT_ROOT = /\$\{projectRoot\}/g;
    static PATH_VARIABLE_PROJECT_ROOT_NAME = /\$\{projectRootName\}/g;
    static PATH_VARIABLE_CURRNET_FILE_NAME = /\$\{currentFileName\}/g;
    static PATH_VARIABLE_CURRNET_FILE_NAME_WITHOUT_EXT = /\$\{currentFileNameWithoutExt\}/g;
    static PATH_VARIABLE_CURRNET_FILE_EXT = /\$\{currentFileExt\}/g;

    static PATH_VARIABLE_IMAGE_FILE_PATH = /\$\{imageFilePath\}/g;
    static PATH_VARIABLE_IMAGE_ORIGINAL_FILE_PATH = /\$\{imageOriginalFilePath\}/g;
    static PATH_VARIABLE_IMAGE_FILE_NAME = /\$\{imageFileName\}/g;
    static PATH_VARIABLE_IMAGE_FILE_NAME_WITHOUT_EXT = /\$\{imageFileNameWithoutExt\}/g;
    static PATH_VARIABLE_IMAGE_SYNTAX_PREFIX = /\$\{imageSyntaxPrefix\}/g;
    static PATH_VARIABLE_IMAGE_SYNTAX_SUFFIX = /\$\{imageSyntaxSuffix\}/g;

    static FILE_PATH_CONFIRM_INPUTBOX_MODE_ONLY_NAME = "onlyName";
    static FILE_PATH_CONFIRM_INPUTBOX_MODE_PULL_PATH = "fullPath";

    static defaultNameConfig: string;
    static folderPathConfig: string;
    static basePathConfig: string;
    static prefixConfig: string;
    static suffixConfig: string;
    static forceUnixStyleSeparatorConfig: boolean;
    static encodePathConfig: string;
    static namePrefixConfig: string;
    static nameSuffixConfig: string;
    static insertPatternConfig: string;
    static showFilePathConfirmInputBox: boolean;
    static filePathConfirmInputBoxMode: string;

    public static paste() {
        // get current edit file path
        let editor = vscode.window.activeTextEditor;
        if (!editor) return;

        let fileUri = editor.document.uri;
        if (!fileUri) return;
        if (fileUri.scheme === 'untitled') {
            Logger.showInformationMessage('Before pasting the image, you need to save current file first.');
            return;
        }
        let filePath = fileUri.fsPath;
        let folderPath = path.dirname(filePath);
        let projectPath = vscode.workspace.rootPath;

        // get selection as image file name, need check
        var selection = editor.selection;
        var selectText = editor.document.getText(selection);
        if (selectText && /[\\:*?<>|]/.test(selectText)) {
            Logger.showInformationMessage('Your selection is not a valid filename!');
            return;
        }

        // load config pasteImageInternal.defaultName
        this.defaultNameConfig = this.getConfigValue('defaultName');
        if (!this.defaultNameConfig) {
            this.defaultNameConfig = "Y-MM-DD-HH-mm-ss"
        }

        // load config pasteImageInternal.path
        this.folderPathConfig = this.getConfigValue('path');
        if (!this.folderPathConfig) {
            this.folderPathConfig = "${currentFileDir}";
        }
        if (this.folderPathConfig.length !== this.folderPathConfig.trim().length) {
            Logger.showErrorMessage(`The config pasteImageInternal.path = '${this.folderPathConfig}' is invalid. please check your config.`);
            return;
        }
        // load config pasteImageInternal.basePath
        this.basePathConfig = this.getConfigValue('basePath');
        if (!this.basePathConfig) {
            this.basePathConfig = "";
        }
        if (this.basePathConfig.length !== this.basePathConfig.trim().length) {
            Logger.showErrorMessage(`The config pasteImageInternal.basePath = '${this.basePathConfig}' is invalid. please check your config.`);
            return;
        }
        // load other config
        this.prefixConfig = this.getConfigValue('prefix');
        this.suffixConfig = this.getConfigValue('suffix');
        this.forceUnixStyleSeparatorConfig = this.getConfigValue('forceUnixStyleSeparator');
        this.forceUnixStyleSeparatorConfig = !!this.forceUnixStyleSeparatorConfig;
        this.encodePathConfig = this.getConfigValue('encodePath');
        this.namePrefixConfig = this.getConfigValue('namePrefix');
        this.nameSuffixConfig = this.getConfigValue('nameSuffix');
        this.insertPatternConfig = this.getConfigValue('insertPattern');
        this.showFilePathConfirmInputBox = this.getConfigValue('showFilePathConfirmInputBox') || false;
        this.filePathConfirmInputBoxMode = this.getConfigValue('filePathConfirmInputBoxMode');

        // replace variable in config
        this.defaultNameConfig = this.replacePathVariable(this.defaultNameConfig, projectPath, filePath, (x) => `[${x}]`);
        this.folderPathConfig = this.replacePathVariable(this.folderPathConfig, projectPath, filePath);
        this.basePathConfig = this.replacePathVariable(this.basePathConfig, projectPath, filePath);
        this.namePrefixConfig = this.replacePathVariable(this.namePrefixConfig, projectPath, filePath);
        this.nameSuffixConfig = this.replacePathVariable(this.nameSuffixConfig, projectPath, filePath);
        this.insertPatternConfig = this.replacePathVariable(this.insertPatternConfig, projectPath, filePath);

        // "this" is lost when coming back from the callback, thus we need to store it here.
        const instance = this;
        this.getImagePath(filePath, selectText, this.folderPathConfig, this.showFilePathConfirmInputBox, this.filePathConfirmInputBoxMode, function (err, imagePath) {
            try {
                // is the file existed?
                let existed = fs.existsSync(imagePath);
                if (existed) {
                    Logger.showInformationMessage(`File ${imagePath} existed.Would you want to replace?`, 'Replace', 'Cancel').then(choose => {
                        if (choose != 'Replace') return;
                        
                        instance.saveAndPaste(editor, imagePath);
                    });
                } else {
                    instance.saveAndPaste(editor, imagePath);
                }
            } catch (err) {
                Logger.showErrorMessage(`fs.existsSync(${imagePath}) fail. message=${err.message}`);
                return;
            }
        });
    }

    public static saveAndPaste(editor: vscode.TextEditor, imagePath) {
        this.createImageDirWithImagePath(imagePath).then(imagePath => {
            // save image and insert to current edit file
            this.saveClipboardImageToFileAndGetPath(imagePath, (imagePath, imagePathReturnByScript) => {
                if (!imagePathReturnByScript) return;
                if (imagePathReturnByScript.indexOf('no image') === 0) {
                    Logger.showInformationMessage('There is not an image in the clipboard.');
                    return;
                }
                if (imagePathReturnByScript.indexOf('no output path') === 0) {
                    Logger.showErrorMessage('Failed to save clipboard image because no output path was provided.');
                    return;
                }

                imagePath = this.renderFilePath(editor.document.languageId, this.basePathConfig, imagePath, this.forceUnixStyleSeparatorConfig, this.prefixConfig, this.suffixConfig);

                editor.edit(edit => {
                    let current = editor.selection;

                    if (current.isEmpty) {
                        edit.insert(current.start, imagePath);
                    } else {
                        edit.replace(current, imagePath);
                    }
                });
            });
        }).catch(err => {
            if (err instanceof PluginError) {
                Logger.showErrorMessage(err.message);
            } else {
                Logger.showErrorMessage(`Failed make folder. message=${err.message}`);
            }
            return;
        });
    }

    public static getImagePath(filePath: string, selectText: string, folderPathFromConfig: string, 
        showFilePathConfirmInputBox: boolean, filePathConfirmInputBoxMode: string,
        callback: (err, imagePath: string) => void) {
        // image file name
        let imageFileName = "";
        if (!selectText) {
            imageFileName = this.namePrefixConfig + moment().format(this.defaultNameConfig) + this.nameSuffixConfig + ".png";
        } else {
            imageFileName = this.namePrefixConfig + selectText + this.nameSuffixConfig + ".png";
        }

        let filePathOrName;
        if(filePathConfirmInputBoxMode == Paster.FILE_PATH_CONFIRM_INPUTBOX_MODE_PULL_PATH){
            filePathOrName = makeImagePath(imageFileName);
        } else {
            filePathOrName = imageFileName;
        }

        if (showFilePathConfirmInputBox) {
            vscode.window.showInputBox({
                prompt: 'Please specify the filename of the image.',
                value: filePathOrName
            }).then((result) => {
                if (result) {
                    if (!result.endsWith('.png')) result += '.png';
                    
                    if(filePathConfirmInputBoxMode == Paster.FILE_PATH_CONFIRM_INPUTBOX_MODE_ONLY_NAME){
                        result = makeImagePath(result);
                    }

                    callback(null, result);
                }
                return;
            });
        } else {
            callback(null, makeImagePath(imageFileName));
            return;
        }

        function makeImagePath(fileName) {
            // image output path
            let folderPath = path.dirname(filePath);
            let imagePath = "";

            // generate image path
            if (path.isAbsolute(folderPathFromConfig)) {
                imagePath = path.join(folderPathFromConfig, fileName);
            } else {
                imagePath = path.join(folderPath, folderPathFromConfig, fileName);
            }

            return imagePath;
        }
    }

    /**
     * create directory for image when directory does not exist
     */
    private static createImageDirWithImagePath(imagePath: string) {
        return new Promise((resolve, reject) => {
            let imageDir = path.dirname(imagePath);

            fs.stat(imageDir, (err, stats) => {
                if (err == null) {
                    if (stats.isDirectory()) {
                        resolve(imagePath);
                    } else {
                        reject(new PluginError(`The image dest directory '${imageDir}' is a file. Please check your 'pasteImageInternal.path' config.`))
                    }
                } else if (err.code == "ENOENT") {
                    fs.mkdir(imageDir, { recursive: true }, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(imagePath);
                    });
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * use applescript to save image from clipboard and get file path
     */
    private static saveClipboardImageToFileAndGetPath(imagePath, cb: (imagePath: string, imagePathFromScript: string) => void) {
        if (!imagePath) return;

        let platform = process.platform;
        if (platform === 'win32') {
            // Windows
            const scriptPath = path.join(__dirname, '../../res/pc.ps1');

            let command = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
            let powershellExisted = fs.existsSync(command)
            if (!powershellExisted) {
                command = "powershell"
            }

            this.runPowerShellClipboardScript(command, scriptPath, imagePath, imagePath, cb);
        }
        else if (platform === 'darwin') {
            // Mac
            let scriptPath = path.join(__dirname, '../../res/mac.applescript');

            let ascript = spawn('osascript', [scriptPath, imagePath]);
            ascript.on('error', function (e) {
                Logger.showErrorMessage(getErrorMessage(e));
            });
            ascript.on('exit', function (code, signal) {
                // console.log('exit',code,signal);
            });
            ascript.stdout.on('data', function (data: Buffer) {
                cb(imagePath, data.toString().trim());
            });
        } else {
            // Linux 
            if (this.isWsl()) {
                this.saveClipboardImageToFileWithWslPowerShell(imagePath, cb);
                return;
            }

            let scriptPath = path.join(__dirname, '../../res/linux.sh');

            let ascript = spawn('sh', [scriptPath, imagePath]);
            ascript.on('error', function (e) {
                Logger.showErrorMessage(getErrorMessage(e));
            });
            ascript.on('exit', function (code, signal) {
                // console.log('exit',code,signal);
            });
            ascript.stdout.on('data', function (data: Buffer) {
                let result = data.toString().trim();
                if (result == "no xclip") {
                    Logger.showInformationMessage('You need to install xclip command first.');
                    return;
                }
                cb(imagePath, result);
            });
        }
    }

    private static isWsl(): boolean {
        if (process.env['WSL_DISTRO_NAME'] || process.env['WSL_INTEROP']) {
            return true;
        }

        try {
            let osRelease = fs.readFileSync('/proc/sys/kernel/osrelease', 'utf8').toLowerCase();
            return osRelease.indexOf('microsoft') >= 0 || osRelease.indexOf('wsl') >= 0;
        } catch (e) {
            return false;
        }
    }

    private static saveClipboardImageToFileWithWslPowerShell(imagePath, cb: (imagePath: string, imagePathFromScript: string) => void) {
        let scriptPath = path.join(__dirname, '../../res/pc.ps1');
        this.convertWslPathToWindowsPath(scriptPath, 'PowerShell helper path', (windowsScriptPath) => {
            if (!windowsScriptPath) return;

            this.convertWslPathToWindowsPath(imagePath, 'image output path', (windowsImagePath) => {
                if (!windowsImagePath) return;

                this.runPowerShellClipboardScript('powershell.exe', windowsScriptPath, windowsImagePath, imagePath, cb);
            });
        });
    }

    private static convertWslPathToWindowsPath(wslPath: string, description: string, callback: (windowsPath: string) => void) {
        let wslpath = spawn('wslpath', ['-w', wslPath]);
        let stdout = "";
        let stderr = "";

        wslpath.on('error', function (e) {
            Logger.showErrorMessage(`Failed to run wslpath for ${description}. message=${e.message}`);
        });
        wslpath.stdout.on('data', function (data: Buffer) {
            stdout += data.toString();
        });
        wslpath.stderr.on('data', function (data: Buffer) {
            stderr += data.toString();
        });
        wslpath.on('close', function (code) {
            let windowsPath = stdout.trim();
            if (code !== 0 || !windowsPath) {
                Logger.showErrorMessage(`Failed to convert ${description} for PowerShell. message=${stderr.trim()}`);
                return;
            }

            callback(windowsPath);
        });
    }

    private static runPowerShellClipboardScript(command: string, scriptPath: string, scriptImagePath: string, originalImagePath: string,
        cb: (imagePath: string, imagePathFromScript: string) => void) {
        let powershell = spawn(command, [
            '-NoProfile',
            '-NonInteractive',
            '-NoLogo',
            '-STA',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden',
            '-File', scriptPath,
            scriptImagePath
        ]);
        let stdout = "";
        let stderr = "";

        powershell.on('error', function (e) {
            if (isErrnoException(e) && e.code == "ENOENT") {
                Logger.showErrorMessage(`The powershell command is not in you PATH environment variables. Please add it and retry.`);
            } else {
                Logger.showErrorMessage(getErrorMessage(e));
            }
        });
        powershell.on('exit', function (code, signal) {
            // console.log('exit', code, signal);
        });
        powershell.stdout.on('data', function (data: Buffer) {
            stdout += data.toString();
        });
        powershell.stderr.on('data', function (data: Buffer) {
            stderr += data.toString();
        });
        powershell.on('close', function (code) {
            let result = stdout.trim();
            if (result) {
                cb(originalImagePath, result);
                return;
            }
            if (code !== 0) {
                Logger.showErrorMessage(`Failed to save clipboard image. message=${stderr.trim()}`);
            }
        });
    }

    /**
     * render the image file path dependen on file type
     * e.g. in markdown image file path will render to ![](path)
     */
    public static renderFilePath(languageId: string, basePath: string, imageFilePath: string, forceUnixStyleSeparator: boolean, prefix: string, suffix: string): string {
        if (basePath) {
            imageFilePath = path.relative(basePath, imageFilePath);
        }

        if (forceUnixStyleSeparator) {
            imageFilePath = imageFilePath.replace(/\\/g, '/');
        }

        let originalImagePath = imageFilePath;
        let ext = path.extname(originalImagePath);
        let fileName = path.basename(originalImagePath);
        let fileNameWithoutExt = path.basename(originalImagePath, ext);

        imageFilePath = `${prefix}${imageFilePath}${suffix}`;

        if (this.encodePathConfig == "urlEncode") {
            imageFilePath = encodeURI(imageFilePath)
        } else if (this.encodePathConfig == "urlEncodeSpace") {
            imageFilePath = imageFilePath.replace(/ /g, "%20");
        }

        let imageSyntaxPrefix = "";
        let imageSyntaxSuffix = ""
        switch (languageId) {
            case "markdown":
                imageSyntaxPrefix = `![](`
                imageSyntaxSuffix = `)`
                break;
            case "asciidoc":
                imageSyntaxPrefix = `image::`
                imageSyntaxSuffix = `[]`
                break;
        }

        let result = this.insertPatternConfig
        result = result.replace(this.PATH_VARIABLE_IMAGE_SYNTAX_PREFIX, imageSyntaxPrefix);
        result = result.replace(this.PATH_VARIABLE_IMAGE_SYNTAX_SUFFIX, imageSyntaxSuffix);

        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_PATH, imageFilePath);
        result = result.replace(this.PATH_VARIABLE_IMAGE_ORIGINAL_FILE_PATH, originalImagePath);
        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_NAME, fileName);
        result = result.replace(this.PATH_VARIABLE_IMAGE_FILE_NAME_WITHOUT_EXT, fileNameWithoutExt);

        return result;
    }

    public static replacePathVariable(pathStr: string, projectRoot: string, curFilePath: string, postFunction: (string) => string = (x) => x): string {
        let currentFileDir = path.dirname(curFilePath);
        let currentFileDirName = path.basename(currentFileDir);
        let currentFileParentDir = path.dirname(currentFileDir);
        let currentFileParentDirName = path.basename(currentFileParentDir);
        let ext = path.extname(curFilePath);
        let fileName = path.basename(curFilePath);
        let fileNameWithoutExt = path.basename(curFilePath, ext);

        pathStr = pathStr.replace(this.PATH_VARIABLE_PROJECT_ROOT, postFunction(projectRoot));
        pathStr = pathStr.replace(this.PATH_VARIABLE_PROJECT_ROOT_NAME, postFunction(path.basename(projectRoot)));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_DIR, postFunction(currentFileDir));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_DIR_NAME, postFunction(currentFileDirName));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_PARENT_DIR, postFunction(currentFileParentDir));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_PARENT_DIR_NAME, postFunction(currentFileParentDirName));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_NAME, postFunction(fileName));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_NAME_WITHOUT_EXT, postFunction(fileNameWithoutExt));
        pathStr = pathStr.replace(this.PATH_VARIABLE_CURRNET_FILE_EXT, postFunction(ext));
        return pathStr;
    }

    private static getConfigValue(key: string) {
        return vscode.workspace.getConfiguration(this.CONFIG_SECTION)[key];
    }
}

class PluginError {
    constructor(public message?: string) {
    }
}
