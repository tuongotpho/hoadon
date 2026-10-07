import { KHONG_TAG } from './hashtag.js'
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
  khoa: string // mã nhận diện người bán (xem khoaNguoiBan) — dùng để lọc
  ten: string
  mst: string
  soHd: number
  tongTien: number
}

/** Nhận diện người bán: theo MST; hóa đơn thiếu MST thì theo tên. Lọc và xếp hạng dùng chung hàm này. */
export function khoaNguoiBan(inv: Pick<Invoice, 'mstNguoiBan' | 'tenNguoiBan'>): string {
  return inv.mstNguoiBan || inv.tenNguoiBan || '(chưa rõ)'
}

export function bySeller(rows: InvoiceRow[]): SellerStat[] {
  const map = new Map<string, SellerStat>()
  for (const r of rows) {
    const key = khoaNguoiBan(r.inv)
    const s = map.get(key) ?? { khoa: key, ten: r.inv.tenNguoiBan || '(chưa rõ)', mst: r.inv.mstNguoiBan, soHd: 0, tongTien: 0 }
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

export interface YearStat extends Omit<MonthStat, 'thang'> {
  nam: number
}

/** Như byMonth nhưng gộp theo năm (biểu đồ khi chọn "Tất cả các năm"). Năm cũ trước. */
export function byYear(rows: InvoiceRow[]): YearStat[] {
  return yearsOf(rows)
    .sort((a, b) => a - b)
    .map((nam) => byMonth(rows, nam).reduce<YearStat>(
      (a, m) => ({ nam, soHd: a.soHd + m.soHd, tongTien: a.tongTien + m.tongTien, daTt: a.daTt + m.daTt, choKt: a.choKt + m.choKt, chuaNop: a.chuaNop + m.chuaNop }),
      { nam, soHd: 0, tongTien: 0, daTt: 0, choKt: 0, chuaNop: 0 },
    ))
}

/** Top N người bán, phần còn lại gộp thành 1 dòng "khác" (không vẽ thêm màu cho từng người). */
export function topVaKhac(list: SellerStat[], n: number): { top: SellerStat[]; khac: { soNguoi: number; soHd: number; tongTien: number } | null } {
  const con = list.slice(n)
  return {
    top: list.slice(0, n),
    khac: con.length ? { soNguoi: con.length, soHd: con.reduce((a, s) => a + s.soHd, 0), tongTien: con.reduce((a, s) => a + s.tongTien, 0) } : null,
  }
}

export interface CoStat {
  tu: number // từ (gồm)
  den: number | null // đến (không gồm); null = trở lên
  soHd: number
  tongTien: number
}

/** Chia hóa đơn theo cỡ tiền: dưới 2tr, 2–5tr, 5–10tr, 10–20tr, từ 20tr. Mốc 5tr = ngưỡng in tài khoản người bán. */
export function byCo(rows: InvoiceRow[], moc = [2e6, 5e6, 10e6, 20e6]): CoStat[] {
  const bien = [0, ...moc]
  const out: CoStat[] = bien.map((tu, i) => ({ tu, den: moc[i] ?? null, soHd: 0, tongTien: 0 }))
  for (const r of rows) {
    const t = r.inv.tongTien || 0
    const o = [...out].reverse().find((x) => t >= x.tu)!
    o.soHd++
    o.tongTien += t
  }
  return out
}

export interface TagStat {
  ma: string // mã tag, hoặc KHONG_TAG
  soHd: number
  soHoSo: number
  tongTien: number
}

/**
 * Tiền theo hashtag công việc. Hồ sơ nhiều tag được tính vào MỖI tag
 * (nên cộng các tag có thể lớn hơn tổng tiền — ghi rõ khi hiển thị). Hồ sơ chưa gắn -> KHONG_TAG.
 */
export function byTag(rows: InvoiceRow[]): TagStat[] {
  const map = new Map<string, TagStat & { hs: Set<string> }>()
  for (const r of rows) {
    for (const ma of r.d.tags?.length ? r.d.tags : [KHONG_TAG]) {
      const s = map.get(ma) ?? { ma, soHd: 0, soHoSo: 0, tongTien: 0, hs: new Set<string>() }
      s.soHd++
      s.tongTien += r.inv.tongTien || 0
      s.hs.add(r.d.id)
      map.set(ma, s)
    }
  }
  return [...map.values()]
    .map(({ hs, ...s }) => ({ ...s, soHoSo: hs.size }))
    .sort((a, b) => (a.ma === KHONG_TAG ? 1 : b.ma === KHONG_TAG ? -1 : b.tongTien - a.tongTien))
}

/** Hóa đơn có thuộc tag này không (KHONG_TAG = hồ sơ chưa gắn tag nào) */
export const coTag = (d: Dossier, ma: string) => (ma === KHONG_TAG ? !d.tags?.length : !!d.tags?.includes(ma))
