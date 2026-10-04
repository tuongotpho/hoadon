import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { sapXep, XEP_MAC_DINH } from '../src/lib/status'

const hs = (soHd: string, ngayHd: string, tongTien = 0, updatedAt = 0) => ({
  ...emptyDossier(), updatedAt, invoices: [{ ...emptyInvoice(), soHd, ngayHd, tongTien }],
})
const so = (l: ReturnType<typeof hs>[]) => l.map((d) => d.invoices[0].soHd)

describe('sắp xếp hồ sơ', () => {
  const list = [hs('1', '2024-05-28', 5, 3), hs('2', '', 9, 9), hs('3', '2026-09-25', 1, 1), hs('4', '2025-07-23', 7, 2), hs('5', '2026-09-25', 2, 0)]
  it('mặc định: ngày HĐ mới nhất trên cùng, cùng ngày số lớn trước, chưa có ngày nằm cuối', () => {
    expect(so(sapXep(list, XEP_MAC_DINH))).toEqual(['5', '3', '4', '1', '2'])
  })
  it('đảo chiều: cũ nhất trên cùng, chưa có ngày vẫn cuối', () => {
    expect(so(sapXep(list, { theo: 'ngayHd', giam: false }))).toEqual(['1', '4', '3', '5', '2'])
  })
  it('theo tổng tiền / theo lần sửa', () => {
    expect(so(sapXep(list, { theo: 'tongTien', giam: true }))).toEqual(['2', '4', '1', '5', '3'])
    expect(so(sapXep(list, { theo: 'capNhat', giam: true }))).toEqual(['2', '1', '4', '3', '5'])
  })
})
