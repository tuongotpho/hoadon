import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile } from '../src/lib/types'
import type { DataStore } from '../src/lib/store'

// Giả lập đúng tình huống: trang đang mở là bản cũ, tệp bộ đọc PDF trên web đã bị thay -> import lỗi
vi.mock('../src/lib/pdfText', () => {
  throw new TypeError('Failed to fetch dynamically imported module: https://hoadon-npsc.vercel.app/assets/pdfText-cu.js')
})

const { docLaiHoSoTrong, laHoSoTrong, nhapHoaDonCu } = await import('../src/lib/dossierOps')
const { emptyDossier, emptyInvoice } = await import('../src/lib/model')
const { setStore } = await import('../src/lib/store')

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

let mem: MemStore
beforeEach(() => {
  mem = new MemStore()
  setStore(mem)
})

describe('nhập khi trang là bản cũ (bộ đọc PDF không tải được)', () => {
  it('DỪNG cả lô, KHÔNG tạo hồ sơ trống, không để lại file', async () => {
    const pdf = (n: string) => new File([new Uint8Array([37, 80, 68, 70])], n, { type: 'application/pdf' })
    const kq = await nhapHoaDonCu([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')])
    expect(mem.d.size).toBe(0)
    expect(mem.f.size).toBe(0)
    expect(kq).toHaveLength(1) // dừng ngay ở file đầu
    expect(kq[0].loi).toMatch(/bản cập nhật/)
  })
})

describe('đọc lại hồ sơ trống từ file đã đính kèm', () => {
  it('điền thông tin từ XML đã cất, không cần tải lên lại', async () => {
    const xml = readFileSync('tests/fixtures/hoa-don-tt78.xml', 'utf8')
    await mem.putFile({ id: 'x1', name: 'hd.xml', type: 'text/xml', size: xml.length, addedAt: 1, data: new Blob([xml], { type: 'text/xml' }) })
    const trong = { ...emptyDossier(), hoSoCu: true, invoices: [{ ...emptyInvoice(), fileIds: ['x1'] }] }
    await mem.saveDossier(trong)
    expect(laHoSoTrong(trong)).toBe(true)
    const kq = await docLaiHoSoTrong()
    expect(kq[0]).toMatchObject({ soHd: '123', tongTien: 1188000 })
    expect(mem.d.get(trong.id)?.invoices[0]).toMatchObject({ soHd: '123', tongTien: 1188000, tenNguoiBan: 'CÔNG TY TNHH THỬ NGHIỆM' })
    expect(laHoSoTrong(mem.d.get(trong.id)!)).toBe(false)
  })
})
