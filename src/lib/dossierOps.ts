import { parseInvoiceXml } from './invoiceXml'
import { moTaHangCam, timHangCam } from './hangCam'
import { parseInvoiceText } from './invoicePdf'
import { emptyDossier, emptyInvoice } from './model'
import { newId, store } from './store'
import type { Invoice, StoredFile } from './types'

/** HỘ KINH DOANH NGUYỄN VĂN A -> HO KINH DOANH NGUYEN VAN A (kiểu tên tài khoản ngân hàng) */
export function toAccountName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tên tài khoản: ưu tiên tên anh đã sửa tay lần trước cho cùng mã số thuế. */
async function guessAccountName(inv: Invoice): Promise<string> {
  if (inv.mstNguoiBan) {
    for (const d of await store.listDossiers()) {
      const hit = d.invoices.find((i) => i.mstNguoiBan === inv.mstNguoiBan && i.tenTaiKhoan)
      if (hit) return hit.tenTaiKhoan
    }
  }
  return toAccountName(inv.tenNguoiBan)
}

export async function saveUpload(file: File): Promise<StoredFile> {
  const f: StoredFile = { id: newId(), name: file.name, type: file.type, size: file.size, data: file, addedAt: Date.now() }
  await store.putFile(f)
  return f
}

const isXml = (f: File) => /\.xml$/i.test(f.name) || f.type.includes('xml')
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'

/** Đọc PDF hóa đơn điện tử. Trả về null nếu không dò ra gì (vd PDF scan). */
export async function readPdfInvoice(f: File) {
  const { pdfToLines } = await import('./pdfText') // thư viện PDF nặng, chỉ tải khi cần
  const parsed = parseInvoiceText(await pdfToLines(await f.arrayBuffer()))
  if (parsed.found < 3) return null
  const { found: _f, ...rest } = parsed
  return rest
}

/** Chỉ điền vào các ô đang trống, không đè chữ anh đã sửa. */
export function fillEmpty(inv: Invoice, src: Partial<Invoice>): Invoice {
  const out = { ...inv } as Record<string, unknown>
  for (const [k, v] of Object.entries(src)) {
    const cur = out[k]
    if (cur === '' || cur === 0 || (Array.isArray(cur) && cur.length === 0)) out[k] = v
  }
  return out as unknown as Invoice
}

/**
 * Biến 1 lần up nhiều file thành các hóa đơn:
 * - Mỗi file XML -> 1 hóa đơn (tự điền). PDF/ảnh trùng tên gốc với XML được gắn vào hóa đơn đó.
 * - PDF lẻ -> 1 hóa đơn, tự dò thông tin từ chữ trong PDF (cần kiểm tra lại).
 * - Ảnh lẻ -> 1 hóa đơn trống để nhập tay.
 */
