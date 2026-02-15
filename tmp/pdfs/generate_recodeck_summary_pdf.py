#!/usr/bin/env python3
"""Generate a polished, single-page RecoDeck summary PDF without external deps."""

from __future__ import annotations

from pathlib import Path

PAGE_W = 612
PAGE_H = 792


class PDFBuilder:
    def __init__(self) -> None:
        self.objects: list[bytes] = [b""]

    def add_obj(self, data: str | bytes) -> int:
        if isinstance(data, str):
            payload = data.encode("latin-1")
        else:
            payload = data
        self.objects.append(payload)
        return len(self.objects) - 1

    def build(self, root_obj: int) -> bytes:
        out = bytearray()
        out.extend(b"%PDF-1.4\n%ASCII\n")

        offsets = [0] * len(self.objects)
        for i in range(1, len(self.objects)):
            offsets[i] = len(out)
            out.extend(f"{i} 0 obj\n".encode("ascii"))
            out.extend(self.objects[i])
            if not self.objects[i].endswith(b"\n"):
                out.extend(b"\n")
            out.extend(b"endobj\n")

        xref = len(out)
        out.extend(f"xref\n0 {len(self.objects)}\n".encode("ascii"))
        out.extend(b"0000000000 65535 f \n")
        for i in range(1, len(self.objects)):
            out.extend(f"{offsets[i]:010d} 00000 n \n".encode("ascii"))

        out.extend(b"trailer\n")
        out.extend(f"<< /Size {len(self.objects)} /Root {root_obj} 0 R >>\n".encode("ascii"))
        out.extend(b"startxref\n")
        out.extend(f"{xref}\n".encode("ascii"))
        out.extend(b"%%EOF\n")
        return bytes(out)


