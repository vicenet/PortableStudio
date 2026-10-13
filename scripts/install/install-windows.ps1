# Installs PortableStudio for Illustrator / Photoshop on Windows (current user, no admin needed).
# Run by "Install PortableStudio.bat", which sits next to PortableStudio.zxp.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$zxp = Get-ChildItem -Path $here -Filter '*.zxp' | Select-Object -First 1
if (-not $zxp) { throw 'PortableStudio .zxp file not found next to this installer.' }

$extRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$target = Join-Path $extRoot 'PortableStudio'

Write-Host 'Installing PortableStudio...'

# A developer install links this folder to a source checkout; don't overwrite it.
if (Test-Path $target) {
    $item = Get-Item $target -Force
    if ($item.LinkType) {
        throw "A development copy of PortableStudio is linked at $target. Remove that link first."
    }
    Remove-Item -Recurse -Force $target
}

# A .zxp is a zip archive: unpack it straight into Adobe's per-user extensions folder.
New-Item -ItemType Directory -Force $target | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zxp.FullName, $target)

# Adobe's workaround for signed ZXPs showing blank panels (and needed for CEP 9-12 generally).
foreach ($v in 9..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key | Out-Null }
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}

Write-Host ''
Write-Host "Installed to $target"
Write-Host 'Restart Illustrator or Photoshop, then open Window > Extensions > PortableStudio'
Write-Host '(Photoshop: Window > Extensions (Legacy) > PortableStudio).'
