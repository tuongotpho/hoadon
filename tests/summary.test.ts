import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { avgDurations, byCo, byMonth, bySeller, byYear, flattenInvoices, topVaKhac } from '../src/lib/summary'
import type { Dossier } from '../src/lib/types'

function hs(ngayHd: string, tien: number, mst: string, patch: Partial<Dossier> = {}): Dossier {
  return {
    ...emptyDossier(),
    ngayToTrinh: '2026-01-01',
    ngayDntt: '2026-01-02',
    invoices: [{ ...emptyInvoice(), ngayHd, tongTien: tien, mstNguoiBan: mst, tenNguoiBan: 'Bên ' + mst }],
    ...patch,
  }
}

const list = [
  hs('2026-09-25', 18836300, 'A', { ngayNopKeToan: '2026-09-30', ngayKeToanTt: '2026-10-10' }), // đã TT
  hs('2026-09-10', 1000000, 'B', { ngayNopKeToan: '2026-09-20' }), // chờ KT
  hs('2026-08-05', 500000, 'A'), // chưa nộp
  hs('2025-12-31', 700000, 'C'), // năm khác
]

describe('tổng hợp', () => {
  const rows = flattenInvoices(list)

  it('cộng theo tháng đúng từng cột', () => {
    const m = byMonth(rows, 2026)
    expect(m[8]).toMatchObject({ thang: 9, soHd: 2, tongTien: 19836300, daTt: 18836300, choKt: 1000000, chuaNop: 0 })
    expect(m[7]).toMatchObject({ thang: 8, soHd: 1, tongTien: 500000, chuaNop: 500000 })
    expect(m.reduce((a, x) => a + x.soHd, 0)).toBe(3) // không lẫn HĐ năm 2025
  })

  it('cộng theo người bán, xếp nhiều tiền lên đầu', () => {
    const s = bySeller(rows)
    expect(s[0]).toMatchObject({ mst: 'A', soHd: 2, tongTien: 19336300 })
    expect(s).toHaveLength(3)
  })

  it('thời gian trung bình', () => {
    // HĐ->nộp: 25/9->30/9 = 5, 10/9->20/9 = 10 => 7.5 ; nộp->TT: 30/9->10/10 = 10
    expect(avgDurations(list)).toEqual({ hdDenNop: 7.5, nopDenTt: 10 })
  })
})

describe('số liệu cho biểu đồ', () => {
  const row = (ngayHd: string, tongTien: number, ten = 'A', ngayKeToanTt = '') => {
    const d = { ...emptyDossier(), ngayNopKeToan: ngayKeToanTt ? '2025-01-01' : '', ngayKeToanTt, invoices: [{ ...emptyInvoice(), ngayHd, tongTien, tenNguoiBan: ten, mstNguoiBan: ten }] }
    return flattenInvoices([d])[0]
  }
  it('byYear: gộp theo năm, năm cũ trước, tách đã TT / chưa nộp', () => {
    const rows = [row('2025-03-01', 1_000_000, 'A', '2025-04-01'), row('2026-05-01', 2_000_000), row('2026-07-01', 3_000_000)]
    expect(byYear(rows)).toEqual([
      { nam: 2025, soHd: 1, tongTien: 1_000_000, daTt: 1_000_000, choKt: 0, chuaNop: 0 },
      { nam: 2026, soHd: 2, tongTien: 5_000_000, daTt: 0, choKt: 0, chuaNop: 5_000_000 },
    ])
  })
  it('byCo: mốc 5 triệu tính vào nhóm "5–10tr" (từ ngưỡng trở lên)', () => {
    const c = byCo([row('2026-01-01', 1_999_999), row('2026-01-01', 4_990_000), row('2026-01-01', 5_000_000), row('2026-01-01', 25_000_000)])
    expect(c.map((x) => [x.tu, x.den, x.soHd])).toEqual([[0, 2e6, 1], [2e6, 5e6, 1], [5e6, 10e6, 1], [10e6, 20e6, 0], [20e6, null, 1]])
  })
  it('topVaKhac: phần còn lại gộp 1 dòng', () => {
    const s = bySeller([row('2026-01-01', 5, 'A'), row('2026-01-01', 4, 'B'), row('2026-01-01', 3, 'C'), row('2026-01-01', 2, 'D')])
    const r = topVaKhac(s, 2)
    expect(r.top.map((x) => x.ten)).toEqual(['A', 'B'])
    expect(r.khac).toEqual({ soNguoi: 2, soHd: 2, tongTien: 5 })
    expect(topVaKhac(s, 10).khac).toBeNull()
  })
})