class Canvas:
    def __init__(self) -> None:
        self.cmds: list[str] = []

    @staticmethod
    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    def add(self, cmd: str) -> None:
        self.cmds.append(cmd)

    def fill_rgb(self, r: float, g: float, b: float) -> None:
        self.add(f"{r:.3f} {g:.3f} {b:.3f} rg")

    def stroke_rgb(self, r: float, g: float, b: float) -> None:
        self.add(f"{r:.3f} {g:.3f} {b:.3f} RG")

    def rect_fill(self, x: float, y: float, w: float, h: float) -> None:
        self.add(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")

    def rect_stroke(self, x: float, y: float, w: float, h: float, line_w: float = 1.0) -> None:
        self.add(f"{line_w:.2f} w")
        self.add(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def text(self, x: float, y: float, text: str, font: str, size: float, color: tuple[float, float, float]) -> None:
        r, g, b = color
        self.add("BT")
        self.add(f"/{font} {size:.2f} Tf")
        self.add(f"{r:.3f} {g:.3f} {b:.3f} rg")
        self.add(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        self.add(f"({self.esc(text)}) Tj")
        self.add("ET")

    def multiline(
        self,
        x: float,
        y: float,
        lines: list[str],
        font: str,
        size: float,
        leading: float,
        color: tuple[float, float, float],
    ) -> None:
        if not lines:
            return
        r, g, b = color
        self.add("BT")
        self.add(f"/{font} {size:.2f} Tf")
        self.add(f"{r:.3f} {g:.3f} {b:.3f} rg")
        self.add(f"{leading:.2f} TL")
        self.add(f"1 0 0 1 {x:.2f} {y:.2f} Tm")
        for idx, line in enumerate(lines):
            if idx > 0:
                self.add("T*")
            self.add(f"({self.esc(line)}) Tj")
        self.add("ET")

    def card(
        self,
        x: float,
        top: float,
        w: float,
        h: float,
        title: str,
        lines: list[str],
        title_size: float = 11.0,
        body_size: float = 9.2,
        leading: float = 11.0,
    ) -> None:
        y = top - h
        self.fill_rgb(0.965, 0.973, 0.988)
        self.rect_fill(x, y, w, h)

        self.stroke_rgb(0.808, 0.867, 0.941)
        self.rect_stroke(x, y, w, h, line_w=0.8)

        self.fill_rgb(0.133, 0.827, 0.933)
        self.rect_fill(x, top - 6.0, w, 6.0)

        self.text(x + 12.0, top - 22.0, title, "F2", title_size, (0.059, 0.09, 0.165))
        self.multiline(x + 12.0, top - 39.0, lines, "F1", body_size, leading, (0.149, 0.192, 0.282))

    def stream(self) -> bytes:
        return ("\n".join(self.cmds) + "\n").encode("latin-1")


def build_content() -> bytes:
    c = Canvas()

    margin = 36.0
    c.fill_rgb(1.0, 1.0, 1.0)
    c.rect_fill(0.0, 0.0, PAGE_W, PAGE_H)

    header_x = margin
    header_w = PAGE_W - (margin * 2)
    header_h = 72.0
    header_top = PAGE_H - margin
    header_y = header_top - header_h

    c.fill_rgb(0.059, 0.094, 0.196)
    c.rect_fill(header_x, header_y, header_w, header_h)

    c.fill_rgb(0.165, 0.851, 0.933)
    c.rect_fill(header_x, header_y, 8.0, header_h)

    c.text(header_x + 18.0, header_top - 31.0, "RecoDeck App Summary", "F2", 25.0, (1.0, 1.0, 1.0))
    c.text(
        header_x + 18.0,
        header_top - 53.0,
        "One-page, repo-evidence snapshot",
        "F1",
        10.8,
        (0.824, 0.886, 0.969),
    )

    left_x = margin
    right_x = 316.0
    col_w = 260.0

    c.card(
        left_x,
        670.0,
        col_w,
        116.0,
        "What It Is",
        [
            "RecoDeck is a desktop music library app",
            "built with Tauri (Rust backend) and a",
            "React/TypeScript frontend.",
            "It scans local audio folders, stores",
            "metadata in SQLite, and adds playback,",
            "analysis, and AI playlist tools.",
        ],
        title_size=12.0,
        body_size=10.2,
        leading=12.0,
    )

    c.card(
        left_x,
        542.0,
        col_w,
        82.0,
        "Who It Is For",
        [
            "Primary persona (inferred from code):",
            "digital DJs managing local libraries",
            "and playlist/set prep workflows.",
        ],
        title_size=12.0,
        body_size=10.2,
        leading=12.0,
    )

    c.card(
        left_x,
        448.0,
        col_w,
        424.0,
        "What It Does",
        [
            "- Recursive scan/import for mp3, flac, wav,",
            "  aiff/aif, m4a, and ogg files.",
            "- SQLite-backed tracks, playlists,",
            "  genres, settings, and analysis data.",
            "- Folder tree + playlist folders with",
            "  add/remove/rename/delete operations.",
            "- Playback queue with seek, repeat,",
            "  shuffle, volume, and crossfade.",
            "- BPM + key analysis (Camelot/Open Key)",
            "  with progress UI and batch runs.",
            "- AI chat + AI playlist generation",
            "  using cached library context.",
            "- File watcher emits library-changed",
            "  events for automatic refresh.",
        ],
        title_size=12.0,
        body_size=10.0,
        leading=12.0,
    )

    c.card(
        right_x,
        670.0,
        col_w,
        332.0,
        "How It Works (Architecture)",
        [
            "Components and services",
            "- Frontend: React UI + Zustand stores.",
            "- Bridge: src/lib/tauri-api.ts uses invoke().",
            "- Backend: Rust command modules for",
            "  library, scanner, analysis, playback,",
            "  playlists, genres, settings, watcher,",
            "  and AI (src-tauri/src/commands/*).",
            "- Data: rusqlite migrations and queries",
            "  on recodeck.db in app data.",
            "",
            "Data flow",
            "1. UI action triggers invoke() command.",
            "2. Rust services read/write DB and files.",
            "3. Rust emits library-changed/audio-* events.",
            "4. Frontend listeners refresh UI state.",
        ],
        title_size=12.0,
        body_size=10.0,
        leading=11.6,
    )

    c.card(
        right_x,
        326.0,
        col_w,
        168.0,
        "How To Run",
        [
            "1. npm install",
            "2. npm run tauri dev",
            "3. In app, click Scan Folder",
            "   (or add folders in Settings).",
        ],
        title_size=12.0,
        body_size=10.4,
        leading=12.2,
    )

    c.card(
        right_x,
        146.0,
        col_w,
        118.0,
        "Not Found In Repo",
        [
            "- Explicit persona statement: Not found in repo.",
            "- Node/Rust version requirements: Not found in repo.",
            "- Production deployment guide: Not found in repo.",
        ],
        title_size=12.0,
        body_size=9.6,
        leading=11.0,
    )

    c.text(
        margin,
        16.0,
        "Evidence: package.json, src/App.tsx, src/lib/tauri-api.ts, src-tauri/src/*, tauri.conf.json",
        "F1",
        8.2,
        (0.333, 0.396, 0.49),
    )

    return c.stream()


def write_pdf(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    canvas_stream = build_content()

    pdf = PDFBuilder()

    catalog_obj = pdf.add_obj("<< /Type /Catalog /Pages 2 0 R >>")
    pages_obj = pdf.add_obj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    page_obj = pdf.add_obj(
        "<< /Type /Page /Parent 2 0 R "
        "/MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> "
        "/Contents 4 0 R >>"
    )

    contents_obj = pdf.add_obj(
        b"<< /Length " + str(len(canvas_stream)).encode("ascii") + b" >>\nstream\n" + canvas_stream + b"endstream"
    )

    helv = pdf.add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    helv_bold = pdf.add_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    if not (catalog_obj == 1 and pages_obj == 2 and page_obj == 3 and contents_obj == 4 and helv == 5 and helv_bold == 6):
        raise RuntimeError("Unexpected PDF object ordering")

    output_path.write_bytes(pdf.build(root_obj=1))


def main() -> None:
    output = Path("output/pdf/recodeck_app_summary_v2.pdf")
    write_pdf(output)
    print(output.resolve())


if __name__ == "__main__":
    main()
