// Đọc / ghi hồ sơ trên mây cho máy chủ MCP — CÙNG đường dẫn, CÙNG tên ô với web app (src/lib/store/FirebaseStore.ts),
// nên thứ AI ghi thì web app thấy ngay và ngược lại. Test liên thông: tests/mcp-firebase.test.ts.
//
//   users/{uid}/dossiers/{id}     hồ sơ
//   users/{uid}/files/{id}        thông tin file; nội dung ở Storage hoadon-npsc: users/{uid}/files/{id}
//   users/{uid}/meta/settings     cài đặt
// Thêm 2 nhánh riêng cho AI (vẫn nằm trong users/{uid}, luật phân quyền cũ đã bao):
//   users/{uid}/phienAI/{maPhien}   mỗi máy / ứng dụng AI đã được cho phép — xoá = thu hồi
//   users/{uid}/nhatKyAI/{ma}       mỗi lần AI ghi / xoá: lúc nào, máy nào, làm gì

import { randomUUID } from 'node:crypto'
import { normalizeDossier } from '../src/lib/model.js'
import { DEFAULT_SETTINGS, type Dossier, type Settings } from '../src/lib/types.js'
import type { DuLieu } from './congCu.js'
import type { FirebaseNguoiDung } from './firebaseRest.js'

const goc = (fb: FirebaseNguoiDung) => `users/${fb.uid}`

export async function taiDuLieu(fb: FirebaseNguoiDung): Promise<DuLieu> {
  const [hoSo, caiDat, tep] = await Promise.all([
    fb.docBoSuuTap<Dossier>(`${goc(fb)}/dossiers`),
    fb.docTaiLieu<Partial<Settings>>(`${goc(fb)}/meta/settings`),
    fb.docBoSuuTap<{ name: string }>(`${goc(fb)}/files`),
  ])
  return {
    hoSo: hoSo.map(({ _id, ...d }) => normalizeDossier({ ...(d as Dossier), id: d.id || _id })),
    caiDat: { ...DEFAULT_SETTINGS, ...(caiDat ?? {}) },
    tenFile: new Map(tep.map((f) => [f._id, f.name])),
  }
}

export async function luuHoSo(fb: FirebaseNguoiDung, d: Dossier) {
  await fb.ghi(`${goc(fb)}/dossiers/${d.id}`, d as unknown as Record<string, unknown>)
}

/** Cất 1 file gốc: nội dung lên Storage trước, thông tin vào Firestore sau (như web app) */
export async function luuFile(fb: FirebaseNguoiDung, f: { id: string; name: string; type: string; data: Uint8Array }) {
  const path = `${goc(fb)}/files/${f.id}`
  await fb.taiLenTep(path, f.data, f.type || 'application/octet-stream')
  await fb.ghi(`${goc(fb)}/files/${f.id}`, { id: f.id, name: f.name, type: f.type, size: f.data.byteLength, addedAt: Date.now(), path })
}

export async function xoaFile(fb: FirebaseNguoiDung, id: string) {
  const m = await fb.docTaiLieu<{ path?: string; chunks?: number }>(`${goc(fb)}/files/${id}`)
  if (m?.path) await fb.xoaTep(m.path)
  if (m?.chunks) {
    // file cũ cất kiểu cắt mảnh trong Firestore
    for (const c of await fb.docBoSuuTap(`${goc(fb)}/files/${id}/chunks`)) await fb.xoa(`${goc(fb)}/files/${id}/chunks/${c._id}`)
  }
  await fb.xoa(`${goc(fb)}/files/${id}`)
}

/** Xoá hồ sơ + mọi file gốc của nó (như web app) */
export async function xoaHoSo(fb: FirebaseNguoiDung, d: Dossier) {
  for (const fid of d.invoices.flatMap((i) => i.fileIds)) await xoaFile(fb, fid)
  await fb.xoa(`${goc(fb)}/dossiers/${d.id}`)
}

// ---------------- Phiên AI + nhật ký ----------------

export interface PhienAI {
  tenMay: string
  ungDung: string
  noiNhan: string // máy chủ nhận mã (localhost = Claude Code trên máy; claude.ai ...)
  taoLuc: string
}

export async function taoPhien(fb: FirebaseNguoiDung, p: Omit<PhienAI, 'taoLuc'>): Promise<string> {
  const ma = randomUUID()
  await fb.ghi(`${goc(fb)}/phienAI/${ma}`, { ...p, taoLuc: new Date() })
  return ma
}

export async function conPhien(fb: FirebaseNguoiDung, ma: string): Promise<PhienAI | null> {
  return fb.docTaiLieu<PhienAI>(`${goc(fb)}/phienAI/${ma}`)
}

export async function ghiNhatKy(fb: FirebaseNguoiDung, maPhien: string, tenMay: string, congCu: string, moTa: string) {
  // mã theo thời gian để xếp được; thêm đuôi ngẫu nhiên để không trùng
  const ma = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  await fb.ghi(`${goc(fb)}/nhatKyAI/${ma}`, { luc: new Date(), maPhien, tenMay, congCu, moTa })
}
