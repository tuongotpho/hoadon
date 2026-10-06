// Nói chuyện với Firebase qua REST, bằng QUYỀN CỦA CHÍNH NGƯỜI DÙNG (mã đăng nhập Google của họ).
// Máy chủ không có chìa khoá tổng (service account): firestore.rules / storage.rules vẫn canh cửa y như
// khi người dùng mở web app — chỉ đọc/ghi được users/{uid của chính họ}.
//
// Dùng REST thay vì thư viện firebase (bản trình duyệt) vì máy chủ chỉ có "mã làm mới" (refresh token)
// của người dùng, thư viện không cho đăng nhập bằng mã đó.

/** Thông số công khai của web app (giống src/lib/firebase.ts) */
const API_KEY = 'AIzaSyCfCX-xKHVnvv2tEb_AVdxL_xvqnnSjgcQ'
const DATABASE = 'hoadon'
const BUCKET = 'hoadon-npsc'

export interface CauHinhFirebase {
  apiKey: string
  projectId: string
  auth: string // gốc securetoken
  firestore: string
  storage: string
  /** Gửi kèm làm Referer: khoá web có thể bị giới hạn theo tên miền */
  referer?: string
}

export function cauHinhFirebase(env: Record<string, string | undefined> = process.env, referer?: string): CauHinhFirebase {
  if (env.HOADON_GIA_LAP === '1') {
    // Máy giả lập (npm run test:firebase) — không đụng dữ liệu thật
    return {
      apiKey: API_KEY, projectId: 'demo-hoadon', auth: `http://${env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}/securetoken.googleapis.com`,
      firestore: `http://${env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}`, storage: `http://${env.FIREBASE_STORAGE_EMULATOR_HOST ?? '127.0.0.1:9199'}`, referer,
    }
  }
  return { apiKey: API_KEY, projectId: 'app-from-ai', auth: 'https://securetoken.googleapis.com', firestore: 'https://firestore.googleapis.com', storage: 'https://firebasestorage.googleapis.com', referer }
}

export class LoiFirebase extends Error {
  trangThai: number
  constructor(trangThai: number, thongDiep: string) {
    super(thongDiep)
    this.trangThai = trangThai
  }
}

async function goi(url: string, init: RequestInit, cfg: CauHinhFirebase): Promise<Response> {
  const headers = new Headers(init.headers)
  if (cfg.referer) headers.set('Referer', cfg.referer)
  const r = await fetch(url, { ...init, headers })
  if (!r.ok && r.status !== 404) {
    const chu = await r.text().catch(() => '')
    throw new LoiFirebase(r.status, `Firebase từ chối (${r.status}): ${chu.slice(0, 300)}`)
  }
  return r
}

