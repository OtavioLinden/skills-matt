#!/usr/bin/env python3
"""Transcribe audio/video with Parakeet TDT v3 (onnx-asr, int8, CPU). Installed by transcrever-audio/install.sh."""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HOME = Path(os.environ.get("TRANSCREVER_HOME", Path.home() / ".local" / "share" / "transcrever"))
VENV_PY = HOME / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
INSTALLER = "transcrever-audio/install.sh (skill no fork skills-matt, skills/misc/transcrever-audio)"
MODEL = "nemo-parakeet-tdt-0.6b-v3"


def die(msg):
    print(f"transcrever: {msg}", file=sys.stderr)
    sys.exit(1)


def reexec_in_venv():
    if not VENV_PY.exists():
        die(f"venv ausente em {VENV_PY}. Rode o instalador: {INSTALLER}")
    if Path(sys.prefix).resolve() != (HOME / "venv").resolve():
        os.execv(str(VENV_PY), [str(VENV_PY), os.path.abspath(__file__), *sys.argv[1:]])


def to_wav(src, tmpdir):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        die("ffmpeg não encontrado no PATH")
    out = Path(tmpdir) / (Path(src).stem + ".wav")
    r = subprocess.run([ffmpeg, "-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", str(out)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        die(f"ffmpeg falhou em {src}: {r.stderr.strip()[:300]}")
    return out


def main():
    ap = argparse.ArgumentParser(description="Transcreve áudio/vídeo (Parakeet TDT v3, CPU).")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--timestamps", action="store_true", help="prefixa cada trecho com [mm:ss]")
    ap.add_argument("-o", "--output", help="grava o texto neste arquivo (stdout mostra só o resumo)")
    args = ap.parse_args()

    for f in args.files:
        if not Path(f).is_file():
            die(f"arquivo não existe: {f}")
    reexec_in_venv()

    os.environ.setdefault("HF_HOME", str(HOME / "hf"))
    try:
        import onnx_asr
        model = onnx_asr.load_model(MODEL, quantization="int8")
        vad = onnx_asr.load_vad("silero")
    except Exception as e:
        die(f"modelo indisponível ({e}). Rode o instalador: {INSTALLER}")
    model = model.with_vad(vad, max_speech_duration_s=25)

    lines = []
    multi = len(args.files) > 1
    with tempfile.TemporaryDirectory() as tmp:
        for f in args.files:
            if multi:
                lines.append(f"== {f}")
            wav = to_wav(f, tmp)
            for seg in model.recognize(str(wav)):
                text = seg.text.strip()
                if not text:
                    continue
                if args.timestamps:
                    m, s = divmod(int(seg.start), 60)
                    text = f"[{m:02d}:{s:02d}] {text}"
                lines.append(text)
    out = "\n".join(lines)
    if args.output:
        Path(args.output).write_text(out + "\n", encoding="utf-8")
        print(f"{len(lines)} trechos gravados em {args.output}")
    else:
        print(out)


if __name__ == "__main__":
    main()
