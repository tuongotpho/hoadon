import PizZip from 'pizzip'
import type { DataStore } from './store'
import type { Dossier, Settings, StoredFile, StoredTemplate } from './types'

/**
 * Sao lưu toàn bộ ra 1 file .zip:
 *   data.json            — hồ sơ + cài đặt + danh mục file
 *   files/<id>           — file hóa đơn gốc
 *   templates/<kind>.docx — mẫu Word
 * Định dạng này cũng là cầu nối khi chuyển sang bản online: nạp file zip là xong.
 */

interface BackupMeta {
  version: 1
  exportedAt: string
  settings: Settings
  dossiers: Dossier[]
  files: Omit<StoredFile, 'data'>[]
  templates: Omit<StoredTemplate, 'data'>[]
}

export async function exportBackup(store: DataStore): Promise<Blob> {
  const zip = new PizZip()
  const dossiers = await store.listDossiers()
  const files = await store.listFiles()
  const templates = (await Promise.all([store.getTemplate('toTrinh'), store.getTemplate('dntt')])).filter(
    (t): t is StoredTemplate => !!t,
  )

  for (const f of files) zip.file(`files/${f.id}`, await f.data.arrayBuffer())
  for (const t of templates) zip.file(`templates/${t.kind}.docx`, await t.data.arrayBuffer())

  const meta: BackupMeta = {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: await store.getSettings(),
    dossiers,
    files: files.map(({ data: _d, ...rest }) => rest),
    templates: templates.map(({ data: _d, ...rest }) => rest),
  }
  zip.file('data.json', JSON.stringify(meta, null, 2))
  return zip.generate({ type: 'blob', compression: 'DEFLATE' }) as Blob
}

/** Chép toàn bộ dữ liệu từ chỗ này sang chỗ khác (vd từ máy lên tài khoản Firebase). */
export async function copyAll(from: DataStore, to: DataStore): Promise<RestoreResult> {
  return importBackup(to, await exportBackup(from))
}

export interface RestoreResult {
  dossiers: number
  files: number
  templates: number
}

/** Nạp lại bản sao lưu. Hồ sơ trùng id sẽ bị ghi đè bằng bản trong file sao lưu. */
export async function importBackup(store: DataStore, blob: Blob): Promise<RestoreResult> {
  const zip = new PizZip(await blob.arrayBuffer())
  const metaFile = zip.file('data.json')
  if (!metaFile) throw new Error('File sao lưu không hợp lệ (thiếu data.json)')
  const meta = JSON.parse(metaFile.asText()) as BackupMeta
  if (meta.version !== 1) throw new Error('Phiên bản sao lưu không hỗ trợ')

  let nFiles = 0
  for (const f of meta.files) {
    const entry = zip.file(`files/${f.id}`)
    if (!entry) continue
    await store.putFile({ ...f, data: new Blob([entry.asUint8Array() as Uint8Array<ArrayBuffer>], { type: f.type }) })
    nFiles++
  }
  let nTpl = 0
  for (const t of meta.templates) {
    const entry = zip.file(`templates/${t.kind}.docx`)
    if (!entry) continue
    await store.putTemplate({ ...t, data: new Blob([entry.asUint8Array() as Uint8Array<ArrayBuffer>]) })
    nTpl++
  }
  for (const d of meta.dossiers) await store.saveDossier(d)
  await store.saveSettings(meta.settings)
  return { dossiers: meta.dossiers.length, files: nFiles, templates: nTpl }
}
