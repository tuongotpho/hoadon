import Dexie, { type Table } from 'dexie'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type StoredFile, type StoredTemplate, type TemplateKind } from '../types'
import { normalizeDossier } from '../model'
import type { DataStore } from './DataStore'

class HoaDonDB extends Dexie {
  dossiers!: Table<Dossier, string>
  files!: Table<StoredFile, string>
  templates!: Table<StoredTemplate, TemplateKind>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('quan-ly-hoa-don')
    this.version(1).stores({
      dossiers: 'id, updatedAt',
      files: 'id',
      templates: 'kind',
      kv: 'key',
    })
  }
}

/** Bản cất dữ liệu offline: IndexedDB trong trình duyệt của máy này. */
export class LocalStore implements DataStore {
  private db = new HoaDonDB()
  private listeners = new Set<() => void>()

  private emit() {
    this.listeners.forEach((cb) => cb())
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  async listDossiers() {
    return (await this.db.dossiers.orderBy('updatedAt').reverse().toArray()).map(normalizeDossier)
  }
  async getDossier(id: string) {
    const d = await this.db.dossiers.get(id)
    return d && normalizeDossier(d)
  }
  async saveDossier(d: Dossier) {
    await this.db.dossiers.put(d)
    this.emit()
  }
  async deleteDossier(id: string) {
    const d = await this.db.dossiers.get(id)
    const fileIds = d?.invoices.flatMap((i) => i.fileIds) ?? []
    await this.db.transaction('rw', this.db.dossiers, this.db.files, async () => {
      await this.db.files.bulkDelete(fileIds)
      await this.db.dossiers.delete(id)
    })
    this.emit()
  }

  async putFile(f: StoredFile) {
    await this.db.files.put(f)
  }
  async getFile(id: string) {
    return this.db.files.get(id)
  }
  async deleteFile(id: string) {
    await this.db.files.delete(id)
  }
  async listFiles() {
    return this.db.files.toArray()
  }

  async getTemplate(kind: TemplateKind) {
    return this.db.templates.get(kind)
  }
  async putTemplate(t: StoredTemplate) {
    await this.db.templates.put(t)
    this.emit()
  }
  async deleteTemplate(kind: TemplateKind) {
    await this.db.templates.delete(kind)
    this.emit()
  }

  async getSettings(): Promise<Settings> {
    const row = await this.db.kv.get('settings')
    return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
  }
  async saveSettings(s: Settings) {
    await this.db.kv.put({ key: 'settings', value: s })
    this.emit()
  }
}
