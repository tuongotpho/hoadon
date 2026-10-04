import type { ParsedInvoice } from './invoiceXml'

/**
 * Dò thông tin hóa đơn từ CHỮ trong file PDF (bản thể hiện của hóa đơn điện tử).
 * Chỉ dùng được với PDF có lớp chữ (hóa đơn điện tử tải về) — ảnh scan/chụp thì không.
 * Mỗi nhà cung cấp trình bày một kiểu nên đây là "đoán có căn cứ": app luôn nhắc kiểm tra lại.
 */

function money(s: string | undefined): number {
  if (!s) return 0
  // 18.836.300 hoặc 18,836,300 -> 18836300
  const n = Number(s.replace(/[.,](?=\d{3}(?!\d))/g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n) : 0
}

const first = (text: string, re: RegExp) => re.exec(text)?.[1]?.trim() ?? ''

// Cắt chữ ở chỗ bắt đầu nhãn tiếp theo trên cùng dòng (vd "Số tài khoản: 0522… Ngân hàng: …")
function cutAtNextLabel(s: string): string {
  return s.split(/\s+(?:Điện thoại|Email|E-mail|Fax|Ngân hàng|Số tài khoản|Mã số thuế|Website)\s*[:(]/i)[0].trim()
}

// Đơn vị tính hay gặp — để tách ĐVT khỏi tên hàng (PDF không tách cột)
const UNITS = new Set(
  ('đĩa lon bình mẹt bát chai suất phần cái kg lít hộp gói thùng két lần người đêm phòng ngày chiếc bộ con nồi lẩu ' +
    'cốc ly ấm đôi tháng m km tấn vé chuyến xuất cặp tô đ/c bàn mâm kiện cuộn tờ quyển')
    .split(' '),
)

export function parseInvoiceText(lines: string[]): Partial<ParsedInvoice> & { found: number } {
  const all = lines.join('\n')
  // phần người bán: từ đầu tới chỗ bắt đầu thông tin người mua
  const buyerAt = all.search(/Tên khách hàng|Họ (?:và )?tên người mua|Người mua hàng\s*\(|Tên người mua|Đơn vị mua|\(Buyer\)/i)
  const seller = buyerAt > 0 ? all.slice(0, buyerAt) : all

  const ngay = /Ngày\s*(?:\([^)]*\))?\s*(\d{1,2})\s*tháng\s*(?:\([^)]*\))?\s*(\d{1,2})\s*năm\s*(?:\([^)]*\))?\s*(\d{4})/i.exec(all)

  const r: Partial<ParsedInvoice> = {
    kyHieu: first(all, /Ký hiệu[^:\n]*:\s*([0-9][A-Z0-9]{5,8})/i),
    soHd: first(all, /(?:^|\s)Số(?:\s*hóa đơn)?\s*(?:\([^)]*\))?\s*:\s*0*(\d{1,8})\b/im),
    ngayHd: ngay ? `${ngay[3]}-${ngay[2].padStart(2, '0')}-${ngay[1].padStart(2, '0')}` : '',
    tenNguoiBan: cutAtNextLabel(first(seller, /(?:Đơn vị bán(?: hàng)?|Tên người bán|Người bán(?: hàng)?)\s*(?:\([^)]*\))?\s*:\s*(.+)/i)),
    mstNguoiBan: first(seller, /Mã số thuế\s*(?:\([^)]*\))?\s*:\s*([\d\s-]{10,20})/i).replace(/\s/g, ''),
    diaChiNguoiBan: cutAtNextLabel(first(seller, /Địa chỉ\s*(?:\([^)]*\))?\s*:\s*(.+)/i)),
    stkNguoiBan: first(seller, /Số tài khoản\s*(?:\([^)]*\))?\s*:\s*([\d\s.-]{5,30}\d)/i).replace(/[\s.]/g, ''),
    nganHangNguoiBan: cutAtNextLabel(first(seller, /Ngân hàng\s*(?:\([^)]*\))?\s*:\s*(.+)/i)),
  }

  // MISA: tên người bán nằm ở dòng ngay trên "Mã số thuế", không có nhãn
  if (!r.tenNguoiBan) {
    const sl = seller.split('\n')
    const i = sl.findIndex((l) => /Mã số thuế/i.test(l))
    const prev = i > 0 ? sl[i - 1].trim() : ''
    if (prev && !prev.includes(':') && prev.length > 5) r.tenNguoiBan = prev
  }
  // MISA: "Số tài khoản : 0123456789 - Ngân hàng TMCP … - Chi nhánh …"
  if (!r.nganHangNguoiBan) r.nganHangNguoiBan = first(seller, /Số tài khoản[^:\n]*:\s*[\d\s.]+-\s*(.+)/i)

  const tienThue = money(first(all, /Tiền thuế (?:GTGT|giá trị gia tăng)[^:\n]*:\s*([\d.,]+)/i))
  const congHang = money(first(all, /Cộng tiền hàng(?: hóa, dịch vụ| hóa| hoá, dịch vụ)?[^:\n]*:\s*([\d.,]+)/i))
  const tong = money(first(all, /Tổng (?:cộng )?(?:số )?tiền thanh toán[^:\n]*:\s*([\d.,]+)/i))
  // MISA: "Tổng cộng : 17.603.250 1.430.760 19.034.010" = trước thuế, thuế, tổng
  const tc = /Tổng cộng\s*:\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i.exec(all)
  if (tc && !tong) {
    r.tienTruocThue = money(tc[1])
    r.tienThue = money(tc[2])
    r.tongTien = money(tc[3])
  } else {
    r.tienThue = tienThue
    r.tienTruocThue = congHang
    r.tongTien = tong || congHang + tienThue
  }
  r.tienBangChu = first(all, /(?:Số tiền|Tổng tiền)[^:\n]*bằng chữ[^:\n]*:\s*(.+)/i)

  // Dòng hàng hóa:
  //   Viettel: "1 Mẹt gà đủ món Mẹt 5 1.900.000 9.500.000"
  //   MISA:    "8 Bia Tiger Bạc ( Lon) Lon 25,00 35.000 875.000 10% 87.500" (có thể không có ĐVT)
  r.items = []
  for (const l of lines) {
    const m = /^(\d{1,3}) (.+?) ([\d.,]+) ([\d.,]+) ([\d.,]+)(?: (\d+%|KCT|KKKNT)(?: [\d.,]+)?)?$/.exec(l)
    if (!m) continue
    const thanhTien = money(m[5])
    const soLuong = money(m[3])
    if (!thanhTien || !soLuong) continue
    const words = m[2].split(' ')
    const last = words.at(-1)!
    const coDvt = words.length > 1 && UNITS.has(last.toLowerCase())
    r.items.push({
      ten: coDvt ? words.slice(0, -1).join(' ') : m[2],
      dvt: coDvt ? last : '',
      soLuong,
      donGia: money(m[4]),
      thanhTien,
      thueSuat: m[6] ?? '',
    })
  }

  const found = Object.values(r).filter((v) => v !== '' && v !== 0).length
  return { ...r, found }
}

export interface PdfTextItem {
  str: string
  transform: number[]
}

/** Ghép các mảnh chữ của PDF thành từng dòng (cùng độ cao trên trang), trái sang phải. */
export function groupLines(items: PdfTextItem[]): string[] {
  const rows: { y: number; parts: { x: number; s: string }[] }[] = []
  for (const it of items) {
    if (!it.str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, s: it.str })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
}
