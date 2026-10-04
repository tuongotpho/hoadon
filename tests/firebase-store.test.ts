// @vitest-environment node
/**
 * Kiểm tra FirebaseStore trên Firebase GIẢ LẬP (chạy trên máy, dự án giả demo-hoadon):
 *   npm run test:firebase
 * Không có giả lập (FIRESTORE_EMULATOR_HOST) thì bỏ qua.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, doc, getDoc, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copyAll } from '../src/lib/backup'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import type { DataStore } from '../src/lib/store/DataStore'
import { FirebaseStore } from '../src/lib/store/FirebaseStore'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile, type StoredTemplate, type TemplateKind } from '../src/lib/types'

const ON = !!process.env.FIRESTORE_EMULATOR_HOST
const apps: FirebaseApp[] = []

async function user(name: string): Promise<{ db: Firestore; uid: string }> {
  const app = initializeApp({ projectId: 'demo-hoadon', apiKey: 'gia-lap' }, name)
  apps.push(app)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  const db = initializeFirestore(app, { localCache: memoryLocalCache() }, 'hoadon')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':')
  connectFirestoreEmulator(db, host, Number(port))
  return { db, uid: user.uid }
}

// Kho tạm trong bộ nhớ, đóng vai "dữ liệu trên máy" để thử chuyển lên tài khoản
class MemStore implements DataStore {
  d = new Map<string, Dossier>()
  f = new Map<string, StoredFile>()
  t = new Map<TemplateKind, StoredTemplate>()
  s: Settings = DEFAULT_SETTINGS
  async listDossiers() { return [...this.d.values()] }
  async getDossier(id: string) { return this.d.get(id) }
  async saveDossier(x: Dossier) { this.d.set(x.id, x) }
  async deleteDossier(id: string) { this.d.delete(id) }
  async putFile(x: StoredFile) { this.f.set(x.id, x) }
  async getFile(id: string) { return this.f.get(id) }
  async deleteFile(id: string) { this.f.delete(id) }
  async listFiles() { return [...this.f.values()] }
  async getTemplate(k: TemplateKind) { return this.t.get(k) }
  async putTemplate(x: StoredTemplate) { this.t.set(x.kind, x) }
  async deleteTemplate(k: TemplateKind) { this.t.delete(k) }
  async getSettings() { return this.s }
  async saveSettings(x: Settings) { this.s = x }
  subscribe() { return () => {} }
}

const bigBytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256)

describe.skipIf(!ON)('FirebaseStore (Firebase giả lập)', () => {
  let a: { db: Firestore; uid: string }
  let b: { db: Firestore; uid: string }
  let store: FirebaseStore

  beforeAll(async () => {
    a = await user('nguoi-a')
    b = await user('nguoi-b')
    store = new FirebaseStore(a.db, a.uid)
  }, 30000)

  afterAll(async () => {
    for (const app of apps) await deleteApp(app)
  })

  it('cài đặt: chưa có thì ra mặc định, lưu rồi đọc lại', async () => {
    expect((await store.getSettings()).nguongTien).toBe(5000000)
    await store.saveSettings({ ...DEFAULT_SETTINGS, dsNguoiDeNghi: ['A', 'B', 'C'] })
    expect((await store.getSettings()).dsNguoiDeNghi).toEqual(['A', 'B', 'C'])
  })

  it('hồ sơ: lưu, liệt kê theo mới nhất, đọc, xóa', async () => {
    const d1 = { ...emptyDossier(), noiDung: 'Cũ', updatedAt: 1000, invoices: [{ ...emptyInvoice(), soHd: '1', tongTien: 18836300 }] }
    const d2 = { ...emptyDossier(), noiDung: 'Mới', updatedAt: 2000, thanhPhan: [{ donVi: 'PC Hưng Yên', soNguoi: 8 }] }
    await store.saveDossier(d1)
    await store.saveDossier(d2)
    expect((await store.listDossiers()).map((x) => x.noiDung)).toEqual(['Mới', 'Cũ'])
    expect((await store.getDossier(d1.id))?.invoices[0].tongTien).toBe(18836300)
    await store.deleteDossier(d2.id)
    expect(await store.getDossier(d2.id)).toBeUndefined()
  })

  it('file 1,5 MB: cắt 3 mảnh, đọc lại đúng từng byte, xóa sạch mảnh', async () => {
    const bytes = bigBytes(1_500_000)
    await store.putFile({ id: 'f1', name: 'hoa-don.pdf', type: 'application/pdf', size: bytes.length, addedAt: 1, data: new Blob([bytes]) })
    const meta = await getDoc(doc(a.db, 'users', a.uid, 'files', 'f1'))
    expect(meta.get('chunks')).toBe(3)
    const back = await store.getFile('f1')
    expect(back?.name).toBe('hoa-don.pdf')
    const t0 = Date.now()
    const same = Buffer.from(await back!.data.arrayBuffer()).equals(Buffer.from(bytes))
    expect(same).toBe(true)
    console.log(`  (đọc + so 1,5 MB: ${Date.now() - t0} ms)`)
    await store.deleteFile('f1')
    expect(await store.getFile('f1')).toBeUndefined()
    expect((await getDoc(doc(a.db, 'users', a.uid, 'files', 'f1', 'chunks', '0'))).exists()).toBe(false)
  }, 60000)

  it('mẫu Word: lưu, ghi đè bản nhỏ hơn không sót mảnh cũ', async () => {
    await store.putTemplate({ kind: 'dntt', name: 'to.docx', uploadedAt: 1, data: new Blob([bigBytes(800_000)]) })
    await store.putTemplate({ kind: 'dntt', name: 'nho.docx', uploadedAt: 2, data: new Blob([bigBytes(1000)]) })
    const t = await store.getTemplate('dntt')
    expect(t?.name).toBe('nho.docx')
    expect(t?.data.size).toBe(1000)
    expect((await getDoc(doc(a.db, 'users', a.uid, 'templates', 'dntt', 'chunks', '1'))).exists()).toBe(false)
  })

  it('BẢO MẬT: tài khoản khác không đọc, không ghi được dữ liệu của anh', async () => {
    await expect(getDoc(doc(b.db, 'users', a.uid, 'meta', 'settings'))).rejects.toMatchObject({ code: 'permission-denied' })
    const bStoreTrenDuLieuA = new FirebaseStore(b.db, a.uid)
    await expect(bStoreTrenDuLieuA.saveDossier(emptyDossier())).rejects.toMatchObject({ code: 'permission-denied' })
    // còn dữ liệu của chính b thì b đọc/ghi bình thường
    const bStore = new FirebaseStore(b.db, b.uid)
    await bStore.saveSettings(DEFAULT_SETTINGS)
    expect((await bStore.getSettings()).nguongTien).toBe(5000000)
  })

  it('báo thay đổi: lưu hồ sơ thì màn hình được báo cập nhật', async () => {
    let n = 0
    const unsub = store.subscribe(() => n++)
    await new Promise((r) => setTimeout(r, 300))
    const before = n
    await store.saveDossier({ ...emptyDossier(), noiDung: 'Báo' })
    await new Promise((r) => setTimeout(r, 500))
    unsub()
    expect(n).toBeGreaterThan(before)
  })

  it('đưa dữ liệu từ máy lên tài khoản: đủ hồ sơ, file, mẫu, cài đặt', async () => {
    const may = new MemStore()
    const inv = { ...emptyInvoice(), soHd: '322', tongTien: 19034010, fileIds: ['pdf322'] }
    const hs = { ...emptyDossier(), noiDung: 'Hồ sơ 322', invoices: [inv] }
    await may.saveDossier(hs)
    await may.putFile({ id: 'pdf322', name: '1C26MPD_00000322.pdf', type: 'application/pdf', size: 5, addedAt: 1, data: new Blob([bigBytes(5)]) })
    await may.putTemplate({ kind: 'toTrinh', name: 'mau.docx', uploadedAt: 1, data: new Blob([bigBytes(10)]) })
    await may.saveSettings({ ...DEFAULT_SETTINGS, dsNhiemVu: ['quản lý CBM', 'nhiệm vụ mới'] })

    const c = await user('nguoi-c')
    const cloud = new FirebaseStore(c.db, c.uid)
    const r = await copyAll(may, cloud)
    expect(r).toEqual({ dossiers: 1, files: 1, templates: 1 })
    expect((await cloud.getDossier(hs.id))?.invoices[0].tongTien).toBe(19034010)
    expect((await cloud.getFile('pdf322'))?.name).toBe('1C26MPD_00000322.pdf')
    expect((await cloud.getTemplate('toTrinh'))?.data.size).toBe(10)
    expect((await cloud.getSettings()).dsNhiemVu).toEqual(['quản lý CBM', 'nhiệm vụ mới'])
  }, 30000)
})