export async function filesToInvoices(files: File[]): Promise<{ invoices: Invoice[]; errors: string[]; notes: string[] }> {
  const errors: string[] = []
  const notes: string[] = []
  const invoices: Invoice[] = []
  const byBase = new Map<string, Invoice>()
  const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase()

  for (const f of files.filter(isXml)) {
    let inv = emptyInvoice()
    try {
      inv = { ...inv, ...parseInvoiceXml(await f.text()) }
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`)
    }
    inv.fileIds.push((await saveUpload(f)).id)
    invoices.push(inv)
    byBase.set(base(f.name), inv)
  }
  for (const f of files.filter((x) => !isXml(x))) {
    const stored = await saveUpload(f)
    const match = byBase.get(base(f.name))
    if (match) {
      match.fileIds.push(stored.id)
      continue
    }
    let inv = emptyInvoice()
    inv.fileIds.push(stored.id)
    if (isPdf(f)) {
      try {
        const p = await readPdfInvoice(f)
        if (p) {
          inv = fillEmpty(inv, p)
          notes.push(`${f.name}: đã tự đọc từ PDF — anh soát lại số tiền và mã số thuế.`)
        } else {
          errors.push(`${f.name}: PDF không có chữ đọc được (có thể là bản scan)`)
        }
      } catch (e) {
        errors.push(`${f.name}: không đọc được PDF (${(e as Error).message})`)
      }
    }
    invoices.push(inv)
  }
  for (const inv of invoices) {
    if (!inv.tenTaiKhoan && inv.tenNguoiBan) inv.tenTaiKhoan = await guessAccountName(inv)
  }
  const cam = timHangCam(invoices, (await store.getSettings()).tuKhoaCam)
  if (cam.length) notes.unshift(`⛔ HÓA ĐƠN CÓ RƯỢU/BIA — quy định không được thanh toán:
${moTaHangCam(cam)}
`)
  return { invoices, errors, notes }
}

export { emptyDossier, emptyInvoice, normalizeDossier } from './model'

/** Dọn file không thuộc hồ sơ nào (vd up dở rồi tắt trình duyệt). Chỉ xóa file cũ hơn 1 giờ để không đụng file đang up. */
export async function cleanOrphanFiles(): Promise<number> {
  const used = new Set((await store.listDossiers()).flatMap((d) => d.invoices.flatMap((i) => i.fileIds)))
  const old = Date.now() - 3600_000
  const orphans = (await store.listFiles()).filter((f) => !used.has(f.id) && f.addedAt < old)
  for (const f of orphans) await store.deleteFile(f.id)
  return orphans.length
}

// ───────────── Nhập hàng loạt hóa đơn cũ ─────────────

export interface KetQuaNhap {
  tenFile: string // các file của hóa đơn này (XML + PDF cùng tên gộp làm một)
  dossierId?: string // hồ sơ đã tạo (không có nếu trùng / lỗi)
  soHd: string
  kyHieu: string
  ngayHd: string
  nguoiBan: string
  tongTien: number
  trung?: boolean // đã có trong kho
  loi?: string
  ghiChu?: string // cảnh báo rượu/bia, đọc PDF…
}

/** Khóa nhận diện 1 hóa đơn: ký hiệu + số + MST người bán (thiếu thì không dò trùng được). */
export function khoaHoaDon(i: Pick<Invoice, 'kyHieu' | 'soHd' | 'mstNguoiBan'>): string {
  if (!i.soHd || (!i.kyHieu && !i.mstNguoiBan)) return ''
  return [i.kyHieu.trim().toUpperCase(), String(Number(i.soHd) || i.soHd.trim()), i.mstNguoiBan.trim()].join('|')
}

/**
 * Nhập nhiều hóa đơn cũ: mỗi hóa đơn -> 1 hồ sơ "hoSoCu" (chỉ cần tiền + đã/chưa thanh toán).
 * File XML và PDF trùng tên gốc được gộp vào cùng một hóa đơn. Hóa đơn đã có trong kho thì bỏ qua.
 */
export async function nhapHoaDonCu(files: File[], onTienDo?: (xong: number, tong: number) => void): Promise<KetQuaNhap[]> {
  const base = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase()
  const nhom = new Map<string, File[]>()
  for (const f of files) nhom.set(base(f.name), [...(nhom.get(base(f.name)) ?? []), f])

  const daCo = new Set((await store.listDossiers()).flatMap((d) => d.invoices.map(khoaHoaDon)).filter(Boolean))
  const out: KetQuaNhap[] = []
  let xong = 0
  for (const g of nhom.values()) {
    const tenFile = g.map((f) => f.name).join(' + ')
    try {
      const { invoices, errors, notes } = await filesToInvoices(g)
      for (const inv of invoices) {
        const kq: KetQuaNhap = {
          tenFile, soHd: inv.soHd, kyHieu: inv.kyHieu, ngayHd: inv.ngayHd, nguoiBan: inv.tenNguoiBan, tongTien: inv.tongTien,
          loi: errors.join('; ') || undefined,
          ghiChu: notes.filter((n) => n.includes('RƯỢU')).map(() => 'Có rượu/bia').join('') || undefined,
        }
        const k = khoaHoaDon(inv)
        if (k && daCo.has(k)) {
          kq.trung = true
          for (const fid of inv.fileIds) await store.deleteFile(fid) // không giữ file của bản trùng
        } else {
          const d = { ...emptyDossier(), hoSoCu: true, invoices: [inv] }
          await store.saveDossier(d)
          kq.dossierId = d.id
          if (k) daCo.add(k)
        }
        out.push(kq)
      }
    } catch (e) {
      out.push({ tenFile, soHd: '', kyHieu: '', ngayHd: '', nguoiBan: '', tongTien: 0, loi: (e as Error).message })
    }
    onTienDo?.(++xong, nhom.size)
  }
  return out
}
