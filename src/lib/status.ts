import { addWorkingDays, daysBetween, today } from './dates.js'
import { timHangCam } from './hangCam.js'
import { biLienQuan, moTaBiLienQuan, type BanDoThayThe } from './thayThe.js'
import { canThongTinTk, chuKhopSo, duTruOf, sumInvoices } from './rules.js'
import type { Dossier, Settings } from './types.js'

export type StatusKey = 'chuaHd' | 'choLamHs' | 'choNop' | 'choKt' | 'daTt'

export const STATUS_LABEL: Record<StatusKey, string> = {
  chuaHd: 'Chưa có hóa đơn',
  choLamHs: 'Chờ làm tờ trình / ĐNTT',
  choNop: 'Chờ nộp kế toán',
  choKt: 'Chờ kế toán thanh toán',
  daTt: 'Đã thanh toán',
}

export const STATUS_COLOR: Record<StatusKey, string> = {
  chuaHd: 'bg-slate-100 text-slate-700',
  choLamHs: 'bg-amber-100 text-amber-800',
  choNop: 'bg-orange-100 text-orange-800',
  choKt: 'bg-blue-100 text-blue-800',
  daTt: 'bg-emerald-100 text-emerald-800',
}

export function statusOf(d: Dossier): StatusKey {
  if (d.ngayKeToanTt) return 'daTt'
  if (d.hoSoCu) return 'choKt' // hóa đơn cũ: chỉ có đã / chưa thanh toán
  if (d.ngayNopKeToan) return 'choKt'
  if (d.ngayToTrinh && d.ngayDntt) return 'choNop'
  if (d.invoices.length === 0) return 'chuaHd'
  return 'choLamHs'
}

/** Ngày hóa đơn sớm nhất trong hồ sơ. */
export function firstInvoiceDate(d: Dossier): string {
  return d.invoices.map((i) => i.ngayHd).filter(Boolean).sort()[0] ?? ''
}

export function totalOf(d: Dossier): number {
  return sumInvoices(d.invoices).tongTien
}

/** Ngày tờ trình gợi ý: lùi N ngày làm việc trước ngày hóa đơn sớm nhất. */
export function suggestToTrinhDate(d: Dossier, s: Settings): string {
  const hd = firstInvoiceDate(d)
  if (!hd) return ''
  return addWorkingDays(hd, -Math.max(0, s.soNgayToTrinhTruocHd))
}

/** Ngày ĐNTT gợi ý: hôm nay, nhưng không sớm hơn ngày hóa đơn muộn nhất. */
export function suggestDnttDate(d: Dossier): string {
  const latestHd = d.invoices.map((i) => i.ngayHd).filter(Boolean).sort().at(-1) ?? ''
  const t = today()
  return latestHd && latestHd > t ? latestHd : t
}

/**
 * Các điểm bất thường cần anh để ý.
 * map (tùy chọn): bản đồ thay thế của cả kho — để báo hóa đơn ĐÃ BỊ THAY THẾ.
 */
export function warningsOf(d: Dossier, s: Settings, map?: BanDoThayThe): string[] {
  const lq = d.invoices.flatMap((i) => {
    const b = biLienQuan(i, map)
    return b ? [`⛔ ${moTaBiLienQuan(i, b)}`] : []
  })
  return [...lq, ...canhBaoRieng(d, s)]
}

/** Ngày ngược thứ tự (chỉ xét các ngày đã điền) — áp dụng cho cả hóa đơn cũ. */
function ngayNguoc(d: Dossier): string[] {
  const w: string[] = []
  const hd = firstInvoiceDate(d)
  if (d.ngayToTrinh && hd && d.ngayToTrinh > hd) w.push('Ngày tờ trình đang SAU ngày hóa đơn')
  if (d.ngayDntt && hd && d.ngayDntt < hd) w.push('Ngày ĐNTT đang TRƯỚC ngày hóa đơn')
  if (d.ngayNopKeToan && d.ngayDntt && d.ngayNopKeToan < d.ngayDntt) w.push('Ngày nộp kế toán TRƯỚC ngày ĐNTT')
  if (d.ngayKeToanTt && d.ngayNopKeToan && d.ngayKeToanTt < d.ngayNopKeToan) w.push('Ngày kế toán thanh toán TRƯỚC ngày nộp')
  return w
}

