import { useEffect, useRef, useState } from 'react'
import { fillTemplate } from '../lib/docx'
import { loadTemplate, TEMPLATE_INFO } from '../lib/hooks'
import { warningsOf } from '../lib/status'
import type { BanDoThayThe } from '../lib/thayThe'
import { buildTemplateData } from '../lib/tags'
import type { Dossier, Settings, TemplateKind } from '../lib/types'

interface Props {
  dossier: Dossier // đã gắn ngày gợi ý nếu còn trống (giống lúc xuất)
  settings: Settings
  initial: TemplateKind
  onClose: () => void
  onExport: (kinds: TemplateKind[]) => void
  thayThe?: BanDoThayThe
}

// Tô vàng các chỗ "……" (ô chưa có dữ liệu) để dễ thấy trước khi in
function highlightMissing(root: HTMLElement): number {
  let n = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  while (walker.nextNode()) {
    const t = walker.currentNode as Text
    if (t.data.includes('……')) hits.push(t)
  }
  for (const t of hits) {
    const span = document.createElement('mark')
    span.style.background = '#fde047'
    span.title = 'Ô này chưa có dữ liệu'
    t.parentNode!.replaceChild(span, t)
    span.appendChild(t)
    n++
  }
  return n
}

/** Xem trước tờ trình / ĐNTT đúng như file Word sẽ xuất ra (chia trang A4). */
export default function PreviewModal({ dossier, settings, initial, onClose, onExport, thayThe }: Props) {
  const [kind, setKind] = useState<TemplateKind>(initial)
  const [state, setState] = useState<{ loading: boolean; error?: string; missing: number }>({ loading: true, missing: 0 })
  const box = useRef<HTMLDivElement>(null)
  // chỉ dựng lại khi NỘI DUNG đổi (object mới nhưng y hệt thì bỏ qua)
  const dataKey = JSON.stringify([dossier, settings])

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, missing: 0 })
    ;(async () => {
      try {
        const [{ renderAsync }, tpl] = await Promise.all([import('docx-preview'), loadTemplate(kind)])
        const blob = fillTemplate(tpl.buf, buildTemplateData(dossier, settings))
        if (cancelled || !box.current) return
        box.current.innerHTML = ''
        await renderAsync(blob, box.current, undefined, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
        })
        if (!cancelled) setState({ loading: false, missing: highlightMissing(box.current) })
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: (e as Error).message, missing: 0 })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, dataKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 md:p-6" onClick={onClose}>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2">
          <span className="font-semibold text-slate-800">Xem trước</span>
          {(Object.keys(TEMPLATE_INFO) as TemplateKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${kind === k ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {TEMPLATE_INFO[k].ten}
            </button>
          ))}
          <span className="ml-auto" />
          {!state.loading && !state.error && (
            <span className={`text-xs ${state.missing ? 'text-amber-700' : 'text-emerald-700'}`}>
              {state.missing ? `⚠ ${state.missing} chỗ chưa có dữ liệu (tô vàng)` : '✓ Đủ dữ liệu'}
            </span>
          )}
          <button className="btn-primary" onClick={() => onExport([kind])}>
            ⬇ Xuất file này
          </button>
          <button className="btn" onClick={onClose}>
            Đóng
          </button>
        </div>
        {warningsOf(dossier, settings, thayThe).length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
            {warningsOf(dossier, settings, thayThe).map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        )}
        {/* Văn bản hành chính dùng Times New Roman. Thư viện xem trước bỏ qua kiểu "Normal" của mẫu
            nên những dòng không ghi tên phông bị rơi về Calibri — ép lại cho giống bản in Word. */}
        <style>{`.docx-wrapper section.docx, .docx-wrapper section.docx * { font-family: 'Times New Roman', Times, serif !important; }`}</style>
        <div className="relative flex-1 overflow-auto bg-slate-200">
          {state.loading && <div className="absolute inset-x-0 top-6 text-center text-sm text-slate-500">Đang dựng bản xem trước…</div>}
          {state.error && <div className="m-6 rounded bg-red-50 p-3 text-sm text-red-700">Không dựng được bản xem trước: {state.error}</div>}
          <div ref={box} />
        </div>
        <div className="border-t border-slate-200 px-4 py-1.5 text-[11px] text-slate-500">
          Bản xem trước gần giống Word (phông chữ, ngắt trang có thể lệch đôi chút). Bản in chuẩn là file Word xuất ra.
        </div>
      </div>
    </div>
  )
}
