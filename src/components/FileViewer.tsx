import { useEffect, useState } from 'react'
import { downloadBlob } from '../lib/hooks'
import { formatMoney } from '../lib/numberToWords'
import { store, type FileInfo } from '../lib/store'

/** Xem file hóa đơn ngay trong app (PDF, ảnh, XML) — chỉ tải nội dung khi mở. */
export default function FileViewer({ info, onClose }: { info: FileInfo; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let u = ''
    store
      .getFile(info.id)
      .then((f) => {
        if (!f) throw new Error('Không tìm thấy file')
        setBlob(f.data)
        u = URL.createObjectURL(f.data)
        setUrl(u)
      })
      .catch((e) => setErr((e as Error).message))
    return () => {
      if (u) URL.revokeObjectURL(u)
    }
  }, [info.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isImage = info.type.startsWith('image/')

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 md:p-6" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <span className="truncate font-semibold text-slate-800">📎 {info.name}</span>
          <span className="text-xs text-slate-400">{formatMoney(Math.round(info.size / 1024))} KB</span>
          <span className="ml-auto" />
          <button className="btn" disabled={!blob} onClick={() => blob && downloadBlob(blob, info.name)}>
            ⬇ Tải về
          </button>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
        </div>
        <div className="relative flex-1 bg-slate-100">
          {!url && !err && <div className="absolute inset-x-0 top-6 text-center text-sm text-slate-500">Đang tải file…</div>}
          {err && <div className="m-6 rounded bg-red-50 p-3 text-sm text-red-700">Không mở được file: {err}</div>}
          {url && (isImage ? <img src={url} alt={info.name} className="mx-auto max-h-full" /> : <iframe src={url} title={info.name} className="h-full w-full" />)}
        </div>
      </div>
    </div>
  )
}
