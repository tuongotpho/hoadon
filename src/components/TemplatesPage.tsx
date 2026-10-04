import { useEffect, useState } from 'react'
import { inspectTemplate, type TemplateCheck } from '../lib/docx'
import { downloadBlob, loadTemplate, TEMPLATE_INFO } from '../lib/hooks'
import { store } from '../lib/store'
import { TAG_GROUPS } from '../lib/tags'
import type { TemplateKind } from '../lib/types'
import FileDrop from './FileDrop'

function TemplateSlot({ kind }: { kind: TemplateKind }) {
  const info = TEMPLATE_INFO[kind]
  const [cur, setCur] = useState<{ name: string; isDefault: boolean; check: TemplateCheck } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function refresh() {
    const t = await loadTemplate(kind)
    setCur({ name: t.name, isDefault: t.isDefault, check: inspectTemplate(t.buf) })
  }
  useEffect(() => {
    refresh()
  }, [])

  async function upload(files: File[]) {
    const f = files[0]
    const check = inspectTemplate(await f.arrayBuffer())
    if (!check.ok) {
      setMsg({ ok: false, text: `Không dùng được mẫu này:\n${check.error}` })
      return
    }
    await store.putTemplate({ kind, name: f.name, data: f, uploadedAt: Date.now() })
    const parts = [`Đã lưu mẫu "${f.name}" — tìm thấy ${check.tags.length} ô.`]
    if (check.tags.length === 0) parts.push('Mẫu chưa có ô {…} nào nên in ra sẽ y nguyên. Xem hướng dẫn bên dưới để thêm ô.')
    if (check.unknown.length) parts.push(`Các ô sau không có trong danh sách (gõ sai tên?): ${check.unknown.join(', ')}`)
    setMsg({ ok: check.unknown.length === 0 && check.tags.length > 0, text: parts.join('\n') })
    refresh()
  }

  async function download() {
    const t = await loadTemplate(kind)
    downloadBlob(new Blob([t.buf]), cur?.isDefault ? `${info.tenFile} - mau mac dinh.docx` : t.name)
  }

  async function reset() {
    if (!confirm('Bỏ mẫu đã up, quay về mẫu Hưng Yên đã gắn ô?')) return
    await store.deleteTemplate(kind)
    setMsg(null)
    refresh()
  }

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold text-slate-800">{info.ten}</h3>
      {cur && (
        <div className="text-sm">
          Đang dùng: <b>{cur.name}</b>
          <div className="text-xs text-slate-500">
            {cur.check.ok ? `${cur.check.tags.length} ô` : 'Mẫu lỗi'}
            {cur.check.unknown.length > 0 && <span className="text-red-600"> · ô lạ: {cur.check.unknown.join(', ')}</span>}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={download}>
          ⬇ Tải mẫu đang dùng về sửa
        </button>
        {cur && !cur.isDefault && (
          <button className="btn" onClick={reset}>
            Về mẫu Hưng Yên
          </button>
        )}
      </div>
      <FileDrop onFiles={upload} accept=".docx" multiple={false}>
        <b className="text-blue-700">Up mẫu Word của anh</b> (.docx)
      </FileDrop>
      {msg && (
        <p className={`whitespace-pre-line rounded p-2 text-xs ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{msg.text}</p>
      )}
    </div>
  )
}

export default function TemplatesPage() {
  const [copied, setCopied] = useState('')

  function copy(tag: string) {
    const t = tag.includes(' ') ? tag.split(' ')[0] : tag
    navigator.clipboard.writeText(`{${t}}`)
    setCopied(t)
    setTimeout(() => setCopied(''), 1200)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <TemplateSlot kind="toTrinh" />
        <TemplateSlot kind="dntt" />
      </div>

      <div className="card space-y-2 text-sm text-slate-700">
        <h3 className="font-semibold text-slate-800">Cách biến mẫu của cơ quan thành mẫu cho app</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Mở file mẫu tờ trình / đề nghị thanh toán của anh bằng Word (phải là <b>.docx</b>; file .doc cũ thì "Lưu thành" .docx trước).</li>
          <li>
            Chỗ nào cần thay đổi theo từng hồ sơ thì xóa chữ cũ, gõ tên ô trong ngoặc nhọn. Ví dụ "Số tiền: 1.234.000 đồng" →{' '}
            <code className="rounded bg-slate-100 px-1">Số tiền: {'{tong_tien}'} đồng</code>. Bấm vào tên ô ở bảng dưới để sao chép.
          </li>
          <li>Định dạng (đậm, nghiêng, cỡ chữ) của ô giữ nguyên khi in — muốn số tiền in đậm thì bôi đậm cả cụm {'{tong_tien}'}.</li>
          <li>Lưu lại, rồi up lên ô phía trên. App sẽ kiểm tra và báo ô nào gõ sai tên.</li>
        </ol>
      </div>

      <div className="card">
        <h3 className="mb-3 font-semibold text-slate-800">Danh sách ô dùng trong mẫu</h3>
        <div className="space-y-4">
          {TAG_GROUPS.map((g) => (
            <div key={g.nhom}>
              <div className="text-sm font-semibold text-slate-700">{g.nhom}</div>
              {g.ghiChu && <p className="mb-1 text-xs text-slate-500">{g.ghiChu}</p>}
              <table className="w-full text-sm">
                <tbody>
                  {g.tags.map((t) => (
                    <tr key={t.tag} className="border-t border-slate-100">
                      <td className="w-72 py-1 pr-3">
                        <button className="font-mono text-xs text-blue-700 hover:underline" onClick={() => copy(t.tag)} title="Bấm để sao chép">
                          {'{'}
                          {t.tag}
                          {'}'}
                        </button>
                        {copied && t.tag.startsWith(copied) && <span className="ml-2 text-xs text-emerald-600">đã chép</span>}
                      </td>
                      <td className="py-1 pr-3 text-slate-700">{t.moTa}</td>
                      <td className="py-1 text-xs text-slate-400">{t.viDu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
