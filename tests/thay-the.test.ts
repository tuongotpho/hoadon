import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { nhapHoaDonCu } from '../src/lib/dossierOps'
import { lienQuanPdf, parseInvoiceText } from '../src/lib/invoicePdf'
import { parseInvoiceXml } from '../src/lib/invoiceXml'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { warningsOf } from '../src/lib/status'
import { setStore, type DataStore } from '../src/lib/store'
import { banDoThayThe, biLienQuan } from '../src/lib/thayThe'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile } from '../src/lib/types'

describe('đọc dòng "thay thế cho hóa đơn"', () => {
  it('kiểu MISA (như HĐ thật 357 thay 322): Mẫu số 1, ký hiệu C26MPD, số 00000322', () => {
    expect(lienQuanPdf('Thay thế cho hóa đơn Mẫu số 1, ký hiệu C26MPD, số 00000322, ngày 27 tháng 05 năm 2026')).toEqual({
      loai: 'thayThe', kyHieu: '1C26MPD', soHd: '322', ngayHd: '2026-05-27',
    })
  })
  it('kiểu khác: "Hóa đơn điều chỉnh cho hóa đơn ký hiệu 1C24TAA số 123 ngày 01/02/2024"', () => {
    expect(lienQuanPdf('Hóa đơn điều chỉnh cho hóa đơn ký hiệu 1C24TAA số 123 ngày 01/02/2024')).toEqual({
      loai: 'dieuChinh', kyHieu: '1C24TAA', soHd: '123', ngayHd: '2024-02-01',
    })
  })
  it('KHÔNG nhầm: "Trang bị, thay thế, sửa chữa thiết bị CNTT" (bảng chi phí)', () => {
    expect(lienQuanPdf('1 Trang bị, thay thế, sửa chưa thiết bị CNTT 750 75 91 91')).toBeNull()
  })
  it('đọc trọn hóa đơn PDF có dòng thay thế', () => {
    const r = parseInvoiceText([
      'CÔNG TY TNHH THỬ NGHIỆM', 'Mã số thuế : 0100000001', 'HÓA ĐƠN GIÁ TRỊ GIA TĂNG Ký hiệu : 1C26MPD', 'Ngày 05 tháng 06 năm 2026 Số : 00000357',
      'Thay thế cho hóa đơn Mẫu số 1, ký hiệu C26MPD, số 00000322, ngày 27 tháng 05 năm 2026', 'Họ và tên người mua hàng :',
      'Tổng cộng : 100.000 8.000 108.000',
    ])
    expect(r).toMatchObject({ soHd: '357', hdLienQuan: { loai: 'thayThe', soHd: '322', kyHieu: '1C26MPD' } })
  })
  it('XML chuẩn TT78: TTHDLQuan', () => {
    const xml = readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8').replace(
      '</TTChung>',
      '<TTHDLQuan><TCHDon>1</TCHDon><LHDCLQuan>1</LHDCLQuan><KHMSHDCLQuan>1</KHMSHDCLQuan><KHHDCLQuan>C26TAA</KHHDCLQuan><SHDCLQuan>00000099</SHDCLQuan><NLHDCLQuan>2026-09-01</NLHDCLQuan></TTHDLQuan></TTChung>',
    )
    expect(parseInvoiceXml(xml).hdLienQuan).toEqual({ loai: 'thayThe', kyHieu: '1C26TAA', soHd: '99', ngayHd: '2026-09-01' })
    expect(parseInvoiceXml(readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8')).hdLienQuan).toBeNull()
  })
})

const hd = (soHd: string, kyHieu: string, mst: string, lq: Dossier['invoices'][0]['hdLienQuan'] = null) => ({
  ...emptyInvoice(), soHd, kyHieu, mstNguoiBan: mst, tongTien: 1000, hdLienQuan: lq,
})

describe('cảnh báo hóa đơn đã bị thay thế', () => {
  const cu = { ...emptyDossier(), id: 'cu', invoices: [hd('322', '1C26MPD', '0109596976')] }
  const moi = { ...emptyDossier(), id: 'moi', invoices: [hd('357', '1C26MPD', '0109596976', { loai: 'thayThe', kyHieu: '1C26MPD', soHd: '322', ngayHd: '2026-05-27' })] }

  it('HĐ cũ bị gắn ⛔, HĐ mới thì không', () => {
    const map = banDoThayThe([cu, moi])
    expect(warningsOf(cu, DEFAULT_SETTINGS, map)[0]).toBe('⛔ HĐ 322 ĐÃ BỊ THAY THẾ bởi HĐ 357 (1C26MPD) — không dùng hóa đơn này để thanh toán')
    expect(warningsOf(moi, DEFAULT_SETTINGS, map).some((w) => w.includes('BỊ THAY THẾ'))).toBe(false)
  })
  it('khác người bán (khác MST) thì không gắn nhầm', () => {
    const nguoiKhac = { ...cu, invoices: [hd('322', '1C26MPD', '0300000000')] }
    expect(biLienQuan(nguoiKhac.invoices[0], banDoThayThe([moi]))).toBeUndefined()
  })
  it('áp dụng cả cho hóa đơn cũ nhập vào kho', () => {
    expect(warningsOf({ ...cu, hoSoCu: true }, DEFAULT_SETTINGS, banDoThayThe([cu, moi]))[0]).toMatch(/ĐÃ BỊ THAY THẾ/)
  })
})

class MemStore implements DataStore {
  d = new Map<string, Dossier>()
  f = new Map<string, StoredFile>()
  async listDossiers() { return [...this.d.values()] }
  async getDossier(id: string) { return this.d.get(id) }
  async saveDossier(x: Dossier) { this.d.set(x.id, x) }
  async deleteDossier(id: string) { this.d.delete(id) }
  async putFile(x: StoredFile) { this.f.set(x.id, x) }
  async getFile(id: string) { return this.f.get(id) }
  async getFileInfo(id: string) { const f = this.f.get(id); if (!f) return undefined; const { data: _d, ...i } = f; return i }
  async deleteFile(id: string) { this.f.delete(id) }
  async listFiles() { return [...this.f.values()] }
  async getTemplate() { return undefined }
  async putTemplate() {}
  async deleteTemplate() {}
  async getSettings(): Promise<Settings> { return DEFAULT_SETTINGS }
  async saveSettings() {}
  subscribe() { return () => {} }
}

describe('nhập lô có cả hóa đơn cũ lẫn hóa đơn thay thế', () => {
  beforeEach(() => setStore(new MemStore()))
  it('dòng HĐ bị thay thế được ghi chú ⛔, dòng HĐ thay thế ghi 🔁', async () => {
    const XML = readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8')
    const cu = XML.replace('<SHDon>123</SHDon>', '<SHDon>99</SHDon>')
    const moi = XML.replace('<SHDon>123</SHDon>', '<SHDon>100</SHDon>').replace(
      '</TTChung>',
      '<TTHDLQuan><TCHDon>1</TCHDon><KHMSHDCLQuan>1</KHMSHDCLQuan><KHHDCLQuan>C26TAA</KHHDCLQuan><SHDCLQuan>99</SHDCLQuan><NLHDCLQuan>2026-09-01</NLHDCLQuan></TTHDLQuan></TTChung>',
    )
    const kq = await nhapHoaDonCu([new File([cu], 'cu.xml', { type: 'text/xml' }), new File([moi], 'moi.xml', { type: 'text/xml' })])
    expect(kq.find((k) => k.soHd === '99')?.ghiChu).toMatch(/ĐÃ BỊ THAY THẾ bởi HĐ 100/)
    expect(kq.find((k) => k.soHd === '100')?.ghiChu).toMatch(/Thay thế cho HĐ số 99/)
  })
})
