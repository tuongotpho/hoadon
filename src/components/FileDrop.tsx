import { useRef, useState, type ReactNode } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  children: ReactNode
  className?: string
}

/** Vùng kéo-thả file, bấm vào cũng mở hộp chọn file. */
export default function FileDrop({ onFiles, accept, multiple = true, children, className = '' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = [...e.dataTransfer.files]
        if (files.length) onFiles(files)
      }}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-sm transition ${
        over ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400'
      } ${className}`}
    >
      {children}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
    </div>
  )
}
