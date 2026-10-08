#!/usr/bin/env python3
"""Short summary of a received file; full text goes to a file, never stdout.

Usage (venv python: Linux venv/bin/python, Windows venv/Scripts/python.exe):
  ~/.local/share/ler-documento/venv/bin/python -I resumo.py FILE [--out DIR] [--head N]
  ~/.local/share/ler-documento/venv/bin/python -I resumo.py FILE.pdf --page N [--dpi 80]
Never extracts archives and never executes anything from the input.
"""
import argparse
import csv
import hashlib
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

ARCH = {".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"}
IMG = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}
MEDIA = {".mp3", ".wav", ".m4a", ".ogg", ".opus", ".flac", ".mp4", ".mkv", ".mov", ".webm", ".avi"}
IS_WINDOWS = os.name == "nt"

# Accented names and text through a Windows console or pipe die on cp1252 without this.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def out_path(src: Path, out_dir: Path, ext: str) -> Path:
    tag = hashlib.sha1(str(src.resolve()).encode()).hexdigest()[:6]
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{src.stem[:40]}-{tag}{ext}"


def clip(s, n=110):
    s = " ".join(str(s).split())
    return s if len(s) <= n else s[: n - 1] + "…"


def pdf(src, out_dir, head):
    import pymupdf as fitz

    doc = fitz.open(src)
    txt = out_path(src, out_dir, ".txt")
    low, with_img, chars = [], [], 0
    with open(txt, "w", encoding="utf-8") as f:
        for i, page in enumerate(doc, 1):
            t = page.get_text()
            chars += len(t)
            f.write(f"\n=== PAGE {i} ===\n{t}")
            if len(t.strip()) < 50:
                low.append(i)
            if page.get_images():
                with_img.append(i)
    print(f"pages: {doc.page_count}  chars: {chars}  title: {clip(doc.metadata.get('title') or '-')}")
    if low:
        print(f"pages with <50 chars of text (scanned or image-only): {fmt(low)}")
    if with_img:
        print(f"pages with embedded images (check chart/table if text is thin): {fmt(with_img)}")
    if len(low) > doc.page_count / 2:
        print("mostly scanned: text is unreliable, OCR needed (tesseract, if installed) or visual check by subagent")
    print(f"full text: {txt}")
    first = [l for l in Path(txt).read_text(encoding="utf-8").splitlines() if l.strip() and not l.startswith("=== PAGE")]
    show(first, head)


def render(src, out_dir, page, dpi):
    """One PDF page as PNG, through pymupdf: no poppler needed on any OS."""
    import pymupdf as fitz

    doc = fitz.open(src)
    if not 1 <= page <= doc.page_count:
        sys.exit(f"page {page} out of range 1..{doc.page_count}")
    png = out_path(src, out_dir, f"-p{page}.png")
    doc[page - 1].get_pixmap(dpi=dpi).save(png)
    print(f"page {page} rendered at {dpi} dpi: {png}")


def fmt(nums, cap=20):
    s = ",".join(map(str, nums[:cap]))
    return s + (f" (+{len(nums) - cap} more)" if len(nums) > cap else "")


def show(lines, head):
    for l in lines[:head]:
        print("  | " + clip(l))
    if len(lines) > head:
        print(f"  ({len(lines) - head} more lines not shown)")


