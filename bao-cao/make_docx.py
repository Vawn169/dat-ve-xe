"""Chuyển báo cáo Markdown sang Word, chèn ảnh chụp màn hình tiêu biểu."""
import re
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

HERE = Path(__file__).parent
MD = HERE / "BaoCao_BanXemTruoc_35ChucNang.md"
OUT = HERE / "BaoCao_BanXemTruoc_35ChucNang.docx"
GREEN = RGBColor(0x0B, 0x7A, 0x5E)

SHOTS = [
    ("01_trang_chu.png", "Trang chủ – tìm chuyến, tuyến phổ biến (F05)"),
    ("03_chi_tiet_danh_gia.png", "Kết quả tìm chuyến, bộ lọc, chi tiết chuyến và đánh giá (F06, F07, F20)"),
    ("04_chon_ghe.png", "Sơ đồ ghế realtime, ghế nữ, giữ ghế có đếm ngược (F08–F11)"),
    ("05_thong_tin_va_ma_giam.png", "Thông tin hành khách từng ghế, mã giảm giá (F04, F12)"),
    ("07_ve_cua_toi_qr.png", "Vé của tôi – mã QR, tải PDF, đổi chuyến, hủy vé (F14–F19)"),
    ("11_chatbot.png", "Chatbot tìm chuyến, trả lời chính sách, nút Gặp nhân viên (F21, F22)"),
    ("15_ve_tai_quay.png", "Bán vé tại quầy (F23)"),
    ("16_soat_ve.png", "Soát vé và danh sách hành khách (F24)"),
    ("17_qt_thong_ke.png", "Quản trị – Thống kê (F30)"),
    ("18_qt_chuyen_lich_chay.png", "Quản trị – Chuyến và lịch chạy (F27)"),
    ("34_qt_tao_so_do.png", "Quản trị – Xe và sơ đồ ghế: thêm / sửa xe, tạo sơ đồ ghế mới (F26)"),
    ("35_qt_sua_tuyen.png", "Quản trị – Sửa tuyến và điểm đón / trả (F25)"),
    ("27_qt_nhat_ky.png", "Quản trị – Nhật ký thao tác (F35)"),
    ("29_qt_xem_email.png", "Hộp thư thử nghiệm – email vé điện tử"),
    ("33_dt_quan_tri.png", "Giao diện điện thoại – trang quản trị"),
]


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def add_runs(par, text):
    """Hỗ trợ **đậm** và `mã`."""
    for part in re.split(r"(\*\*[^*]+\*\*|`[^`]+`)", text):
        if not part:
            continue
        if part.startswith("**"):
            par.add_run(part[2:-2]).bold = True
        elif part.startswith("`"):
            r = par.add_run(part[1:-1])
            r.font.name = "Consolas"
            r.font.size = Pt(10)
        else:
            par.add_run(part)


doc = Document()
st = doc.styles["Normal"]
st.font.name = "Arial"
st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn("w:eastAsia"), "Arial")
for s in doc.sections:
    s.left_margin = s.right_margin = Cm(2)
    s.top_margin = s.bottom_margin = Cm(1.8)

lines = MD.read_text(encoding="utf-8").splitlines()
i = 0
in_code = False
while i < len(lines):
    line = lines[i]
    if line.startswith("```"):
        in_code = not in_code
        i += 1
        continue
    if in_code:
        p = doc.add_paragraph()
        r = p.add_run(line)
        r.font.name = "Consolas"
        r.font.size = Pt(9.5)
        i += 1
        continue
    if line.startswith("# "):
        h = doc.add_heading(line[2:], 0)
        for r in h.runs:
            r.font.color.rgb = GREEN
    elif line.startswith("## "):
        h = doc.add_heading(line[3:], 1)
        for r in h.runs:
            r.font.color.rgb = GREEN
    elif line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            if not re.match(r"^\|[-| ]+\|$", lines[i]):
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
            i += 1
        t = doc.add_table(rows=len(rows), cols=len(rows[0]))
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for ri, row in enumerate(rows):
            for ci, val in enumerate(row):
                cell = t.cell(ri, ci)
                cell.text = ""
                add_runs(cell.paragraphs[0], val)
                for r in cell.paragraphs[0].runs:
                    r.font.size = Pt(9)
                if ri == 0:
                    shade(cell, "0B7A5E")
                    for r in cell.paragraphs[0].runs:
                        r.bold = True
                        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                elif "chưa" in val.lower() and ci == 3:
                    shade(cell, "FFF4DB")
        doc.add_paragraph()
        continue
    elif re.match(r"^\s*- ", line):
        indent = (len(line) - len(line.lstrip())) // 2
        p = doc.add_paragraph(style="List Bullet 2" if indent else "List Bullet")
        add_runs(p, line.strip()[2:])
    elif re.match(r"^\d+\. ", line):
        p = doc.add_paragraph(style="List Number")
        add_runs(p, re.sub(r"^\d+\. ", "", line))
    elif line.strip():
        add_runs(doc.add_paragraph(), line)
    i += 1

doc.add_page_break()
h = doc.add_heading("Phụ lục – Ảnh chụp màn hình", 1)
for r in h.runs:
    r.font.color.rgb = GREEN
for f, cap in SHOTS:
    path = HERE / "anh" / f
    if not path.exists():
        continue
    doc.add_picture(str(path), width=Cm(8) if f.startswith("33_") else Cm(16.5))
    c = doc.add_paragraph(cap)
    c.runs[0].italic = True
    c.runs[0].font.size = Pt(9.5)

doc.save(OUT)
print("Đã tạo", OUT)
