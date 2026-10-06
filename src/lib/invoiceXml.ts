import type { HdLienQuan, Invoice, InvoiceItem } from './types.js'

/**
 * Đọc file XML hóa đơn điện tử theo chuẩn Tổng cục Thuế (TT78/2021, NĐ123):
 *   HDon > DLHDon > TTChung (KHMSHDon, KHHDon, SHDon, NLap)
 *                 > NDHDon > NBan (Ten, MST, DChi, STKNHang, TNHang)
 *                          > DSHHDVu > HHDVu (THHDVu, DVTinh, SLuong, DGia, ThTien, TSuat)
 *                          > TToan (TgTCThue, TgTThue, TgTTTBSo)
 * File bọc ngoài (TDiep/DLieu...) hay có namespace đều đọc được vì tìm theo tên thẻ.
 */

export type ParsedInvoice = Omit<Invoice, 'id' | 'fileIds'>

function childByName(parent: Element | Document | null | undefined, ...names: string[]): Element | null {
  if (!parent) return null
  for (const name of names) {
    const all = parent.getElementsByTagName('*')
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === name) return all[i]
    }
  }
  return null
}

function text(parent: Element | Document | null | undefined, ...names: string[]): string {
  return childByName(parent, ...names)?.textContent?.trim() ?? ''
}

function num(s: string): number {
  if (!s) return 0
  // XML chuẩn dùng dấu chấm thập phân; phòng trường hợp có dấu phẩy ngăn cách nghìn
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function normDate(s: string): string {
  // 2026-09-28 hoặc 2026-09-28T00:00:00
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  // 28/09/2026
  const vn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (vn) return `${vn[3]}-${vn[2].padStart(2, '0')}-${vn[1].padStart(2, '0')}`
  return ''
}

export class InvoiceXmlError extends Error {}

/** TTHDLQuan: TCHDon 1 = thay thế, 2 = điều chỉnh; KHMSHDCLQuan + KHHDCLQuan + SHDCLQuan + NLHDCLQuan */
function lienQuanXml(doc: Document): HdLienQuan | null {
  const q = childByName(doc, 'TTHDLQuan')
  if (!q) return null
  const tc = text(q, 'TCHDon')
  const so = text(q, 'SHDCLQuan')
  if (!so || (tc !== '1' && tc !== '2')) return null
  return {
    loai: tc === '1' ? 'thayThe' : 'dieuChinh',
    kyHieu: text(q, 'KHMSHDCLQuan') + text(q, 'KHHDCLQuan'),
    soHd: String(Number(so) || so),
    ngayHd: normDate(text(q, 'NLHDCLQuan')),
  }
}

export function parseInvoiceXml(xml: string): ParsedInvoice {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new InvoiceXmlError('File không phải XML hợp lệ')
  }

  const ttChung = childByName(doc, 'TTChung')
  const nBan = childByName(doc, 'NBan')
  const tToan = childByName(doc, 'TToan')

  if (!ttChung && !nBan) {
    throw new InvoiceXmlError('Không nhận ra cấu trúc hóa đơn điện tử (thiếu TTChung/NBan)')
  }

  const items: InvoiceItem[] = []
  const all = doc.getElementsByTagName('*')
  for (let i = 0; i < all.length; i++) {
    const el = all[i]
    if (el.localName !== 'HHDVu') continue
    // TChat: 1 = hàng hóa, 2 = khuyến mại, 3 = chiết khấu, 4 = ghi chú
    const tChat = text(el, 'TChat')
    if (tChat === '4') continue
    items.push({
      ten: text(el, 'THHDVu'),
      dvt: text(el, 'DVTinh'),
      soLuong: num(text(el, 'SLuong')),
      donGia: num(text(el, 'DGia')),
      thanhTien: num(text(el, 'ThTien')),
      thueSuat: text(el, 'TSuat'),
    })
  }

  const tienTruocThue = num(text(tToan, 'TgTCThue'))
  const tienThue = num(text(tToan, 'TgTThue'))
  let tongTien = num(text(tToan, 'TgTTTBSo'))
  if (!tongTien) tongTien = tienTruocThue + tienThue

  return {
    kyHieu: text(ttChung, 'KHMSHDon') + text(ttChung, 'KHHDon'),
    soHd: text(ttChung, 'SHDon'),
    ngayHd: normDate(text(ttChung, 'NLap')),
    tenNguoiBan: text(nBan, 'Ten'),
    mstNguoiBan: text(nBan, 'MST'),
    diaChiNguoiBan: text(nBan, 'DChi'),
    stkNguoiBan: text(nBan, 'STKNHang'),
    nganHangNguoiBan: text(nBan, 'TNHang'),
    tenTaiKhoan: '',
    tienBangChu: text(tToan, 'TgTTTBChu'),
    hdLienQuan: lienQuanXml(doc),
    tienTruocThue,
    tienThue,
    tongTien,
    items,
  }
}
