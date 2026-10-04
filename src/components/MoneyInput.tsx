import { useEffect, useState } from 'react'
import { formatMoney } from '../lib/numberToWords'

/** Ô nhập tiền: hiển thị 1.234.000, lưu số 1234000. */
export default function MoneyInput({ value, onChange, className = '' }: { value: number; onChange: (n: number) => void; className?: string }) {
  const [text, setText] = useState(value ? formatMoney(value) : '')
  const [focus, setFocus] = useState(false)

  useEffect(() => {
    if (!focus) setText(value ? formatMoney(value) : '')
  }, [value, focus])

  return (
    <input
      className={`inp text-right ${className}`}
      inputMode="numeric"
      value={text}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '')
        const n = digits ? Number(digits) : 0
        setText(digits ? formatMoney(n) : '')
        onChange(n)
      }}
    />
  )
}
