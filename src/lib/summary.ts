import { daysBetween } from './dates.js'
import { statusOf, type StatusKey } from './status.js'
import type { Dossier, Invoice } from './types.js'

/** Một dòng trong bảng kê: hóa đơn + hồ sơ chứa nó. */
export interface InvoiceRow {
  inv: Invoice
  d: Dossier
  status: StatusKey
}

export function flattenInvoices(list: Dossier[]): InvoiceRow[] {
  return list
    .flatMap((d) => d.invoices.map((inv) => ({ inv, d, status: statusOf(d) })))
    .sort((a, b) => (b.inv.ngayHd || '').localeCompare(a.inv.ngayHd || ''))
}

export function yearsOf(rows: InvoiceRow[]): number[] {
  const ys = new Set(rows.map((r) => Number(r.inv.ngayHd.slice(0, 4))).filter(Boolean))
  return [...ys].sort((a, b) => b - a)
}

export interface MonthStat {
  thang: number
  soHd: number
  tongTien: number
  daTt: number // tiền đã được kế toán thanh toán
  choKt: number // đã nộp, chờ kế toán
  chuaNop: number // chưa nộp kế toán
}

export function byMonth(rows: InvoiceRow[], year: number): MonthStat[] {
  const m: MonthStat[] = Array.from({ length: 12 }, (_, i) => ({ thang: i + 1, soHd: 0, tongTien: 0, daTt: 0, choKt: 0, chuaNop: 0 }))
  for (const r of rows) {
    if (Number(r.inv.ngayHd.slice(0, 4)) !== year) continue
    const s = m[Number(r.inv.ngayHd.slice(5, 7)) - 1]
    if (!s) continue
    const t = r.inv.tongTien || 0
    s.soHd++
    s.tongTien += t
    if (r.status === 'daTt') s.daTt += t
    else if (r.status === 'choKt') s.choKt += t
    else s.chuaNop += t
  }
  return m
}

export interface SellerStat {
  ten: string
  mst: string
  soHd: number
  tongTien: number
}

export function bySeller(rows: InvoiceRow[]): SellerStat[] {
  const map = new Map<string, SellerStat>()
  for (const r of rows) {
    const key = r.inv.mstNguoiBan || r.inv.tenNguoiBan || '(chưa rõ)'
    const s = map.get(key) ?? { ten: r.inv.tenNguoiBan || '(chưa rõ)', mst: r.inv.mstNguoiBan, soHd: 0, tongTien: 0 }
    s.soHd++
    s.tongTien += r.inv.tongTien || 0
    map.set(key, s)
  }
  return [...map.values()].sort((a, b) => b.tongTien - a.tongTien)
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && x >= 0)
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null
}

/** Thời gian trung bình (ngày) cho từng chặng, tính trên các hồ sơ đã có đủ 2 mốc. */
export function avgDurations(list: Dossier[]) {
  const firstHd = (d: Dossier) => d.invoices.map((i) => i.ngayHd).filter(Boolean).sort()[0] ?? ''
  return {
    hdDenNop: avg(list.map((d) => (d.ngayNopKeToan && firstHd(d) ? daysBetween(firstHd(d), d.ngayNopKeToan) : null))),
    nopDenTt: avg(list.map((d) => (d.ngayKeToanTt && d.ngayNopKeToan ? daysBetween(d.ngayNopKeToan, d.ngayKeToanTt) : null))),
  }
}
