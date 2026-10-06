import { moneyInWords } from './numberToWords.js'
import type { Dossier, Invoice, Settings } from './types.js'

/** Quy tắc nghiệp vụ về tiền, dùng chung cho màn hình, cảnh báo và mẫu in. */

export function sumInvoices(invoices: Invoice[]) {
  return invoices.reduce(
    (a, i) => ({
      tienTruocThue: a.tienTruocThue + (i.tienTruocThue || 0),
      tienThue: a.tienThue + (i.tienThue || 0),
      tongTien: a.tongTien + (i.tongTien || 0),
    }),
    { tienTruocThue: 0, tienThue: 0, tongTien: 0 },
  )
}

export const tongTienOf = (d: Dossier) => sumInvoices(d.invoices).tongTien

/** Dự trù theo quy tắc: HĐ dưới ngưỡng (5tr) -> 5tr, từ ngưỡng trở lên -> 20tr. */
export function duTruTuDong(d: Dossier, s: Settings): number {
  return tongTienOf(d) < s.nguongTien ? s.duTruDuoiNguong : s.duTruTuNguong
}

/** Dự trù dùng để in: số anh gõ tay, không gõ thì theo quy tắc. */
export function duTruOf(d: Dossier, s: Settings): number {
  return d.duTru || duTruTuDong(d, s)
}

/** Từ ngưỡng (5tr) trở lên mới cần in thông tin tài khoản của nơi xuất hóa đơn. */
export function canThongTinTk(d: Dossier, s: Settings): boolean {
  return tongTienOf(d) >= s.nguongTien
}

/** Làm sạch dòng chữ trên hóa đơn: bỏ dấu chấm cuối, viết hoa chữ đầu. */
function cleanWords(s: string): string {
  const t = s.trim().replace(/[./\s]+$/, '').replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Tổng tiền bằng chữ: lấy đúng chữ in trên hóa đơn.
 * Hồ sơ nhiều hóa đơn (phải cộng lại) hoặc hóa đơn thiếu dòng chữ thì app tự đọc số.
 */
export function tongTienChuOf(d: Dossier): string {
  if (d.invoices.length === 1 && d.invoices[0].tienBangChu.trim()) return cleanWords(d.invoices[0].tienBangChu)
  return moneyInWords(tongTienOf(d))
}

// Chuẩn hóa để so chữ với số: các cách viết khác nhau nhưng cùng nghĩa coi là một
const BO_QUA = new Set(['chẵn', 'chẳn', 'đồng', 'việt', 'nam', 'vnđ', 'vnd'])
const DOI: Record<string, string> = { ngàn: 'nghìn', lẻ: 'linh' }

function normWords(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,/;:()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !BO_QUA.has(w))
    .map((w) => DOI[w] ?? w)
    .join(' ')
    .replace(/mươi bốn/g, 'mươi tư')
    .replace(/mươi một/g, 'mươi mốt')
}

/** Chữ trên hóa đơn có khớp với số tổng tiền không (bắt lỗi gõ nhầm số). */
export function chuKhopSo(inv: Invoice): boolean {
  if (!inv.tienBangChu.trim() || !inv.tongTien) return true
  return normWords(inv.tienBangChu) === normWords(moneyInWords(inv.tongTien))
}