/** Đổi mã làm mới lấy mã truy cập (sống 1 giờ) + uid. Mã làm mới sai/bị thu hồi -> lỗi 400. */
export async function doiMa(cfg: CauHinhFirebase, maLamMoi: string): Promise<{ idToken: string; uid: string; hetHan: number }> {
  const r = await goi(`${cfg.auth}/v1/token?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: maLamMoi }),
  }, cfg)
  if (!r.ok) throw new LoiFirebase(r.status, 'Không đổi được mã đăng nhập')
  const j = (await r.json()) as { id_token: string; user_id: string; expires_in: string }
  return { idToken: j.id_token, uid: j.user_id, hetHan: Date.now() + (Number(j.expires_in) - 60) * 1000 }
}

// ---------------- Firestore: đổi qua lại giữa giá trị JS và dạng REST ----------------

type GiaTriRest = Record<string, unknown>

export function maHoa(v: unknown): GiaTriRest {
  if (v === null) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.filter((x) => x !== undefined).map(maHoa) } : {} }
  if (typeof v === 'object') return { mapValue: { fields: maHoaTruong(v as Record<string, unknown>) } }
  throw new Error(`Không lưu được kiểu ${typeof v}`)
}

/** Bỏ ô undefined */
export function maHoaTruong(o: Record<string, unknown>): Record<string, GiaTriRest> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, maHoa(v)]))
}

export function giaiMa(v: GiaTriRest): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) return ((v.arrayValue as { values?: GiaTriRest[] }).values ?? []).map(giaiMa)
  if ('mapValue' in v) return giaiMaTruong((v.mapValue as { fields?: Record<string, GiaTriRest> }).fields ?? {})
  if ('referenceValue' in v) return v.referenceValue
  if ('bytesValue' in v) return v.bytesValue
  if ('geoPointValue' in v) return v.geoPointValue
  return null
}

export function giaiMaTruong(f: Record<string, GiaTriRest>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, giaiMa(v)]))
}

/** Phiên làm việc với Firebase của MỘT người dùng (đã có mã truy cập) */
export class FirebaseNguoiDung {
  cfg: CauHinhFirebase
  uid: string
  private idToken: string
  constructor(cfg: CauHinhFirebase, uid: string, idToken: string) {
    this.cfg = cfg
    this.uid = uid
    this.idToken = idToken
  }

  private get goc() {
    return `${this.cfg.firestore}/v1/projects/${this.cfg.projectId}/databases/${DATABASE}/documents`
  }
  private get xacThuc() {
    return { Authorization: `Bearer ${this.idToken}` }
  }
  private duongDan(p: string) {
    return p.split('/').map(encodeURIComponent).join('/')
  }

  async docTaiLieu<T = Record<string, unknown>>(p: string): Promise<T | null> {
    const r = await goi(`${this.goc}/${this.duongDan(p)}`, { headers: this.xacThuc }, this.cfg)
    if (r.status === 404) return null
    const j = (await r.json()) as { fields?: Record<string, GiaTriRest> }
    return giaiMaTruong(j.fields ?? {}) as T
  }

  /** Mọi tài liệu trong một bộ sưu tập: [{ id, ...dữ liệu }] */
  async docBoSuuTap<T = Record<string, unknown>>(p: string): Promise<(T & { _id: string })[]> {
    const kq: (T & { _id: string })[] = []
    let trang = ''
    do {
      const r = await goi(`${this.goc}/${this.duongDan(p)}?pageSize=300${trang ? `&pageToken=${encodeURIComponent(trang)}` : ''}`, { headers: this.xacThuc }, this.cfg)
      if (r.status === 404) return kq
      const j = (await r.json()) as { documents?: { name: string; fields?: Record<string, GiaTriRest> }[]; nextPageToken?: string }
      for (const d of j.documents ?? []) kq.push({ ...(giaiMaTruong(d.fields ?? {}) as T), _id: decodeURIComponent(d.name.split('/').pop()!) })
      trang = j.nextPageToken ?? ''
    } while (trang)
    return kq
  }

  /** Ghi tài liệu (thay cả tài liệu — giống setDoc của web app) */
  async ghi(p: string, du: Record<string, unknown>) {
    await goi(`${this.goc}/${this.duongDan(p)}`, {
      method: 'PATCH',
      headers: { ...this.xacThuc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: maHoaTruong(du) }),
    }, this.cfg)
  }

  async xoa(p: string) {
    await goi(`${this.goc}/${this.duongDan(p)}`, { method: 'DELETE', headers: this.xacThuc }, this.cfg)
  }

  // ---------------- Storage (kho hoadon-npsc) ----------------

  private tep(p: string) {
    return `${this.cfg.storage}/v0/b/${BUCKET}/o/${encodeURIComponent(p)}`
  }

  async taiLenTep(p: string, du: Uint8Array, contentType = 'application/octet-stream') {
    await goi(`${this.cfg.storage}/v0/b/${BUCKET}/o?name=${encodeURIComponent(p)}`, {
      method: 'POST',
      headers: { Authorization: `Firebase ${this.idToken}`, 'Content-Type': contentType },
      body: du as BodyInit,
    }, this.cfg)
  }

  async taiVeTep(p: string): Promise<Uint8Array> {
    const r = await goi(`${this.tep(p)}?alt=media`, { headers: { Authorization: `Firebase ${this.idToken}` } }, this.cfg)
    if (r.status === 404) throw new LoiFirebase(404, `Không có file ${p}`)
    return new Uint8Array(await r.arrayBuffer())
  }

  /** Xoá file; không có sẵn thì thôi (giống web app) */
  async xoaTep(p: string) {
    await goi(this.tep(p), { method: 'DELETE', headers: { Authorization: `Firebase ${this.idToken}` } }, this.cfg)
  }
}
