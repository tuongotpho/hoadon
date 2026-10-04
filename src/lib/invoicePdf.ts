import type { ParsedInvoice } from './invoiceXml'
import type { HdLienQuan } from './types'

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

/**
 * Dòng "Thay thế cho hóa đơn Mẫu số 1, ký hiệu C26MPD, số 00000322, ngày 27 tháng 05 năm 2026"
 * hoặc "Hóa đơn điều chỉnh cho hóa đơn ký hiệu 1C24TAA số 123 ngày 01/02/2024".
 */
export function lienQuanPdf(all: string): HdLienQuan | null {
  const m = /(thay\s*thế|điều\s*chỉnh)\s+cho\s+(?:hóa|hoá)\s+đơn([^\n]{0,200}(?:\n[^\n]{0,120})?)/i.exec(all)
  if (!m) return null
  const t = m[2].replace(/\n/g, ' ')
  const mau = /Mẫu\s*số\s*:?\s*(\d)/i.exec(t)?.[1] ?? ''
  const kh = /ký\s*hiệu\s*:?\s*([0-9]?[A-Z][A-Z0-9]{4,7})/i.exec(t)?.[1]?.toUpperCase() ?? ''
  // bỏ cụm "Mẫu số 1" trước, kẻo lấy nhầm "1" làm số hóa đơn
  const so = /(?:^|[\s,(])số\s*:?\s*0*(\d{1,8})(?!\d)/i.exec(t.replace(/Mẫu\s*số\s*:?\s*\d+/gi, ''))?.[1] ?? ''
  if (!so) return null
  const d = /ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i.exec(t) ?? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  return {
    loai: /thay/i.test(m[1]) ? 'thayThe' : 'dieuChinh',
    kyHieu: /^\d/.test(kh) ? kh : mau + kh,
    soHd: so,
    ngayHd: d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : '',
  }
}

/** Số hóa đơn: cùng dòng với nhãn "Số (No.) : 1434", hoặc ở 1–3 dòng ngay dưới nhãn ("(KHỞI TẠO TỪ MÁY TÍNH TIỀN) 1456"). */
function soHoaDon(lines: string[]): string {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].replace(/Mẫu\s*số[^:\n]*:[ \t]*\S+/gi, '') // "Mẫu số (Form No.) : 1/002" không phải số hóa đơn
    // VNPT viết tách từng chữ số: "Số (Invoice No.) : 0 0 0 0 0 2 6 1"
    const cung = /(?:^|\s)Số(?:\s*hóa đơn)?[ \t]*(?:\([^)]*\))?[ \t]*:[ \t]*((?:\d[ \t]?){1,12})(?!\S*\d)/i.exec(l)
    if (cung) return String(Number(cung[1].replace(/\s/g, '')))
    if (/(?:^|\s)Số(?:\s*hóa đơn)?[ \t]*(?:\([^)]*\))?[ \t]*:[ \t]*$/i.test(l)) {
      for (const sau of lines.slice(i + 1, i + 4)) {
        if (/Mã|MST|Ngày/i.test(sau)) continue
        const m = /(?:^|\s)0*(\d{1,8})[ \t]*$/.exec(sau)
        if (m) return m[1]
      }
    }
  }
  return ''
}

/** Ký hiệu: "Ký hiệu (Serial): 1C24THP"; có mẫu để ký hiệu ở dòng dưới ("HÓA ĐƠN GIÁ TRỊ GIA TĂNG 1C24TBA")
 *  hoặc tách "Mẫu số : 1/002" + "Ký hiệu : C25TDG" -> 1C25TDG. */
function kyHieuHoaDon(lines: string[], all: string): string {
  const kh = first(all, /Ký hiệu[^:\n]*:[ \t]*([0-9]?[A-Z][A-Z0-9]{4,7})\b/i).toUpperCase()
  if (/^\d/.test(kh)) return kh
  const mau = first(all, /Mẫu số[^:\n]*:[ \t]*(\d)/i)
  if (kh) return mau + kh
  const truoc = lines.slice(0, 8).join(' ')
  return /\b([12]C\d{2}[A-Z]{2,3})\b/.exec(truoc)?.[1] ?? ''
}

/** Bản thể hiện chưa cấp số ("Số : <Chưa cấp số>") — bản nháp, KHÔNG phải hóa đơn chính thức. */
export function laBanNhap(lines: string[]): boolean {
  return lines.some((l) => /Số[^:\n]*:\s*<?\s*Chưa\s+cấp\s+số/i.test(l))
}

