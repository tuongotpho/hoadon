import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { avgDurations, byMonth, bySeller, flattenInvoices } from '../src/lib/summary'
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
