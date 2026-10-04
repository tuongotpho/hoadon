import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { apDungNgay, KHONG_DOI, xemTruocNgay } from '../src/lib/suaHangLoat'
import { DEFAULT_SETTINGS as S } from '../src/lib/types'

const hs = (ngayHd: string, p: Partial<ReturnType<typeof emptyDossier>> = {}) => ({
  ...emptyDossier(), invoices: [{ ...emptyInvoice(), soHd: '1', ngayHd, tongTien: 1 }], ...p,
})

describe('sửa ngày hàng loạt', () => {
  it('giữ nguyên thì không đổi gì', () => {
    const d = hs('2026-09-28', { ngayDntt: '2026-10-01' })
    expect(apDungNgay(d, KHONG_DOI, S)).toEqual(d)
  })
  it('đặt 1 ngày cho tất cả; xóa ngày', () => {
    const d = hs('2026-09-28', { ngayKeToanTt: '2026-10-20' })
    const r = apDungNgay(d, { ...KHONG_DOI, ngayNopKeToan: { kieu: 'dat', ngay: '2026-10-05' }, ngayKeToanTt: { kieu: 'xoa' } }, S)
    expect(r).toMatchObject({ ngayNopKeToan: '2026-10-05', ngayKeToanTt: '' })
  })
  it('theo ngày HĐ của TỪNG hồ sơ: tờ trình lùi 2 ngày làm việc, ĐNTT = ngày HĐ', () => {
    const td = { ...KHONG_DOI, ngayToTrinh: { kieu: 'theoHd' as const }, ngayDntt: { kieu: 'theoHd' as const } }
    expect(apDungNgay(hs('2026-09-28'), td, S)).toMatchObject({ ngayToTrinh: '2026-09-24', ngayDntt: '2026-09-28' }) // thứ Hai -> thứ Năm
    expect(apDungNgay(hs('2026-05-27'), td, S)).toMatchObject({ ngayToTrinh: '2026-05-25', ngayDntt: '2026-05-27' })
  })
  it('xem trước: đếm hồ sơ đổi và hồ sơ bị ngày ngược', () => {
    const list = [hs('2026-09-28', { ngayDntt: '2026-10-10' }), hs('2026-09-28', { ngayDntt: '2026-10-01' })]
    const td = { ...KHONG_DOI, ngayNopKeToan: { kieu: 'dat' as const, ngay: '2026-10-05' } }
    const r = xemTruocNgay(list, td, S)
    expect(r.doi).toBe(2)
    expect(r.nguoc).toHaveLength(1) // hồ sơ 1: nộp 05/10 trước ĐNTT 10/10
    expect(r.nguoc[0].canhBao[0]).toMatch(/nộp kế toán TRƯỚC ngày ĐNTT/)
  })
})

describe('hóa đơn cũ cũng bị báo ngày ngược', () => {
  it('nộp trước ĐNTT', () => {
    const r = xemTruocNgay([hs('2026-09-28', { hoSoCu: true, ngayDntt: '2026-10-10' })], { ...KHONG_DOI, ngayNopKeToan: { kieu: 'dat', ngay: '2026-10-05' } }, S)
    expect(r.nguoc).toHaveLength(1)
  })
})
