import type { Dossier, Settings, StoredFile, StoredTemplate, TemplateKind } from '../types.js'

export type FileInfo = Omit<StoredFile, 'data'>

/** Một máy / ứng dụng AI đã được cho phép (máy chủ MCP ở mcp/ tạo khi người dùng bấm "cho phép") */
export interface PhienAI {
  id: string
  tenMay: string
  ungDung: string
  noiNhan: string // localhost = Claude Code trên máy; claude.ai = web / điện thoại
  taoLuc: number
}

export interface DongNhatKyAI {
  id: string
  luc: number
  tenMay: string
  congCu: string
  moTa: string
}

/**
 * "Ổ cắm chuẩn" cho việc cất dữ liệu.
 *
 * Toàn bộ giao diện CHỈ gọi qua interface này, không gọi thẳng Firebase.
 * - Hiện tại: FirebaseStore (Firestore "hoadon" + Storage "hoadon-npsc"), chỉ chạy online.
 * - Kiểm thử: các bài test cắm kho tạm trong bộ nhớ (MemStore) vào cùng ổ này.
 *
 * Quy ước:
 * - Mọi id là chuỗi do app tự sinh (newId), không dựa vào id tự tăng của CSDL.
 * - Dossier chỉ chứa dữ liệu thuần (JSON được) — file gốc tách riêng, tham chiếu bằng fileIds.
 * - Mọi hàm đều async.
 */
export interface DataStore {
  listDossiers(): Promise<Dossier[]>
  getDossier(id: string): Promise<Dossier | undefined>
  saveDossier(d: Dossier): Promise<void>
  deleteDossier(id: string): Promise<void>

  putFile(f: StoredFile): Promise<void>
  getFile(id: string): Promise<StoredFile | undefined>
  /** Chỉ thông tin file (tên, loại, cỡ) — không tải nội dung, dùng để hiện danh sách */
  getFileInfo(id: string): Promise<FileInfo | undefined>
  deleteFile(id: string): Promise<void>
  listFiles(): Promise<StoredFile[]>

  getTemplate(kind: TemplateKind): Promise<StoredTemplate | undefined>
  putTemplate(t: StoredTemplate): Promise<void>
  deleteTemplate(kind: TemplateKind): Promise<void>

  getSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>

  /** AI (Claude Code…) kết nối qua MCP: các máy đang có quyền — xoá = thu hồi ngay */
  listPhienAI(): Promise<PhienAI[]>
  thuHoiPhienAI(id: string): Promise<void>
  /** Các lần AI ghi / xoá gần nhất, mới nhất trước */
  listNhatKyAI(soDong: number): Promise<DongNhatKyAI[]>

  /** Báo khi dữ liệu thay đổi (để màn hình tự cập nhật). Trả về hàm hủy đăng ký. */
  subscribe(cb: () => void): () => void
}

export function newId(): string {
  return crypto.randomUUID()
}
