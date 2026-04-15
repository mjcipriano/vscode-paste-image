declare module 'vscode' {
    export interface Disposable {
        dispose(): any;
    }

    export interface ExtensionContext {
        subscriptions: Disposable[];
    }

    export interface OutputChannel extends Disposable {
        appendLine(value: string): void;
    }

    export interface Uri {
        scheme: string;
        fsPath: string;
    }

    export interface Position {
    }

    export interface Range {
    }

    export interface Selection extends Range {
        isEmpty: boolean;
        start: Position;
    }

    export interface TextDocument {
        uri: Uri;
        languageId: string;
        getText(range?: Range): string;
    }

    export interface TextEditorEdit {
        insert(location: Position, value: string): void;
        replace(location: Range, value: string): void;
    }

    export interface TextEditor {
        document: TextDocument;
        selection: Selection;
        edit(callback: (editBuilder: TextEditorEdit) => void): Thenable<boolean>;
    }

    export interface InputBoxOptions {
        prompt?: string;
        value?: string;
    }

    export namespace window {
        export let activeTextEditor: TextEditor;
        export function createOutputChannel(name: string): OutputChannel;
        export function showInformationMessage(message: string, ...items: string[]): Thenable<string>;
        export function showErrorMessage(message: string, ...items: string[]): Thenable<string>;
        export function showInputBox(options?: InputBoxOptions): Thenable<string>;
    }

    export namespace commands {
        export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable;
    }

    export namespace workspace {
        export let rootPath: string;
        export function getConfiguration(section?: string): any;
    }
}
