#!/usr/bin/env bash
# Recreates the ler-documento toolchain on Debian/Ubuntu. Windows: use WSL, or
# install poppler + 7-Zip + WinRAR/unrar and a Python venv with pymupdf openpyxl python-docx.
set -euo pipefail
VENV="$HOME/.local/share/ler-documento/venv"

pkgs=()
command -v pdftotext >/dev/null || pkgs+=(poppler-utils)
command -v 7z >/dev/null || pkgs+=(p7zip-full)
# 7z 16 and unrar-free list RAR5 but cannot extract it; the non-free unrar can (multiverse).
dpkg -s unrar >/dev/null 2>&1 || pkgs+=(unrar)
if [ ${#pkgs[@]} -gt 0 ]; then
  sudo apt-get install -y "${pkgs[@]}"
fi

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -q pymupdf openpyxl python-docx
echo "ok: $("$VENV/bin/pip" list 2>/dev/null | grep -iE 'pymupdf|openpyxl|python-docx' | tr -s ' ' | tr '\n' ';')"
