// @vitest-environment node
/**
 * Máy chủ MCP đi một vòng THẬT trên Firebase GIẢ LẬP (Auth + Firestore + Storage + luật phân quyền):
 *   web app ghi -> AI đọc được;  AI ghi -> web app thấy;  xoá phải xác nhận;  thu hồi phiên trên web app -> AI bị chặn.
 * Đi đủ các bước OAuth như Claude Code: đăng ký -> trang đăng nhập -> cho phép -> đổi mã.
 *   npm run test:firebase      (không có giả lập thì bỏ qua)
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, type Firestore } from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { taoXuLy } from '../mcp/web'
import { emptyDossier, emptyInvoice } from '../src/lib/model'
import { FirebaseStore } from '../src/lib/store/FirebaseStore'
import { DEFAULT_SETTINGS } from '../src/lib/types'

const ON = !!process.env.FIRESTORE_EMULATOR_HOST
const XML = readFileSync(new URL('./fixtures/hoa-don-tt78.xml', import.meta.url), 'utf8')
const GOC = 'http://localhost:8788'
const REDIRECT = 'http://localhost:5555/callback'
const xuLy = taoXuLy({ ...process.env, HOADON_GIA_LAP: '1', HOADON_MCP_KHOA: randomBytes(32).toString('hex'), HOADON_GOC_URL: GOC })
const goi = (duong: string, init: RequestInit = {}) => xuLy(new Request(`${GOC}${duong}`, init))

const app = initializeApp({ projectId: 'demo-hoadon', apiKey: 'gia-lap' }, 'mcp-firebase')
let db: Firestore
let store: FirebaseStore
let uid = ''
let maLamMoi = ''

/** Đi đủ các bước OAuth như Claude Code; trả vé truy cập + vé làm mới */
async function ketNoi(tenMay: string) {
  const { client_id } = await (await goi('/oauth/dang-ky', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude Code' }) })).json()
  const verifier = randomBytes(32).toString('base64url')
  const q = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: REDIRECT, state: 'st', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })
  const html = await (await goi(`/oauth/dang-nhap?${q}`)).text()
  const yeuCau = JSON.parse(/const yeuCau = ("[^"]+");/.exec(html)![1])
  // (trên trình duyệt: người dùng bấm "Đăng nhập Google và cho phép" -> trang gửi mã làm mới Firebase lên)
  const cp = await (await goi('/oauth/cho-phep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yeuCau, maLamMoi, tenMay }) })).json()
  const ve = new URL(cp.chuyenToi)
  expect(ve.origin + ve.pathname).toBe(REDIRECT)
  expect(ve.searchParams.get('state')).toBe('st')
  const doi = (ver: string) => goi('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: ve.searchParams.get('code')!, code_verifier: ver, redirect_uri: REDIRECT, client_id }).toString() })
  expect((await doi('sai-verifier')).status).toBe(400) // cướp được mã nhưng không có verifier -> không đổi được
  const r = await doi(verifier)
  expect(r.status).toBe(200)
  return (await r.json()) as { access_token: string; refresh_token: string }
}

async function moClient(ve: string) {
  const c = new Client({ name: 'test', version: '1' })
  await c.connect(new StreamableHTTPClientTransport(new URL(`${GOC}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${ve}` } },
    fetch: (u, init) => xuLy(new Request(u, init)),
  }))
  return c
}
async function goiCC(c: Client, ten: string, args: Record<string, unknown> = {}) {
  const r = await c.callTool({ name: ten, arguments: args })
  return { loi: !!r.isError, kq: JSON.parse((r.content as { text: string }[])[0].text) }
}

beforeAll(async () => {
  if (!ON) return
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true })
  const { user } = await signInAnonymously(auth)
  uid = user.uid
  maLamMoi = user.refreshToken
  db = initializeFirestore(app, { localCache: memoryLocalCache() }, 'hoadon')
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':')
  connectFirestoreEmulator(db, host, Number(port))
  const st = getStorage(app, 'gs://hoadon-npsc')
  const [sh, sp] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':')
  connectStorageEmulator(st, sh, Number(sp))
  store = new FirebaseStore(db, st, uid)
  // WEB APP lưu hồ sơ + cài đặt như bình thường
  await store.saveSettings({ ...DEFAULT_SETTINGS, hoTen: 'Người Thử' })
  await store.saveDossier({
    ...emptyDossier(), id: 'hs-web', noiDung: 'Làm việc với PC Thử', doiTac: 'PC Thử', ngayToTrinh: '2026-09-01', ngayDntt: '2026-09-05',
    invoices: [{ ...emptyInvoice(), soHd: '45', ngayHd: '2026-09-03', tenNguoiBan: 'Nhà hàng Thử', mstNguoiBan: '0100000005', tienTruocThue: 1_000_000, tienThue: 80_000, tongTien: 1_080_000 }],
  })
})
afterAll(() => deleteApp(app))

