import { useMemo, useState } from 'react'
import { chuanTag, goiYTag, TAG_MAC_DINH, tatCaTag } from '../lib/hashtag'

/** Hiện các hashtag của hồ sơ dạng nhãn nhỏ: #KHCN #CBM */
export function TagChips({ tags, className = '' }: { tags?: string[]; className?: string }) {
  if (!tags?.length) return null
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {tags.map((t) => (
        <span key={t} title={TAG_MAC_DINH.find((x) => x.ma === t)?.ten} className="rounded bg-indigo-50 px-1.5 py-px text-[11px] font-medium text-indigo-700">
          #{t}
        </span>
      ))}
    </span>
  )
}

/**
 * Sửa hashtag của 1 hồ sơ: bấm tag để bỏ, chọn từ danh sách / gõ tag mới.
 * Gợi ý tự động từ nội dung công việc (cùng quy tắc đã dùng để gắn tag cho hồ sơ cũ).
 */
export function TagEditor({ value, onChange, noiDung, dangDung }: { value: string[]; onChange: (v: string[]) => void; noiDung: string; dangDung: string[][] }) {
  const [moi, setMoi] = useState('')
  const ds = useMemo(() => tatCaTag(dangDung), [dangDung])
  const goiY = goiYTag(noiDung).filter((t) => !value.includes(t))
  const them = (t: string) => {
    const m = chuanTag(t)
    if (m && !value.includes(m)) onChange([...value, m])
    setMoi('')
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <button key={t} type="button" title="Bấm để bỏ tag" onClick={() => onChange(value.filter((x) => x !== t))}
            className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 hover:bg-red-100 hover:text-red-700">
            #{t} ✕
          </button>
        ))}
        <input className="inp w-40 py-0.5 text-xs" list="ds-hashtag" placeholder="+ thêm tag…" value={moi}
          onChange={(e) => setMoi(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); them(moi) } }}
          onBlur={() => moi.trim() && them(moi)} />
        <datalist id="ds-hashtag">
          {ds.filter((t) => !value.includes(t.ma)).map((t) => <option key={t.ma} value={t.ma}>{t.ten}</option>)}
        </datalist>
      </div>
      {goiY.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Gợi ý theo nội dung:{' '}
          {goiY.map((t) => (
            <button key={t} type="button" className="mr-1 rounded-full border border-dashed border-indigo-300 px-2 py-px text-indigo-700 hover:bg-indigo-50" onClick={() => them(t)}>
              + #{t}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}