export function parseInvoiceText(lines: string[]): Partial<ParsedInvoice> & { found: number } {
  const all = lines.join('\n')
  // phần người bán: từ đầu tới chỗ bắt đầu thông tin người mua
  const buyerAt = all.search(/Tên khách hàng|Họ (?:và )?tên người mua|Người mua hàng\s*\(|Tên người mua|Đơn vị mua|\(Buyer\)/i)
  const seller = buyerAt > 0 ? all.slice(0, buyerAt) : all

  const ngay = /Ngày\s*(?:\([^)]*\))?\s*(\d{1,2})\s*tháng\s*(?:\([^)]*\))?\s*(\d{1,2})\s*năm\s*(?:\([^)]*\))?\s*(\d{4})/i.exec(all)

  const r: Partial<ParsedInvoice> = {
    kyHieu: kyHieuHoaDon(lines, all),
    soHd: soHoaDon(lines),
    ngayHd: ngay ? `${ngay[3]}-${ngay[2].padStart(2, '0')}-${ngay[1].padStart(2, '0')}` : '',
    tenNguoiBan: cutAtNextLabel(
      first(seller, /(?:Đơn vị bán(?: hàng)?|Tên người bán|Người bán(?: hàng)?|Tên hộ kinh doanh|Chủ hộ kinh doanh)[ \t]*(?:\([^)]*\))?[ \t]*:[ \t]*(.+)/i),
    ),
    // hộ kinh doanh có khi ghi "Căn cước công dân" / "Mã số định danh"; Bkav/VNPT ghi "MST (Tax Code)"
    mstNguoiBan: first(seller, /(?:Mã số thuế|MST|Căn cước công dân|CCCD|Mã số định danh)[ \t]*(?:\([^)]*\))?[ \t]*:[ \t]*([\d \t-]{9,32})/i).replace(/\s/g, ''), // tối đa 32 ký tự: VNPT viết tách từng chữ số
    diaChiNguoiBan: cutAtNextLabel(first(seller, /Địa chỉ\s*(?:\([^)]*\))?\s*:\s*(.+)/i)),
    stkNguoiBan: first(seller, /Số tài khoản\s*(?:\([^)]*\))?\s*:\s*([\d\s.-]{5,30}\d)/i).replace(/[\s.]/g, ''),
    nganHangNguoiBan: cutAtNextLabel(first(seller, /Ngân hàng\s*(?:\([^)]*\))?\s*:\s*(.+)/i)),
  }

  // MISA: tên người bán nằm ở dòng ngay trên "Mã số thuế", không có nhãn
  if (!r.tenNguoiBan) {
    const sl = seller.split('\n')
    const i = sl.findIndex((l) => /Mã số thuế|Căn cước công dân|CCCD|Mã số định danh/i.test(l))
    const prev = i > 0 ? sl[i - 1].trim() : ''
    if (prev && !prev.includes(':') && prev.length > 5) r.tenNguoiBan = prev
  }
  // MISA: "Số tài khoản : 0123456789 - Ngân hàng TMCP … - Chi nhánh …"
  if (!r.nganHangNguoiBan) r.nganHangNguoiBan = first(seller, /Số tài khoản[^:\n]*:\s*[\d\s.]+-\s*(.+)/i)

  // ── Tiền. Mọi dò tìm chỉ trong CÙNG MỘT DÒNG ([ \t]* thay vì \s*) để không lấy nhầm số ở dòng dưới ──
  const tienThueRieng = money(first(all, /Tiền thuế (?:GTGT|giá trị gia tăng)[^:\n]*:[ \t]*'?([\d.,]+)/i))
  // "Cộng tiền (bán) hàng hóa, dịch vụ (Total amount): 4.055.051 [324.949]" — có mẫu ghi luôn tiền thuế ở số thứ 2
  const ch = /Cộng tiền (?:bán )?hàng(?: hóa, dịch vụ| hóa| hoá, dịch vụ)?[^:\n]*:[ \t]*'?([\d.,]+)(?:[ \t]+([\d.,]+))?/i.exec(all)
  const congHang = money(ch?.[1])
  // "Tổng tiền thanh toán: X" hoặc "Tổng tiền thanh toán (Total of payment): trước thuế  thuế  tổng"
  const tt = /Tổng (?:cộng )?(?:số )?tiền thanh toán[^:\n]*:[ \t]*'?([\d.,]+)(?:[ \t]+([\d.,]+)[ \t]+([\d.,]+))?/i.exec(all)
  // MISA: "Tổng cộng (Total) : 17.603.250 1.430.760 19.034.010"
  const tc = /Tổng cộng[ \t]*(?:\([^)]*\))?[ \t]*:[ \t]*([\d.,]+)[ \t]+([\d.,]+)[ \t]+([\d.,]+)/i.exec(all)
  const ba = tt?.[3] ? tt : tc // dòng có đủ 3 số: số CUỐI là tổng
  if (ba) {
    r.tienTruocThue = money(ba[1])
    r.tienThue = money(ba[2])
    r.tongTien = money(ba[3])
  } else {
    r.tienTruocThue = congHang
    r.tienThue = money(ch?.[2]) || tienThueRieng
    r.tongTien = money(tt?.[1]) || congHang + (r.tienThue ?? 0)
  }
  r.tienBangChu = first(all, /(?:(?:Số tiền|Tổng tiền)[^:\n]*bằng chữ|^[ \t]*Bằng chữ)[^:\n]*:[ \t]*(.+)/im)
  if (!r.tienBangChu) {
    // nhãn ở cuối dòng, chữ ở dòng dưới: "Số tiền viết bằng chữ (In words) :" ↵ "Bốn triệu … đồng"
    const i = lines.findIndex((l) => /bằng chữ[^:]*:[ \t]*$/i.test(l))
    if (i >= 0 && /đồng/i.test(lines[i + 1] ?? '')) r.tienBangChu = lines[i + 1].trim()
  }
  r.hdLienQuan = lienQuanPdf(all)

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
