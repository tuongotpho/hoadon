import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addWorkingDays, fmtDateWords } from '../src/lib/dates'
import { parseInvoiceXml } from '../src/lib/invoiceXml'
import { moneyInWords, numberToVietnamese } from '../src/lib/numberToWords'
import { statusOf, warningsOf } from '../src/lib/status'
import { DEFAULT_SETTINGS, type Dossier } from '../src/lib/types'

describe('đọc số ra chữ', () => {
  it.each([
    [0, 'không'],
    [5, 'năm'],
    [11, 'mười một'],
    [15, 'mười lăm'],
    [21, 'hai mươi mốt'],
    [24, 'hai mươi tư'],
    [25, 'hai mươi lăm'],
    [105, 'một trăm linh năm'],
    [1000, 'một nghìn'],
    [1005000, 'một triệu không trăm linh năm nghìn'],
    [1188000, 'một triệu một trăm tám mươi tám nghìn'],
    [2000000000, 'hai tỷ'],
    [1000000000000, 'một nghìn tỷ'],
    [1234567890, 'một tỷ hai trăm ba mươi tư triệu năm trăm sáu mươi bảy nghìn tám trăm chín mươi'],
  ])('%d -> %s', (n, s) => expect(numberToVietnamese(n)).toBe(s))

  it('chẵn cho số tròn (tờ trình)', () => {
    expect(moneyInWords(20000000, true)).toBe('Hai mươi triệu đồng chẵn')
    expect(moneyInWords(18836300, true)).toBe('Mười tám triệu tám trăm ba mươi sáu nghìn ba trăm đồng')
  })

  it('viết hoa chữ đầu + đồng', () => {
    expect(moneyInWords(1188000)).toBe('Một triệu một trăm tám mươi tám nghìn đồng')
  })
})

describe('ngày tháng', () => {
  it('lùi 2 ngày làm việc từ thứ Hai -> thứ Năm tuần trước', () => {
    expect(addWorkingDays('2026-09-28', -2)).toBe('2026-09-24') // 28/09/2026 là thứ Hai
  })
  it('lùi 0 ngày mà rơi chủ nhật -> về thứ Sáu', () => {
    expect(addWorkingDays('2026-09-27', 0)).toBe('2026-09-25')
  })
  it('ngày bằng chữ', () => expect(fmtDateWords('2026-10-03')).toBe('ngày 03 tháng 10 năm 2026'))
})

describe('đọc XML hóa đơn điện tử', () => {
  const inv = parseInvoiceXml(readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8'))
  it('thông tin chung', () => {
    expect(inv.kyHieu).toBe('1C26TAA')
    expect(inv.soHd).toBe('123')
    expect(inv.ngayHd).toBe('2026-09-28')
  })
  it('lấy người BÁN, không lấy nhầm người mua', () => {
    expect(inv.tenNguoiBan).toBe('CÔNG TY TNHH THỬ NGHIỆM')
    expect(inv.mstNguoiBan).toBe('0100000001')
    expect(inv.stkNguoiBan).toBe('1234567890')
  })
  it('tiền và hàng hóa (bỏ dòng ghi chú)', () => {
    expect(inv.tienTruocThue).toBe(1100000)
    expect(inv.tienThue).toBe(88000)
    expect(inv.tongTien).toBe(1188000)
    expect(inv.tienBangChu).toBe('Một triệu một trăm tám mươi tám nghìn đồng')
    expect(inv.items).toHaveLength(2)
    expect(inv.items[0]).toMatchObject({ ten: 'Dây dẫn AC-70', soLuong: 100, thanhTien: 1000000 })
  })
  it('báo lỗi khi không phải hóa đơn', () => {
    expect(() => parseInvoiceXml('<a><b/></a>')).toThrow()
    expect(() => parseInvoiceXml('không phải xml')).toThrow()
  })
})

function sampleDossier(): Dossier {
  const inv = parseInvoiceXml(readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8'))
  return {
    id: 'x', noiDung: 'Mua vật tư sửa chữa', doiTac: '', duTru: 2000000, nguoiDeNghi: 'A', nhiemVu: 'x', thanhPhan: [], lyDo: 'Do dây bị đứt', ghiChu: '', hinhThucTt: 'Chuyển khoản',
    invoices: [
      { ...inv, id: 'a', fileIds: [], tenTaiKhoan: '' },
      { ...inv, id: 'b', fileIds: [], tenTaiKhoan: '', soHd: '456', tienTruocThue: 100000, tienThue: 8000, tongTien: 108000, items: [] },
    ],
    soToTrinh: '12/TTr', ngayToTrinh: '2026-09-24', soDntt: '34/ĐNTT', ngayDntt: '2026-10-01',
    ngayNopKeToan: '', ngayKeToanTt: '', createdAt: 0, updatedAt: 0,
  }
}

describe('trạng thái & cảnh báo', () => {
  it('đủ tờ trình + ĐNTT -> chờ nộp kế toán', () => expect(statusOf(sampleDossier())).toBe('choNop'))
  it('cảnh báo tờ trình sau ngày hóa đơn', () => {
    const d = { ...sampleDossier(), ngayToTrinh: '2026-09-30' }
    expect(warningsOf(d, DEFAULT_SETTINGS)).toContain('Ngày tờ trình đang SAU ngày hóa đơn')
  })
})