def xlsx(src, out_dir, head):
    import openpyxl

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    print(f"sheets: {len(wb.sheetnames)}")
    csv_dir = out_path(src, out_dir, "")
    csv_dir.mkdir(exist_ok=True)
    for ws in wb.worksheets:
        rows = 0
        sample = []
        target = csv_dir / (ws.title.replace("/", "_")[:40] + ".csv")
        with open(target, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            for row in ws.iter_rows(values_only=True):
                rows += 1
                w.writerow(["" if c is None else c for c in row])
                if len(sample) < head:
                    sample.append(row)
        cols = max((len(r) for r in sample), default=0)
        print(f"- {ws.title!r}: {rows} rows x {cols} cols  csv: {target}")
        for r in sample:
            print("  | " + clip(" ; ".join("" if c is None else str(c) for c in r)))
    print("note: values are cached results (data_only); formulas never evaluated")


def csvfile(src, out_dir, head):
    with open(src, encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    print(f"lines: {len(lines)}  bytes: {src.stat().st_size}")
    show(lines, head)


def docx(src, out_dir, head):
    import docx as D

    d = D.Document(src)
    paras = [p.text for p in d.paragraphs if p.text.strip()]
    txt = out_path(src, out_dir, ".txt")
    with open(txt, "w", encoding="utf-8") as f:
        f.write("\n".join(paras))
        for ti, t in enumerate(d.tables, 1):
            f.write(f"\n=== TABLE {ti} ===\n")
            for r in t.rows:
                f.write(" | ".join(c.text.strip() for c in r.cells) + "\n")
    print(f"paragraphs: {len(paras)}  tables: {len(d.tables)}")
    print(f"full text: {txt}")
    show(paras, head)


def seven_zip():
    """7z on PATH, or where the 7-Zip installer puts it on Windows (it never touches PATH)."""
    found = shutil.which("7z")
    if found:
        return found
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
        exe = Path(base) / "7-Zip" / "7z.exe" if base else None
        if exe and exe.is_file():
            return str(exe)
    return None


def archive(src, out_dir, head):
    # zip and tar need no tool: the stdlib lists them, and extracts them too.
    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            lines = [f"{i.file_size:>12}  {i.filename}" for i in z.infolist()]
        print(f"size: {src.stat().st_size} bytes  entries listed: {len(lines)}")
        show(lines, head)
        print(f'not extracted. Extract into a NEW EMPTY dir: "{sys.executable}" -I -m zipfile -e "{src}" DIR/')
        return
    if tarfile.is_tarfile(src):
        with tarfile.open(src) as t:
            lines = [f"{m.size:>12}  {m.name}" for m in t.getmembers()]
        print(f"size: {src.stat().st_size} bytes  entries listed: {len(lines)}")
        show(lines, head)
        # The data filter refuses absolute paths, ../ and links out of DIR (PEP 706).
        print(f'not extracted. Extract into a NEW EMPTY dir: "{sys.executable}" -I -m tarfile --filter data -e "{src}" DIR/')
        return

    installer = "install.ps1" if IS_WINDOWS else "install.sh"
    seven = seven_zip()
    unrar = shutil.which("unrar")
    if src.suffix.lower() == ".rar" and (unrar or not IS_WINDOWS):
        # On Linux only the non-free unrar extracts RAR5 (7z 16 and unrar-free fail on it).
        cmd = [unrar, "lb", "--", str(src)] if unrar else None
        note = "" if unrar else f"unrar missing (7z 16 and unrar-free cannot extract RAR5): run {installer}"
        how = f"{unrar} x -idq -y FILE DIR/"
    else:
        # 7-Zip for Windows extracts RAR5 too.
        cmd = [seven, "l", "-ba", "--", str(src)] if seven else None
        note = "" if seven else f"7z missing: run {installer}"
        how = f'"{seven}" x -y -bso0 -oDIR FILE'
    if not cmd:
        print(note)
        return
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    print(f"size: {src.stat().st_size} bytes  entries listed: {len(lines)}")
    if r.returncode:
        print(f"listing failed rc={r.returncode}: {clip(r.stderr)}")
    show(lines, head)
    print(f"not extracted. Extract into a NEW EMPTY dir: {how}")


def image(src, out_dir, head):
    try:
        import pymupdf as fitz

        p = fitz.Pixmap(str(src))
        print(f"image: {p.width}x{p.height}  {src.stat().st_size} bytes")
    except Exception as e:
        print(f"image: {src.stat().st_size} bytes ({e})")
    print("no text layer: look at it only if needed, preferably through a subagent that returns the conclusion")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--out", default=str(Path(tempfile.gettempdir()) / "ler-documento"))
    ap.add_argument("--head", type=int, default=15)
    ap.add_argument("--page", type=int, help="render this PDF page to PNG instead of summarizing")
    ap.add_argument("--dpi", type=int, default=80)
    a = ap.parse_args()
    src = Path(a.file)
    if not src.is_file():
        sys.exit(f"not a file: {src}")
    out = Path(a.out)
    ext = src.suffix.lower()
    if a.page is not None:
        if ext != ".pdf":
            sys.exit("--page only renders PDF pages")
        render(src, out, a.page, a.dpi)
        return
    print(f"file: {src.name}  ({src.stat().st_size} bytes)")
    if ext == ".pdf":
        try:
            pdf(src, out, a.head)
        except Exception as e:
            sys.exit(f"cannot open as PDF ({clip(e)}); check `file` and `head -c 200`")
    elif ext in {".xlsx", ".xlsm"}:
        xlsx(src, out, a.head)
    elif ext in {".csv", ".tsv", ".txt", ".md", ".log", ".json"}:
        csvfile(src, out, a.head)
    elif ext == ".docx":
        docx(src, out, a.head)
    elif ext in ARCH:
        archive(src, out, a.head)
    elif ext in IMG:
        image(src, out, a.head)
    elif ext in MEDIA:
        print("audio/video: use the transcrever-audio skill")
    else:
        print(f"unknown type {ext!r}; try `file` and `head -c 300`")


if __name__ == "__main__":
    main()
