import { addWorkingDays, daysBetween, today } from './dates'
import { timHangCam } from './hangCam'
import { canThongTinTk, chuKhopSo, duTruOf, sumInvoices } from './rules'
import type { Dossier, Settings } from './types'

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

/** Các điểm bất thường cần anh để ý. */
export function warningsOf(d: Dossier, s: Settings): string[] {
  const w: string[] = []
  const hd = firstInvoiceDate(d)
  if (d.ngayToTrinh && hd && d.ngayToTrinh > hd) w.push('Ngày tờ trình đang SAU ngày hóa đơn')
  if (d.ngayDntt && hd && d.ngayDntt < hd) w.push('Ngày ĐNTT đang TRƯỚC ngày hóa đơn')
  if (d.ngayNopKeToan && d.ngayDntt && d.ngayNopKeToan < d.ngayDntt) w.push('Ngày nộp kế toán TRƯỚC ngày ĐNTT')
  if (d.ngayKeToanTt && d.ngayNopKeToan && d.ngayKeToanTt < d.ngayNopKeToan) w.push('Ngày kế toán thanh toán TRƯỚC ngày nộp')
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
  if (statusOf(d) === 'choKt') {
    const days = daysBetween(d.ngayNopKeToan, today()) ?? 0
    if (days > s.canhBaoChoKtSauNgay) w.push(`Đã nộp kế toán ${days} ngày, chưa được thanh toán`)
  }
  for (const i of d.invoices) {
    const diff = Math.abs(i.tienTruocThue + i.tienThue - i.tongTien)
    if (i.tongTien && (i.tienTruocThue || i.tienThue) && diff > 1) {
      w.push(`HĐ ${i.soHd || '?'}: tiền trước thuế + thuế ≠ tổng tiền`)
    }
  }
  return w
}

/** Số ngày đang chờ ở bước hiện tại (để biết hồ sơ nào kẹt lâu). */
export function waitingDays(d: Dossier): number | null {
  const st = statusOf(d)
  const t = today()
  if (st === 'choKt') return daysBetween(d.ngayNopKeToan, t)
  if (st === 'choNop') return daysBetween(d.ngayDntt, t)
  if (st === 'choLamHs') return daysBetween(firstInvoiceDate(d), t)
  return null
}
