import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { chuanTag, goiYTag, KHONG_TAG } from '../src/lib/hashtag'
import { avgDurations, byCo, byMonth, bySeller, byTag, byYear, coTag, flattenInvoices, khoaNguoiBan, topVaKhac } from '../src/lib/summary'
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

describe('lọc theo người bán (bấm vào biểu đồ)', () => {
  it('khoaNguoiBan: lọc ra đúng số HĐ và số tiền mà bySeller ghi cho người đó; HĐ thiếu MST thì theo tên', () => {
    const d = (mst: string, ten: string, tien: number) => ({ ...emptyDossier(), invoices: [{ ...emptyInvoice(), ngayHd: '2026-01-02', mstNguoiBan: mst, tenNguoiBan: ten, tongTien: tien }] })
    const rows = flattenInvoices([d('0101', 'Quán A', 5), d('0101', 'QUÁN A (đổi tên)', 7), d('', 'Hộ B', 3), d('', 'Hộ B', 4), d('0202', 'C', 1)])
    for (const s of bySeller(rows)) {
      const loc = rows.filter((r) => khoaNguoiBan(r.inv) === s.khoa)
      expect([loc.length, loc.reduce((a, r) => a + r.inv.tongTien, 0)]).toEqual([s.soHd, s.tongTien])
    }
    expect(bySeller(rows).map((s) => [s.khoa, s.soHd])).toEqual([['0101', 2], ['Hộ B', 2], ['0202', 1]])
  })
})

describe('thống kê theo hashtag', () => {
  it('byTag: hồ sơ nhiều tag tính vào mỗi tag; chưa gắn -> "(chưa gắn)" xếp cuối', () => {
    const d = (id: string, tags: string[], tien: number[]) => ({ ...emptyDossier(), id, tags, invoices: tien.map((t) => ({ ...emptyInvoice(), ngayHd: '2026-01-02', tongTien: t })) })
    const rows = flattenInvoices([d('a', ['CBM', 'SCL'], [10]), d('b', ['CBM'], [5, 1]), d('c', [], [7])])
    expect(byTag(rows)).toEqual([
      { ma: 'CBM', soHd: 3, soHoSo: 2, tongTien: 16 },
      { ma: 'SCL', soHd: 1, soHoSo: 1, tongTien: 10 },
      { ma: KHONG_TAG, soHd: 1, soHoSo: 1, tongTien: 7 },
    ])
    expect(rows.filter((r) => coTag(r.d, KHONG_TAG)).map((r) => r.d.id)).toEqual(['c'])
  })
  it('goiYTag: nhận đúng loại việc từ nội dung ĐNTT; chuanTag bỏ dấu / # / khoảng trắng', () => {
    expect(goiYTag('Làm việc với Công ty Điện lực Hưng Yên về công tác CBM năm 2026')).toEqual(['CBM'])
    expect(goiYTag('Kiểm tra thử nghiệm thiết bị theo tình trạng vận hành (CBM); Công tác SCL tại tỉnh Hà Nam')).toEqual(['CBM', 'SCL'])
    expect(goiYTag('lập duyệt định mức nhân công công tác bảo trì bảo dưỡng hệ thống PCCC')).toEqual(['PCCC'])
    expect(goiYTag('kiểm tra việc thực hiện công tác bảo trì bảo dưỡng các thiết bị điện trong TBA 110kV')).toEqual(['BTBD'])
    expect(goiYTag('thực hiện đề tài NCKH: giảm thiểu sự cố lưới điện trung áp')).toEqual(['KHCN'])
    expect(goiYTag('bảo vệ sáng kiến Chế tạo hợp bộ thử nghiệm cách điện vòng dây MBA')).toEqual(['SANGKIEN'])
    expect(goiYTag('Đi ăn trưa')).toEqual([])
    expect(chuanTag(' #sáng kiến ')).toBe('SANGKIEN')
  })
})

describe('tag CNTT (gộp phần mềm + an toàn thông tin)', () => {
  it('nội dung phần mềm dùng chung / an toàn thông tin / Ban CNTT -> CNTT', () => {
    expect(goiYTag('Làm việc với NPC-IT về kế hoạch thực hiện phần mềm dùng chung năm 2026')).toEqual(['CNTT'])
    expect(goiYTag('Kiểm tra công tác đảm bảo an toàn thông tin, an ninh mạng của NPSC')).toEqual(['CNTT'])
    expect(goiYTag('Làm việc với Ban CNTT&CĐS')).toEqual(['CNTT'])
  })
})
