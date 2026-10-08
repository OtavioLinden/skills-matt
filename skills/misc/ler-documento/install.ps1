# Windows: recreates the ler-documento toolchain: a venv with pymupdf, openpyxl and python-docx.
# PDF pages render through pymupdf (no poppler), zip and tar through the stdlib (no 7-Zip).
# 7-Zip is only needed for .7z and .rar; its installer asks for elevation, so this only warns.
# Run from Git Bash: powershell -ExecutionPolicy Bypass -File <this folder>/install.ps1
$ErrorActionPreference = "Stop"
$Venv = Join-Path $env:USERPROFILE ".local\share\ler-documento\venv"
$Py = "$Venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
  python -m venv $Venv
  if ($LASTEXITCODE) { throw "python -m venv falhou (precisa de Python 3.10+ no PATH)" }
}
& $Py -m pip install -q --upgrade pymupdf openpyxl python-docx
if ($LASTEXITCODE) { throw "pip install falhou" }

$seven = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $seven -and -not (Get-Command 7z -ErrorAction SilentlyContinue)) {
  Write-Warning "7-Zip ausente: .7z e .rar nao serao listados. Instale com: winget install --id 7zip.7zip -e"
}
$mods = & $Py -m pip list 2>$null | Select-String -Pattern 'pymupdf|openpyxl|python-docx' | ForEach-Object { ($_ -split '\s+')[0..1] -join ' ' }
Write-Host "ok: $Py ($($mods -join '; '))"
