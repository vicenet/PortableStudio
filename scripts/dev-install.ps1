# Makes Illustrator/Photoshop load PortableStudio straight from this folder (Windows, development only).
#  1. Allows unsigned extensions (PlayerDebugMode) for CEP 9-12.
#  2. Links %APPDATA%\Adobe\CEP\extensions\PortableStudio to this project.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

foreach ($v in 9..12) {
    $key = "HKCU:\Software\Adobe\CSXS.$v"
    if (-not (Test-Path $key)) { New-Item -Path $key | Out-Null }
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}
Write-Host 'Enabled unsigned extensions (PlayerDebugMode=1).'

$extDir = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
if (-not (Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir | Out-Null }
$link = Join-Path $extDir 'PortableStudio'
if (Test-Path $link) {
    Write-Host "Already installed at $link"
} else {
    New-Item -ItemType Junction -Path $link -Target $root | Out-Null
    Write-Host "Linked $link -> $root"
}
Write-Host 'Restart Illustrator/Photoshop, then open Window > Extensions > PortableStudio.'
