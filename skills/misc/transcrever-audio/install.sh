#!/usr/bin/env bash
# Installs transcrever (Parakeet TDT v3 int8 via onnx-asr, CPU) for the current user. Idempotent.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${TRANSCREVER_HOME:-$HOME/.local/share/transcrever}"
command -v python3 >/dev/null || { echo "python3 ausente" >&2; exit 1; }
command -v ffmpeg >/dev/null || echo "aviso: ffmpeg fora do PATH (sudo apt install ffmpeg)" >&2
[ -x "$HOME_DIR/venv/bin/python" ] || python3 -m venv "$HOME_DIR/venv"
"$HOME_DIR/venv/bin/pip" install -q --upgrade "onnx-asr[cpu,hub]"
mkdir -p "$HOME/.local/bin"
install -m 755 "$HERE/transcrever.py" "$HOME/.local/bin/transcrever"
# Pre-download model and VAD into the persistent cache (resumable: rerun if interrupted).
HF_HOME="$HOME_DIR/hf" HF_HUB_DISABLE_XET=1 "$HOME_DIR/venv/bin/python" -I -c '
from huggingface_hub import snapshot_download
snapshot_download("istupakov/parakeet-tdt-0.6b-v3-onnx", allow_patterns=["*int8*", "*.txt", "*.json"])
import onnx_asr; onnx_asr.load_vad("silero")'
echo "ok: $HOME/.local/bin/transcrever (garanta ~/.local/bin no PATH)"
