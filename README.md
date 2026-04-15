# Paste Image

Paste image directly from clipboard to markdown/asciidoc(or other file)!

**Support Mac/Windows/Linux!** And support config destination folder.

![paste-image](https://raw.githubusercontent.com/mushanshitiancai/vscode-paste-image/master/res/vscode-paste-image.gif)

Now you can enable `pasteImageInternal.showFilePathConfirmInputBox` to modify file path before save:

![confirm-inputbox](https://raw.githubusercontent.com/mushanshitiancai/vscode-paste-image/master/res/confirm-inputbox.png)

## Usage

1. capture screen to clipboard
2. Open the command palette: `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac)
3. Type: "Paste Image" or you can use default keyboard binding: `Ctrl+Alt+V` (`Cmd+Alt+V` on Mac).
4. Image will be saved in the folder that contains current editing file
5. The relative path will be paste to current editing file 

## Internal WSL Build

This fork is published as `paste-image-internal` / `Paste Image Internal` so it can be installed side by side without conflicting with the public Marketplace extension.

The original Linux implementation shells out to `xclip`. That works on native Linux desktops, but it fails in many VS Code Remote - WSL workflows because the screenshot or copied image is usually in the Windows clipboard, not in an X11 clipboard inside the WSL distro.

When the extension detects WSL through `WSL_DISTRO_NAME`, `WSL_INTEROP`, or `/proc/sys/kernel/osrelease`, it skips `xclip`. Instead it converts the target WSL output path with `wslpath -w`, runs `powershell.exe` with `-NoProfile -NonInteractive -NoLogo -STA -ExecutionPolicy Bypass`, reads the Windows clipboard image with `Get-Clipboard -Format Image`, creates the output directory if needed, and saves a PNG into the current WSL workspace path.

This internal build uses the `pasteImageInternal.*` settings namespace so it can be installed side by side with the public extension without sharing configuration values. If you want the same settings as the public extension, copy the values from `pasteImage.*` to `pasteImageInternal.*`.

Native Windows, macOS, and non-WSL Linux behavior is unchanged. Non-WSL Linux still uses `xclip`.

### Package as VSIX

Install dependencies if needed, then build the VSIX:

```
npm install
npx vsce package
```

### Release from GitHub Actions

Merging to `master` automatically runs the release workflow. The workflow bumps the `internal.N` version in `package.json`, updates the VSIX filename references in this README, runs the unit tests, packages the VSIX, commits the version bump back to `master`, creates the matching tag, creates or updates the GitHub Release, and attaches the generated VSIX file.

Release tags use the package version with a leading `v`, for example `v1.0.4-internal.6`.

The release workflow can also be run from GitHub Actions with an existing tag to backfill a missing release asset. In that mode, the tag must match the version already in `package.json`.

### Install from VSIX

In VS Code, open the Extensions view, choose `...`, select `Install from VSIX...`, and pick the generated `paste-image-internal-1.0.4-internal.6.vsix` file.

You can also install it from the command line:

```
code --install-extension paste-image-internal-1.0.4-internal.6.vsix
```

## Config

Current-file variables can be used in `pasteImageInternal.defaultName`, `pasteImageInternal.path`, `pasteImageInternal.basePath`, `pasteImageInternal.namePrefix`, `pasteImageInternal.nameSuffix`, and `pasteImageInternal.insertPattern`:

- `${projectRoot}`: the path of the project opened in VS Code.
- `${projectRootName}`: the name of the project root directory.
- `${currentFileDir}`: the path of the directory that contains the current editing file.
- `${currentFileDirName}`: the name of the directory that contains the current editing file.
- `${currentFileParentDir}`: the path of the parent directory of `${currentFileDir}`.
- `${currentFileParentDirName}`: the name of the parent directory of `${currentFileDir}`.
- `${currentFileName}`: the current file name with extension.
- `${currentFileNameWithoutExt}`: the current file name without extension.
- `${currentFileExt}`: the current file extension, including the leading dot.

For example, to prepend only the current directory name to pasted image filenames:

```
"pasteImageInternal.namePrefix": "${currentFileDirName}_"
```

- `pasteImageInternal.defaultName`

    The default image file name.

    The value of this config will be pass to the 'format' function of moment library(a js time manipulation library), you can read document https://momentjs.com/docs/#/displaying/format/ for advanced usage.

    You can use current-file variables.

    Default value is `Y-MM-DD-HH-mm-ss`.

- `pasteImageInternal.path`

    The destination to save image file.
    
    You can use current-file variables.

    Default value is `${currentFileDir}`.

- `pasteImageInternal.basePath`

    The base path of image url.
    
    You can use current-file variables.

    Default value is `${currentFileDir}`.

- `pasteImageInternal.forceUnixStyleSeparator`

    Force set the file separator style to unix style. If set false, separator style will follow the system style. 
    
    Default is `true`.

- `pasteImageInternal.prefix`

    The string prepend to the resolved image path before paste.

    Default is `""`.

- `pasteImageInternal.suffix`

    The string append to the resolved image path before paste.

    Default is `""`.

- `pasteImageInternal.encodePath`

    How to encode image path before insert to editor. Support options:

    - `none`: do nothing, just insert image path to text
    - `urlEncode`: url encode whole image path
    - `urlEncodeSpace`: url encode only space character(space to %20)

    Default is `urlEncodeSpace`.

- `pasteImageInternal.namePrefix`

    The string prepend to the image file name.

    You can use current-file variables.

    Default is `""`.

- `pasteImageInternal.nameSuffix`

    The string append to the image name.

    You can use current-file variables.

    Default is `""`.

- `pasteImageInternal.insertPattern`

    The pattern of string that would be pasted to text.
    
    You can configure both the alt text and the file path.
    For example, `![${imageFileNameWithoutExt}](${imageFilePath})` would add the file name as the alt text instead of the default (blank).
    
    You can use the following variables:

    - `${imageFilePath}`: the image file path, with `pasteImageInternal.prefix`, `pasteImageInternal.suffix`, and url encoded.
    - `${imageOriginalFilePath}`: the image file path.
    - `${imageFileName}`:  the image file name with ext.
    - `${imageFileNameWithoutExt}`: the image file name without ext.
    - All current-file variables listed above.
    - `${imageSyntaxPrefix}`: in markdown file it would be <code>![](</code>, in asciidoc file it would be <code>image::</code>, in other file it would be empty string
    - `${imageSyntaxSuffix}`: in markdown file it would be <code>)</code>, in asciidoc file it would be <code>[]</code>, in other file it would be empty string

    Default is `${imageSyntaxPrefix}${imageFilePath}${imageSyntaxSuffix}`.

- `pasteImageInternal.showFilePathConfirmInputBox`

    Enabling this `boolean` setting will make Paste Image ask you to confirm the file path(or file name). This is useful if you want to change the file path of the image you are currently pasting. Default is `false`.

- `pasteImageInternal.filePathConfirmInputBoxMode`

    - `fullPath`: show full path in inputBox, so you can change the path or name. Default value.
    - `onlyName`: show only file name in inputBox, so it's easy to change name.

## Config Example

I use vscode to edit my hexo blog. The folder struct like this:

```
blog/source/_posts  (articles)
blog/source/img     (images)
```

I want to save all image in `blog/source/img`, and insert image url to article. And hexo will generate `blog/source/` as the website root, so the image url should be like `/img/xxx.png`. So I can config Paste Image Internal in `blog/.vscode/setting.json` like this:

```
"pasteImageInternal.path": "${projectRoot}/source/img",
"pasteImageInternal.basePath": "${projectRoot}/source",
"pasteImageInternal.forceUnixStyleSeparator": true,
"pasteImageInternal.prefix": "/"
```

If you want to save image in separate directory:

```
"pasteImageInternal.path": "${projectRoot}/source/img/${currentFileNameWithoutExt}",
"pasteImageInternal.basePath": "${projectRoot}/source",
"pasteImageInternal.forceUnixStyleSeparator": true,
"pasteImageInternal.prefix": "/"
```

If you want to save image with article name as prefix:

```
"pasteImageInternal.namePrefix": "${currentFileNameWithoutExt}_",
"pasteImageInternal.path": "${projectRoot}/source/img",
"pasteImageInternal.basePath": "${projectRoot}/source",
"pasteImageInternal.forceUnixStyleSeparator": true,
"pasteImageInternal.prefix": "/"
```

If you want to use html in markdown:

```
"pasteImageInternal.insertPattern": "<img>${imageFileName}</img>"
"pasteImageInternal.path": "${projectRoot}/source/img",
"pasteImageInternal.basePath": "${projectRoot}/source",
"pasteImageInternal.forceUnixStyleSeparator": true,
"pasteImageInternal.prefix": "/"
```

## Format

### File name format

If you selected some text in editor, then extension will use it as the image file name. **The selected text can be a sub path like `subFolder/subFolder2/nameYouWant`.**

If not the image will be saved in this format: "Y-MM-DD-HH-mm-ss.png". You can config default image file name by `pasteImageInternal.defaultName`.

### File link format

When you editing a markdown, it will pasted as markdown image link format `![](imagePath)`.

When you editing a asciidoc, it will pasted as asciidoc image link format `image::imagePath[]`.

In other file, it just paste the image's path.

Now you can use configuration `pasteImageInternal.insertPattern` to config the format of file link and the alt text.

## Contact

If you have some any question or advice, Welcome to [issue](https://github.com/mushanshitiancai/vscode-paste-image/issues)

## TODO

- [x] support win (by @kivle)
- [x] support linux
- [x] support use the selected text as the image name
- [x] support config (@ysknkd in #4)
- [x] support config relative/absolute path (@ysknkd in #4)
- [x] support asciidoc
- [x] support use variable ${projectRoot} and ${currentFileDir} in config
- [x] support config basePath
- [x] support config forceUnixStyleSeparator
- [x] support config prefix
- [x] support config suffix
- [x] support use variable ${currentFileName} and ${currentFileNameWithoutExt} in config
- [x] support check if the dest directory is a file
- [x] support select text as a sub path with multi new directory like `a/b/c/d/imageName` or `../a/b/c/d/imageName`
- [x] support config default image name pattern
- [x] support config the text format
- [x] support file path confirm box (by @DonMartin76)

## License

The extension and source are licensed under the [MIT license](LICENSE.txt).

## Donate

If you like this plugin, you can donate to me to support me develop it better, thank you!

PayPal:

<a href="https://www.paypal.me/mushanshitiancai"><img src="https://www.paypal.com/en_US/i/btn/btn_donate_LG.gif"></img></a>

支付宝:

![alipay](https://raw.githubusercontent.com/mushanshitiancai/vscode-paste-image/master/res/alipay.png)

微信支付:

![weixin](https://raw.githubusercontent.com/mushanshitiancai/vscode-paste-image/master/res/weixin.png)

Donator list：
- 白色咖啡
- Paul Egbert
- CallOnISS
- 亮亮
- Shahid Iqbal
