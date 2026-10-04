import { useEffect, useState } from 'react'
import { store } from './store'
import { DEFAULT_SETTINGS, type Dossier, type Settings, type TemplateKind } from './types'

export function useDossiers(): Dossier[] | null {
  const [list, setList] = useState<Dossier[] | null>(null)
  useEffect(() => {
    const load = () => store.listDossiers().then(setList)
    load()
    return store.subscribe(load)
  }, [])
  return list
}

export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    const load = () => store.getSettings().then(setS)
    load()
    return store.subscribe(load)
  }, [])
  return s
}

/** Thêm 1 lựa chọn mới vào danh sách đã lưu trong Cài đặt (người đề nghị, nhiệm vụ). */
export async function rememberOption(key: 'dsNguoiDeNghi' | 'dsNhiemVu', v: string) {
  const s = await store.getSettings()
  if (s[key].includes(v)) return
  await store.saveSettings({ ...s, [key]: [...s[key], v] })
}

export const TEMPLATE_INFO: Record<TemplateKind, { ten: string; macDinh: string; tenFile: string }> = {
  toTrinh: { ten: 'Tờ trình xin chủ trương', macDinh: 'mau/to-trinh.docx', tenFile: 'To trinh' },
  dntt: { ten: 'Giấy đề nghị thanh toán', macDinh: 'mau/de-nghi-thanh-toan.docx', tenFile: 'De nghi thanh toan' },
}

/** Lấy mẫu đang dùng: mẫu anh đã up, nếu chưa up thì dùng mẫu mặc định. */
export async function loadTemplate(kind: TemplateKind): Promise<{ buf: ArrayBuffer; name: string; isDefault: boolean }> {
  const t = await store.getTemplate(kind)
  if (t) return { buf: await t.data.arrayBuffer(), name: t.name, isDefault: false }
  const res = await fetch(import.meta.env.BASE_URL + TEMPLATE_INFO[kind].macDinh)
  if (!res.ok) throw new Error('Không tải được mẫu mặc định')
  return { buf: await res.arrayBuffer(), name: 'Mẫu Hưng Yên của anh (đã gắn ô sẵn)', isDefault: true }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Bỏ dấu + ký tự lạ để làm tên file an toàn trên Windows. */
export function safeFileName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}
