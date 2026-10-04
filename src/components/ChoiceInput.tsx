import { useId } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  options: string[]
  /** Gõ giá trị mới (chưa có trong danh sách) rồi rời ô -> gọi để lưu vào danh sách */
  onRemember?: (v: string) => void
  placeholder?: string
}

/** Ô chọn từ danh sách đã lưu (bấm nút nhanh), hoặc gõ mới — giá trị mới được nhớ cho lần sau. */
export default function ChoiceInput({ value, onChange, options, onRemember, placeholder }: Props) {
  const listId = useId()
  return (
    <div>
      <input
        className="inp"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const v = value.trim()
          if (v && onRemember && !options.includes(v)) onRemember(v)
        }}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {options.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                o === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:border-blue-400'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
