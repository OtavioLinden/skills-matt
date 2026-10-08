# Windows: installs transcrever (Parakeet TDT v3 int8 via onnx-asr). Needs Python 3.10+ and ffmpeg on PATH.
# Idempotent: rerun to repair or to resume an interrupted model download.
# Run from Git Bash: powershell -ExecutionPolicy Bypass -File <this folder>/install.ps1
$ErrorActionPreference = "Stop"
$Home_ = if ($env:TRANSCREVER_HOME) { $env:TRANSCREVER_HOME } else { Join-Path $env:LOCALAPPDATA "transcrever" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Warning "ffmpeg fora do PATH (winget install Gyan.FFmpeg)" }

$Py = "$Home_\venv\Scripts\python.exe"
if (-not (Test-Path $Py)) {
  python -m venv "$Home_\venv"
  if ($LASTEXITCODE) { throw "python -m venv falhou (precisa de Python 3.10+ no PATH)" }
}
& $Py -m pip install -q --upgrade "onnx-asr[cpu,hub]"
if ($LASTEXITCODE) { throw "pip install onnx-asr falhou" }

# Two doors to the same venv, both in ~/.local/bin: transcrever.cmd for cmd and
# PowerShell, and an extensionless script for Git Bash, which never looks for .cmd.
$bin = Join-Path $env:USERPROFILE ".local\bin"
New-Item -ItemType Directory -Force $bin | Out-Null
Copy-Item "$PSScriptRoot\transcrever.py" "$bin\transcrever.py" -Force
$cmd = "@echo off`r`nset `"TRANSCREVER_HOME=$Home_`"`r`n`"$Py`" `"%~dp0transcrever.py`" %*`r`n"
[System.IO.File]::WriteAllText("$bin\transcrever.cmd", $cmd, [System.Text.Encoding]::ASCII)
$posixHome = $Home_.Replace('\', '/')
$posixPy = $Py.Replace('\', '/')
$sh = "#!/usr/bin/env bash`nexport TRANSCREVER_HOME='$posixHome'`nexec '$posixPy' `"`$(dirname `"`$0`")/transcrever.py`" `"`$@`"`n"
[System.IO.File]::WriteAllText("$bin\transcrever", $sh, (New-Object System.Text.UTF8Encoding $false))

# Windows without Developer Mode has no symlinks: the HF cache copies instead, which works; skip the warning.
$env:HF_HOME = "$Home_\hf"; $env:HF_HUB_DISABLE_XET = "1"; $env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"
& $Py -I -c "from huggingface_hub import snapshot_download; snapshot_download('istupakov/parakeet-tdt-0.6b-v3-onnx', allow_patterns=['*int8*','*.txt','*.json']); import onnx_asr; onnx_asr.load_vad('silero')"
if ($LASTEXITCODE) { throw "download do modelo falhou; rode de novo para retomar" }

$onPath = ($env:PATH -split ';') | Where-Object { $_.TrimEnd('\') -ieq $bin }
Write-Host "ok: transcrever em $bin$(if (-not $onPath) { ' (ATENCAO: essa pasta nao esta no PATH)' })"
