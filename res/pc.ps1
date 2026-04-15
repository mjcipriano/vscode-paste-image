param($imagePath)

if ([string]::IsNullOrWhiteSpace($imagePath)) {
    "no output path"
    Exit 1
}

try {
    Add-Type -AssemblyName System.Drawing
    $img = Get-Clipboard -Format Image -ErrorAction Stop
} catch {
    "no image in clipboard"
    Exit 1
}

if ($img -eq $null) {
    "no image in clipboard"
    Exit 1
}

$imageDir = Split-Path -Parent $imagePath
if ($imageDir) {
    New-Item -ItemType Directory -Path $imageDir -Force | Out-Null
}

$img.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
if ($img -is [System.IDisposable]) {
    $img.Dispose()
}

$imagePath
