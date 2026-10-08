# Windows: installs transcrever (Parakeet TDT v3 int8 via onnx-asr). Needs Python 3.10+ and ffmpeg on PATH.
$ErrorActionPreference = "Stop"
$Home_ = if ($env:TRANSCREVER_HOME) { $env:TRANSCREVER_HOME } else { Join-Path $env:LOCALAPPDATA "transcrever" }
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Write-Warning "ffmpeg fora do PATH (winget install ffmpeg)" }
if (-not (Test-Path "$Home_\venv\Scripts\python.exe")) { python -m venv "$Home_\venv" }
& "$Home_\venv\Scripts\pip.exe" install -q --upgrade "onnx-asr[cpu,hub]"
$bin = Join-Path $env:USERPROFILE ".local\bin"; New-Item -ItemType Directory -Force $bin | Out-Null
Copy-Item "$PSScriptRoot\transcrever.py" "$bin\transcrever.py" -Force
Set-Content "$bin\transcrever.cmd" "@echo off`r`npython `"%~dp0transcrever.py`" %*"
$env:HF_HOME = "$Home_\hf"; $env:HF_HUB_DISABLE_XET = "1"
& "$Home_\venv\Scripts\python.exe" -I -c "from huggingface_hub import snapshot_download; snapshot_download('istupakov/parakeet-tdt-0.6b-v3-onnx', allow_patterns=['*int8*','*.txt','*.json']); import onnx_asr; onnx_asr.load_vad('silero')"
Write-Host "ok: $bin\transcrever.cmd (coloque $bin no PATH; TRANSCREVER_HOME deve ser o mesmo ao rodar)"