function canhBaoRieng(d: Dossier, s: Settings): string[] {
  const w: string[] = []
  if (d.hoSoCu) {
    // Hóa đơn cũ: không bắt tờ trình / nội dung / thông tin TK — chỉ báo lỗi số liệu, hàng cấm, ngày ngược
    const cam = timHangCam(d.invoices, s.tuKhoaCam)
    if (cam.length) w.push(`Có rượu/bia trên hóa đơn (${cam.map((c) => c.ten).join(', ')})`)
    for (const i of d.invoices) {
      if (!i.tongTien) w.push(`HĐ ${i.soHd || '?'}: chưa có tổng tiền`)
      if (!chuKhopSo(i)) w.push(`HĐ ${i.soHd || '?'}: số tiền bằng chữ trên hóa đơn KHÔNG khớp tổng tiền`)
    }
    return [...w, ...ngayNguoc(d), ...choKtQuaLau(d, s)]
  }
  w.push(...ngayNguoc(d))
  const cam = timHangCam(d.invoices, s.tuKhoaCam)
  if (cam.length) w.unshift(`CÓ RƯỢU/BIA trên hóa đơn (${cam.map((c) => c.ten).join(', ')}) — quy định không được thanh toán`)
  const tong = totalOf(d)
  if (tong > duTruOf(d, s)) w.push('Tiền hóa đơn VƯỢT số tiền dự trù trong tờ trình')
  if (canThongTinTk(d, s) && d.invoices.some((i) => !i.stkNguoiBan || !i.tenTaiKhoan)) {
    w.push('HĐ từ 5 triệu: thiếu số tài khoản / tên tài khoản nơi xuất hóa đơn')
  }
  if (!d.nguoiDeNghi) w.push('Chưa chọn người đề nghị thanh toán')
  if (!d.noiDung.trim()) w.push('Chưa nhập nội dung công việc')
  if (!d.doiTac.trim()) w.push('Chưa nhập đơn vị đến làm việc')
  if (d.thanhPhan.length === 0) w.push('Chưa có thành phần tham gia')
  else if (d.thanhPhan.some((t) => !t.donVi.trim())) w.push('Thành phần tham gia có dòng chưa ghi tên đơn vị')
  for (const i of d.invoices) {
    if (!chuKhopSo(i)) w.push(`HĐ ${i.soHd || '?'}: số tiền bằng chữ trên hóa đơn KHÔNG khớp tổng tiền`)
  }
  w.push(...choKtQuaLau(d, s))
  for (const i of d.invoices) {
    const diff = Math.abs(i.tienTruocThue + i.tienThue - i.tongTien)
    if (i.tongTien && (i.tienTruocThue || i.tienThue) && diff > 1) {
      w.push(`HĐ ${i.soHd || '?'}: tiền trước thuế + thuế ≠ tổng tiền`)
    }
  }
  return w
}

/** Chờ kế toán thanh toán quá số ngày trong Cài đặt — áp cho cả hóa đơn cũ nhập kho. */
function choKtQuaLau(d: Dossier, s: Settings): string[] {
  if (statusOf(d) !== 'choKt') return []
  const days = waitingDays(d)
  if (days == null || days <= s.canhBaoChoKtSauNgay) return []
  return [d.ngayNopKeToan ? `Đã nộp kế toán ${days} ngày, chưa được thanh toán` : `Hóa đơn đã ${days} ngày chưa được thanh toán (chưa ghi ngày nộp kế toán)`]
}

/** Số ngày đang chờ ở bước hiện tại (để biết hồ sơ nào kẹt lâu). */
export function waitingDays(d: Dossier): number | null {
  const st = statusOf(d)
  const t = today()
  // hóa đơn cũ nhập kho chưa ghi ngày nộp kế toán -> tính từ ngày hóa đơn
  if (st === 'choKt') return daysBetween(d.ngayNopKeToan || (d.hoSoCu ? firstInvoiceDate(d) : ''), t)
  if (st === 'choNop') return daysBetween(d.ngayDntt, t)
  if (st === 'choLamHs') return daysBetween(firstInvoiceDate(d), t)
  return null
}

// ───────────── Sắp xếp danh sách hồ sơ ─────────────
export type KieuXep = 'ngayHd' | 'tongTien' | 'capNhat'
export interface CachXep {
  theo: KieuXep
  giam: boolean // true = mới nhất / nhiều nhất lên đầu
}
export const XEP_MAC_DINH: CachXep = { theo: 'ngayHd', giam: true }

/** Xếp hồ sơ. Theo ngày HĐ: hồ sơ chưa có ngày luôn nằm cuối; cùng ngày thì số HĐ lớn hơn lên trước (khi giảm). */
export function sapXep(list: Dossier[], c: CachXep): Dossier[] {
  const dau = c.giam ? -1 : 1
  const soHd = (d: Dossier) => Number(d.invoices[0]?.soHd) || 0
  return [...list].sort((a, b) => {
    if (c.theo === 'ngayHd') {
      const na = firstInvoiceDate(a)
      const nb = firstInvoiceDate(b)
      if (!na !== !nb) return na ? -1 : 1 // chưa có ngày -> cuối
      return na === nb ? dau * (soHd(a) - soHd(b)) : dau * na.localeCompare(nb)
    }
    if (c.theo === 'tongTien') return dau * (totalOf(a) - totalOf(b))
    return dau * (a.updatedAt - b.updatedAt)
  })
}
