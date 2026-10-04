import Docxtemplater from 'docxtemplater'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import PizZip from 'pizzip'
import { knownTopLevelTags, LOOP_INNER_TAGS } from './tags'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export interface TemplateCheck {
  ok: boolean
  error?: string // mẫu hỏng cú pháp (thiếu dấu ngoặc...)
  tags: string[] // các ô tìm thấy
  unknown: string[] // ô không có trong danh sách (gõ sai tên?)
}

function explainError(e: unknown): string {
  const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] }; message?: string }
  const list = err.properties?.errors
  if (list?.length) {
    return list
      .slice(0, 5)
      .map((x) => x.properties?.explanation ?? '')
      .filter(Boolean)
      .join('\n')
  }
  return err.message ?? String(e)
}

/** Kiểm tra mẫu Word: đọc được không, có những ô nào, ô nào gõ sai tên. */
export function inspectTemplate(buf: ArrayBuffer): TemplateCheck {
  let zip: PizZip
  try {
    zip = new PizZip(buf)
  } catch {
    return { ok: false, error: 'File không phải .docx (Word 2007 trở lên). Nếu là .doc cũ, mở bằng Word rồi "Lưu thành" .docx.', tags: [], unknown: [] }
  }
  const iModule = new InspectModule()
  try {
    new Docxtemplater(zip, { modules: [iModule], paragraphLoop: true, linebreaks: true })
  } catch (e) {
    return { ok: false, error: explainError(e), tags: [], unknown: [] }
  }

  const all = iModule.getAllTags() as Record<string, unknown>
  const known = knownTopLevelTags()
  const tags: string[] = []
  const unknown: string[] = []
  for (const [name, inner] of Object.entries(all)) {
    tags.push(name)
    if (!known.has(name)) unknown.push(name)
    const innerKnown = LOOP_INNER_TAGS[name]
    if (innerKnown && inner && typeof inner === 'object') {
      for (const sub of Object.keys(inner)) {
        tags.push(`${name}.${sub}`)
        if (!innerKnown.includes(sub)) unknown.push(`${sub} (trong ${name})`)
      }
    }
  }
  return { ok: true, tags, unknown }
}

/** Điền dữ liệu vào mẫu, trả về file .docx mới. */
export function fillTemplate(buf: ArrayBuffer, data: Record<string, unknown>): Blob {
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // ô không có dữ liệu thì để chấm chấm cho dễ thấy, điền tay khi in
    nullGetter: () => '……',
  })
  try {
    doc.render(data)
  } catch (e) {
    throw new Error(explainError(e))
  }
  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' }) as Blob
}