describe.skipIf(!ON)('Máy chủ MCP ↔ dữ liệu web app (Firebase giả lập)', () => {
  let c: Client
  let ve: { access_token: string; refresh_token: string }

  it('kết nối qua OAuth; web app thấy máy mới trong danh sách phiên', async () => {
    ve = await ketNoi('Máy cơ quan')
    c = await moClient(ve.access_token)
    const ten = (await c.listTools()).tools.map((t) => t.name).sort()
    expect(ten).toEqual(['danh_sach_ho_so', 'gan_tag', 'sua_ho_so', 'sua_hoa_don', 'sua_nhieu_ho_so', 'tao_ho_so', 'tong_hop', 'tong_quan', 'tra_hoa_don', 'xem_ho_so', 'xoa_ho_so'])
    expect((await c.listTools()).tools.find((t) => t.name === 'xoa_ho_so')!.annotations?.destructiveHint).toBe(true)
    expect((await store.listPhienAI()).map((p) => p.tenMay)).toEqual(['Máy cơ quan']) // ô Kết nối AI ở trang Cài đặt
  })

  it('AI đọc được hồ sơ web app đã lưu', async () => {
    const { kq } = await goiCC(c, 'tong_quan')
    expect(kq).toMatchObject({ soHoSo: 1, tongTien: 1_080_000 })
    expect(kq.theoTrangThai.find((x: { trangThai: string }) => x.trangThai === 'choNop').soHoSo).toBe(1)
    const x = await goiCC(c, 'xem_ho_so', { id: '45' })
    expect(x.kq).toMatchObject({ id: 'hs-web', tongTienBangChu: 'Một triệu không trăm tám mươi nghìn đồng' })
  })

  it('AI sửa hồ sơ -> web app thấy; có nhật ký', async () => {
    const r = await goiCC(c, 'sua_ho_so', { id: 'hs-web', ngayNopKeToan: '2026-09-08', soDntt: '07/ĐNTT' })
    expect(r).toMatchObject({ loi: false, kq: { daLuu: true, trangThai: 'Chờ kế toán thanh toán' } })
    expect(await store.getDossier('hs-web')).toMatchObject({ ngayNopKeToan: '2026-09-08', soDntt: '07/ĐNTT', noiDung: 'Làm việc với PC Thử' })
    const nk = await store.listNhatKyAI(15)
    expect(nk.map((d) => `${d.tenMay}|${d.congCu}`)).toEqual(['Máy cơ quan|sua_ho_so'])
    expect(nk[0].luc).toBeGreaterThan(Date.now() - 60_000)
  })

  it('AI tạo hồ sơ từ XML -> web app mở được hồ sơ và file gốc', async () => {
    const r = await goiCC(c, 'tao_ho_so', { xml: [{ ten_file: 'HD123.xml', noi_dung: XML }], noiDung: 'Mua vật tư thử' })
    expect(r).toMatchObject({ loi: false, kq: { daLuu: true, tongTien: 1_188_000 } })
    const d = (await store.getDossier(r.kq.id))!
    expect(d.invoices[0]).toMatchObject({ soHd: '123', mstNguoiBan: '0100000001', tongTien: 1_188_000 })
    const f = (await store.getFile(d.invoices[0].fileIds[0]))!
    expect(f.name).toBe('HD123.xml')
    expect(await f.data.text()).toBe(XML)
    // nạp lại -> trùng, không ghi thêm
    expect((await goiCC(c, 'tao_ho_so', { xml: [{ ten_file: 'HD123.xml', noi_dung: XML }] })).loi).toBe(true)
    expect(await store.listDossiers()).toHaveLength(2)
  })

  it('xoá: sai xác nhận thì không xoá; đúng thì xoá cả file gốc', async () => {
    const d = (await store.listDossiers()).find((x) => x.noiDung === 'Mua vật tư thử')!
    const fid = d.invoices[0].fileIds[0]
    expect((await goiCC(c, 'xoa_ho_so', { id: d.id, xac_nhan: 'xoá đi' })).kq).toMatchObject({ daXoa: false, canXacNhan: 'Mua vật tư thử' })
    expect(await store.getDossier(d.id)).toBeDefined()
    expect((await goiCC(c, 'xoa_ho_so', { id: d.id, xac_nhan: 'Mua vật tư thử' })).kq).toMatchObject({ daXoa: true })
    expect(await store.getDossier(d.id)).toBeUndefined()
    expect(await store.getFileInfo(fid)).toBeUndefined()
  })

  it('thu hồi phiên trên web app -> AI bị chặn ngay, vé làm mới cũng hết dùng', async () => {
    const [p] = await store.listPhienAI()
    await store.thuHoiPhienAI(p.id) // bấm Thu hồi trên web app
    const r = await goi('/mcp', { method: 'POST', headers: { Authorization: `Bearer ${ve.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) })
    expect(r.status).toBe(401)
    const lm = await goi('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: ve.refresh_token }).toString() })
    expect(lm.status).toBe(400)
  })
})
