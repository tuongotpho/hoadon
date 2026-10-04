import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { khoaHoaDon, nhapHoaDonCu } from '../src/lib/dossierOps'
import { statusOf, warningsOf } from '../src/lib/status'
import { setStore, type DataStore } from '../src/lib/store'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile, type StoredTemplate, type TemplateKind } from '../src/lib/types'

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
  async getTemplate(_k: TemplateKind): Promise<StoredTemplate | undefined> { return undefined }
  async putTemplate() {}
  async deleteTemplate() {}
  async getSettings(): Promise<Settings> { return DEFAULT_SETTINGS }
  async saveSettings() {}
  subscribe() { return () => {} }
}

const XML = readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8') // HĐ số 123, 1.188.000 đ, có "Dây dẫn"
const xml = (name: string, soHd: string, tien: number) =>
  new File([XML.replace('<SHDon>123</SHDon>', `<SHDon>${soHd}</SHDon>`).replace('<TgTTTBSo>1188000</TgTTTBSo>', `<TgTTTBSo>${tien}</TgTTTBSo>`).replace(/<TgTTTBChu>.*<\/TgTTTBChu>/, '')], name, { type: 'text/xml' })

describe('nhập nhiều hóa đơn cũ', () => {
  let mem: MemStore
  beforeEach(() => {
    mem = new MemStore()
    setStore(mem)
  })

  it('mỗi hóa đơn 1 hồ sơ cũ; gộp ảnh cùng tên; bỏ qua hóa đơn trùng', async () => {
    const tienDo: string[] = []
    const kq = await nhapHoaDonCu(
      [
        xml('HD-0001.xml', '1', 1188000),
        new File([new Uint8Array([1, 2, 3])], 'HD-0001.png', { type: 'image/png' }), // ảnh của HĐ 1
        xml('HD-0002.xml', '2', 5500000),
        xml('ban-sao-HD-0001.xml', '0001', 1188000), // trùng HĐ 1 (số 0001 = 1)
      ],
      (x, t) => tienDo.push(`${x}/${t}`),
    )
    expect(tienDo.at(-1)).toBe('3/3')
    expect(kq.map((k) => [k.soHd, k.trung ?? false])).toEqual([['1', false], ['2', false], ['0001', true]])
    expect(mem.d.size).toBe(2)

    const hs1 = [...mem.d.values()].find((d) => d.invoices[0].soHd === '1')!
    expect(hs1.hoSoCu).toBe(true)
    expect(hs1.invoices[0].fileIds).toHaveLength(2) // XML + ảnh
    expect(mem.f.size).toBe(3) // file của bản trùng đã dọn
  })

  it('hóa đơn cũ: chỉ có chưa / đã thanh toán, không bắt tờ trình / tài khoản', async () => {
    await nhapHoaDonCu([xml('HD-9.xml', '9', 7000000)])
    const d = [...mem.d.values()][0]
    expect(statusOf(d)).toBe('choKt')
    expect(warningsOf(d, DEFAULT_SETTINGS)).toEqual([]) // dù ≥5tr, chưa có STK/nội dung/thành phần
    expect(statusOf({ ...d, ngayKeToanTt: '2026-10-04' })).toBe('daTt')
    // vẫn bắt lỗi số liệu: chữ trên hóa đơn không khớp số
    const lech = { ...d, invoices: [{ ...d.invoices[0], tienBangChu: 'Một triệu đồng' }] }
    expect(warningsOf(lech, DEFAULT_SETTINGS)[0]).toMatch(/KHÔNG khớp/)
  })

  it('trùng = cùng SỐ + NGÀY XUẤT + MST đơn vị xuất (bỏ số 0 đầu)', () => {
    const k = (soHd: string, ngayHd: string, mstNguoiBan: string) => khoaHoaDon({ soHd, ngayHd, mstNguoiBan })
    expect(k('00000322', '2026-05-27', '0100000009')).toBe(k('322', '2026-05-27', '0100000009'))
    expect(k('322', '2026-05-27', '0100000009')).not.toBe(k('322', '2026-05-28', '0100000009')) // khác ngày -> không trùng
    expect(k('322', '2026-05-27', '0100000009')).not.toBe(k('322', '2026-05-27', '0300000000')) // khác đơn vị xuất -> không trùng
    expect(k('322', '', '0100000009')).toBe('') // thiếu ngày -> không dò trùng
  })
})
