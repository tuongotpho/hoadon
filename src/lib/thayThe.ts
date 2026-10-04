import type { Dossier, HdLienQuan, Invoice } from './types'

/**
 * Quan hệ "hóa đơn thay thế / điều chỉnh" giữa các hóa đơn trong kho.
 * Hóa đơn mới ghi "Thay thế cho hóa đơn ký hiệu …, số …" (hdLienQuan) -> hóa đơn cũ được coi là ĐÃ BỊ THAY THẾ.
 * Khóa so khớp: ký hiệu + số (+ MST người bán: hóa đơn thay thế luôn do cùng người bán xuất).
 */
export interface BiLienQuan {
  loai: HdLienQuan['loai']
  boiSoHd: string // số HĐ mới (hóa đơn thay thế / điều chỉnh)
  boiKyHieu: string
  boiNgay: string
  dossierId: string
}

export type BanDoThayThe = Map<string, BiLienQuan>

const khoa = (kyHieu: string, soHd: string, mst: string) =>
  `${kyHieu.trim().toUpperCase()}|${String(Number(soHd) || soHd.trim())}|${mst.trim()}`

/** Lập bản đồ: hóa đơn nào đã bị hóa đơn nào thay thế / điều chỉnh. */
export function banDoThayThe(list: Dossier[]): BanDoThayThe {
  const m: BanDoThayThe = new Map()
  for (const d of list) {
    for (const i of d.invoices) {
      const q = i.hdLienQuan
      if (!q?.soHd) continue
      const v = { loai: q.loai, boiSoHd: i.soHd, boiKyHieu: i.kyHieu, boiNgay: i.ngayHd, dossierId: d.id }
      m.set(khoa(q.kyHieu, q.soHd, i.mstNguoiBan), v)
      if (!m.has(khoa(q.kyHieu, q.soHd, ''))) m.set(khoa(q.kyHieu, q.soHd, ''), v) // phòng HĐ cũ thiếu MST
    }
  }
  return m
}

/** Hóa đơn này có bị hóa đơn khác thay thế / điều chỉnh không. */
export function biLienQuan(inv: Invoice, map?: BanDoThayThe): BiLienQuan | undefined {
  if (!map || !inv.soHd) return undefined
  return map.get(khoa(inv.kyHieu, inv.soHd, inv.mstNguoiBan)) ?? (inv.mstNguoiBan ? undefined : map.get(khoa(inv.kyHieu, inv.soHd, '')))
}

export function moTaBiLienQuan(inv: Invoice, b: BiLienQuan): string {
  return b.loai === 'thayThe'
    ? `HĐ ${inv.soHd} ĐÃ BỊ THAY THẾ bởi HĐ ${b.boiSoHd} (${b.boiKyHieu}) — không dùng hóa đơn này để thanh toán`
    : `HĐ ${inv.soHd} đã có hóa đơn điều chỉnh số ${b.boiSoHd} (${b.boiKyHieu}) — kiểm tra lại số tiền`
}

export function moTaLienQuan(q: HdLienQuan): string {
  return `${q.loai === 'thayThe' ? 'Thay thế' : 'Điều chỉnh'} cho HĐ số ${q.soHd}${q.kyHieu ? ` (${q.kyHieu})` : ''}${q.ngayHd ? ` ngày ${q.ngayHd.split('-').reverse().join('/')}` : ''}`
}
