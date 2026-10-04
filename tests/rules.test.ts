import { describe, expect, it } from 'vitest'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { canThongTinTk, chuKhopSo, duTruOf, tongTienChuOf } from '../src/lib/rules'
import { DEFAULT_SETTINGS as S } from '../src/lib/types'

const hs = (tien: number, chu = '', duTru = 0) => ({
  ...emptyDossier(),
  duTru,
  invoices: [{ ...emptyInvoice(), tongTien: tien, tienBangChu: chu }],
})

describe('quy tắc tiền', () => {
  it('dự trù tự động: dưới 5tr -> 5tr, từ 5tr -> 20tr; gõ tay thì theo tay', () => {
    expect(duTruOf(hs(4999999), S)).toBe(5000000)
    expect(duTruOf(hs(5000000), S)).toBe(20000000)
    expect(duTruOf(hs(18836300), S)).toBe(20000000)
    expect(duTruOf(hs(18836300, '', 25000000), S)).toBe(25000000)
  })
  it('thông tin tài khoản chỉ khi từ 5tr', () => {
    expect(canThongTinTk(hs(4999999), S)).toBe(false)
    expect(canThongTinTk(hs(5000000), S)).toBe(true)
  })
  it('chữ lấy nguyên văn trên hóa đơn (bỏ dấu chấm cuối), thiếu thì tự đọc', () => {
    expect(tongTienChuOf(hs(18836300, 'mười tám triệu tám trăm ba mươi sáu nghìn ba trăm đồng./.'))).toBe(
      'Mười tám triệu tám trăm ba mươi sáu nghìn ba trăm đồng',
    )
    expect(tongTienChuOf(hs(5000000))).toBe('Năm triệu đồng')
  })
  it('bắt chữ không khớp số, bỏ qua khác biệt cách viết', () => {
    const inv = (t: number, c: string) => ({ ...emptyInvoice(), tongTien: t, tienBangChu: c })
    expect(chuKhopSo(inv(18836300, 'Mười tám triệu tám trăm ba mươi sáu nghìn ba trăm đồng'))).toBe(true)
    expect(chuKhopSo(inv(1024000, 'Một triệu không trăm hai mươi bốn ngàn đồng chẵn.'))).toBe(true)
    expect(chuKhopSo(inv(1105000, 'Một triệu một trăm lẻ năm nghìn đồng'))).toBe(true)
    expect(chuKhopSo(inv(18863300, 'Mười tám triệu tám trăm ba mươi sáu nghìn ba trăm đồng'))).toBe(false)
  })
})
