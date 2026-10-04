import {
  Bytes, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, writeBatch,
  type Firestore, type Unsubscribe,
} from 'firebase/firestore'
import { normalizeDossier } from '../model'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile, type StoredTemplate, type TemplateKind } from '../types'
import type { DataStore } from './DataStore'

/**
 * Bản cất dữ liệu online: Firestore, database "hoadon" (dự án app-from-ai).
 *
 * Mọi thứ nằm dưới users/{uid}/… — quy tắc bảo mật chỉ cho chủ tài khoản đọc/ghi.
 *   users/{uid}/dossiers/{id}            hồ sơ
 *   users/{uid}/files/{id}               thông tin file (+ chunks/{i}: nội dung, mỗi mảnh ≤ 700 KB)
 *   users/{uid}/templates/{kind}         mẫu Word (+ chunks/{i})
 *   users/{uid}/meta/settings            cài đặt
 * File cất ngay trong Firestore (cắt mảnh vì mỗi bản ghi tối đa 1 MB) — không dùng Firebase Storage
 * vì kho Storage dùng chung cả dự án với app khác.
 */
const CHUNK = 700 * 1024

export class FirebaseStore implements DataStore {
  private listeners = new Set<() => void>()
  private unsubs: Unsubscribe[] = []
  private db: Firestore
  private uid: string

  constructor(db: Firestore, uid: string) {
    this.db = db
    this.uid = uid
  }

  private col(name: string) {
    return collection(this.db, 'users', this.uid, name)
  }
  private ref(name: string, id: string) {
    return doc(this.db, 'users', this.uid, name, id)
  }

  // ── Mảnh nhị phân: cất/đọc/xóa nội dung file theo từng mảnh ──
  private async putChunks(parent: string, id: string, data: Blob, meta: Record<string, unknown>) {
    const bytes = new Uint8Array(await data.arrayBuffer())
    const n = Math.max(1, Math.ceil(bytes.length / CHUNK))
    await this.deleteChunks(parent, id) // bỏ mảnh cũ nếu ghi đè
    for (let i = 0; i < n; i += 4) {
      const batch = writeBatch(this.db) // mỗi lô ≤ 4 mảnh để không vượt giới hạn 10 MB/lô
      for (let j = i; j < Math.min(n, i + 4); j++) {
        batch.set(doc(this.db, 'users', this.uid, parent, id, 'chunks', String(j)), {
          i: j,
          data: Bytes.fromUint8Array(bytes.subarray(j * CHUNK, (j + 1) * CHUNK)),
        })
      }
      await batch.commit()
    }
    await setDoc(this.ref(parent, id), { ...meta, chunks: n })
  }

  private async readChunks(parent: string, id: string, n: number, type: string): Promise<Blob> {
    const parts: BlobPart[] = []
    for (let j = 0; j < n; j++) {
      const s = await getDoc(doc(this.db, 'users', this.uid, parent, id, 'chunks', String(j)))
      parts.push((s.get('data') as Bytes).toUint8Array() as Uint8Array<ArrayBuffer>)
    }
    return new Blob(parts, { type })
  }

  private async deleteChunks(parent: string, id: string) {
    const snap = await getDocs(collection(this.db, 'users', this.uid, parent, id, 'chunks'))
    if (snap.empty) return
    const batch = writeBatch(this.db)
    snap.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  // ── Báo thay đổi: nghe trực tiếp Firestore (máy khác sửa thì máy này tự cập nhật) ──
  private emit = () => this.listeners.forEach((cb) => cb())

  subscribe(cb: () => void) {
    if (this.listeners.size === 0) {
      this.unsubs = [
        onSnapshot(this.col('dossiers'), this.emit, () => {}),
        onSnapshot(this.ref('meta', 'settings'), this.emit, () => {}),
        onSnapshot(this.col('templates'), this.emit, () => {}),
      ]
    }
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
      if (this.listeners.size === 0) {
        this.unsubs.forEach((u) => u())
        this.unsubs = []
      }
    }
  }

  // ── Hồ sơ ──
  async listDossiers() {
    const snap = await getDocs(query(this.col('dossiers'), orderBy('updatedAt', 'desc')))
    return snap.docs.map((d) => normalizeDossier(d.data() as Dossier))
  }
  async getDossier(id: string) {
    const s = await getDoc(this.ref('dossiers', id))
    return s.exists() ? normalizeDossier(s.data() as Dossier) : undefined
  }
  async saveDossier(d: Dossier) {
    await setDoc(this.ref('dossiers', d.id), d)
  }
  async deleteDossier(id: string) {
    const d = await this.getDossier(id)
    for (const fid of d?.invoices.flatMap((i) => i.fileIds) ?? []) await this.deleteFile(fid)
    await deleteDoc(this.ref('dossiers', id))
  }

  // ── File hóa đơn ──
  async putFile(f: StoredFile) {
    await this.putChunks('files', f.id, f.data, { id: f.id, name: f.name, type: f.type, size: f.size, addedAt: f.addedAt })
  }
  async getFile(id: string) {
    const s = await getDoc(this.ref('files', id))
    if (!s.exists()) return undefined
    const m = s.data() as Omit<StoredFile, 'data'> & { chunks: number }
    return { id: m.id, name: m.name, type: m.type, size: m.size, addedAt: m.addedAt, data: await this.readChunks('files', id, m.chunks, m.type) }
  }
  async deleteFile(id: string) {
    await this.deleteChunks('files', id)
    await deleteDoc(this.ref('files', id))
  }
  async listFiles() {
    const snap = await getDocs(this.col('files'))
    const out: StoredFile[] = []
    for (const d of snap.docs) {
      const f = await this.getFile(d.id)
      if (f) out.push(f)
    }
    return out
  }

  // ── Mẫu Word ──
  async getTemplate(kind: TemplateKind) {
    const s = await getDoc(this.ref('templates', kind))
    if (!s.exists()) return undefined
    const m = s.data() as { name: string; uploadedAt: number; chunks: number }
    return { kind, name: m.name, uploadedAt: m.uploadedAt, data: await this.readChunks('templates', kind, m.chunks, '') }
  }
  async putTemplate(t: StoredTemplate) {
    await this.putChunks('templates', t.kind, t.data, { kind: t.kind, name: t.name, uploadedAt: t.uploadedAt })
  }
  async deleteTemplate(kind: TemplateKind) {
    await this.deleteChunks('templates', kind)
    await deleteDoc(this.ref('templates', kind))
  }

  // ── Cài đặt ──
  async getSettings(): Promise<Settings> {
    const s = await getDoc(this.ref('meta', 'settings'))
    return { ...DEFAULT_SETTINGS, ...((s.data() as Partial<Settings>) ?? {}) }
  }
  async saveSettings(s: Settings) {
    await setDoc(this.ref('meta', 'settings'), s)
  }
}
