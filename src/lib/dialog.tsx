import { useEffect, useState } from 'react'

/**
 * Hộp thoại vẽ ngay trong app — thay cho confirm()/alert() của trình duyệt.
 * Lý do: một số nơi chạy app (khung trình duyệt nhúng, vài bản WebView) tắt hộp thoại gốc,
 * confirm() tự trả về "Hủy" nên bấm nút như không có phản hồi.
 *   if (!(await hoi('Xóa hồ sơ này?'))) return
 *   bao('Đã xong')
 */
interface Req {
  msg: string
  coHuy: boolean
  okLabel: string
  nguyHiem: boolean
  done: (ok: boolean) => void
}

let push: ((r: Req) => void) | null = null
const cho: Req[] = [] // gọi trước khi DialogHost kịp gắn

function enqueue(r: Req) {
  if (push) push(r)
  else cho.push(r)
}

export function hoi(msg: string, opt: { okLabel?: string; nguyHiem?: boolean } = {}): Promise<boolean> {
  return new Promise((done) =>
    enqueue({ msg, coHuy: true, okLabel: opt.okLabel ?? 'Đồng ý', nguyHiem: opt.nguyHiem ?? /xóa|gỡ/i.test(msg), done }),
  )
}

export function bao(msg: string): Promise<void> {
  return new Promise((done) => enqueue({ msg, coHuy: false, okLabel: 'Đóng', nguyHiem: false, done: () => done() }))
}

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([])

  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r])
    if (cho.length) setQueue((q) => [...q, ...cho.splice(0)])
    return () => {
      push = null
    }
  }, [])

  const cur = queue[0]
  useEffect(() => {
    if (!cur) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!cur) return null

  function close(ok: boolean) {
    cur.done(cur.coHuy ? ok : true)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={() => close(false)}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="whitespace-pre-line text-sm text-slate-800">{cur.msg}</p>
        <div className="mt-4 flex justify-end gap-2">
          {cur.coHuy && (
            <button className="btn" onClick={() => close(false)}>
              Hủy
            </button>
          )}
          <button className={cur.nguyHiem ? 'btn-danger !bg-red-600 !text-white' : 'btn-primary'} autoFocus onClick={() => close(true)}>
            {cur.okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
