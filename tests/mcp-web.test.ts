// @vitest-environment node
// Cổng vào máy chủ MCP trên mạng — phần KHÔNG cần Firebase: vé mã hoá, PKCE, chặn địa chỉ lạ, chặn khi chưa có vé.
// Phần đi qua Firebase thật (máy giả lập) nằm ở tests/mcp-firebase.test.ts.

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { khoaTuChuoi, khopPKCE, moVe, niemPhong, noiNhanHopLe } from '../mcp/oauth'
import { giaiMa, maHoa } from '../mcp/firebaseRest'
import { taoXuLy } from '../mcp/web'

const KHOA = 'k'.repeat(40)
const xuLy = taoXuLy({ HOADON_MCP_KHOA: KHOA, HOADON_GOC_URL: 'https://hoadon.example' })
const goi = (duong: string, init: RequestInit = {}) => xuLy(new Request(`https://hoadon.example${duong}`, init))
const dangKy = (redirect_uris: string[]) => goi('/oauth/dang-ky', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris, client_name: 'Claude Code' }) })

describe('Vé mã hoá', () => {
  const k = khoaTuChuoi(KHOA)
  it('mở đúng vé; sửa 1 ký tự / sai loại / hết hạn / sai khoá đều bị từ chối', () => {
    const v = niemPhong(k, { l: 'truyCap', u: 'abc', exp: Date.now() + 1000 })
    expect(moVe(k, v, 'truyCap')).toMatchObject({ u: 'abc' })
    expect(moVe(k, v.slice(0, -2) + (v.at(-2) === 'A' ? 'B' : 'A') + v.at(-1), 'truyCap')).toBeNull()
    expect(moVe(k, v, 'lamMoi')).toBeNull()
    expect(moVe(k, v, 'truyCap', Date.now() + 5000)).toBeNull()
    expect(moVe(khoaTuChuoi('x'.repeat(40)), v, 'truyCap')).toBeNull()
    expect(() => khoaTuChuoi('ngan')).toThrow('HOADON_MCP_KHOA')
  })
  it('PKCE S256', () => {
    const ver = 'mot-chuoi-bi-mat-du-dai-de-lam-code-verifier-123'
    const ch = createHash('sha256').update(ver).digest('base64url')
    expect(khopPKCE(ver, ch)).toBe(true)
    expect(khopPKCE(ver + 'x', ch)).toBe(false)
    expect(khopPKCE(undefined, ch)).toBe(false)
  })
  it('chỉ nhận địa chỉ trả về trên máy hoặc claude.ai / claude.com', () => {
    expect(noiNhanHopLe('http://localhost:53682/callback')).toBe(true)
    expect(noiNhanHopLe('http://127.0.0.1:9000/cb')).toBe(true)
    expect(noiNhanHopLe('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(noiNhanHopLe('https://ke-gian.example/cb')).toBe(false)
    expect(noiNhanHopLe('http://claude.ai/cb')).toBe(false)
    expect(noiNhanHopLe('https://claude.ai.ke-gian.example/cb')).toBe(false)
    expect(noiNhanHopLe('https://ke-gian.example/cb', ['ke-gian.example'])).toBe(true)
  })
  it('đổi giá trị qua lại dạng Firestore REST không mất gì', () => {
    const x = { a: 1, b: 1.5, c: 'chữ', d: true, e: null, f: [1, 'x', { g: -2 }], h: { i: [] } }
    expect(giaiMa(maHoa(x))).toEqual(x)
  })
})

describe('Cổng OAuth + /mcp (không cần Firebase)', () => {
  it('công bố địa chỉ đăng nhập theo chuẩn MCP', async () => {
    const prm = await (await goi('/api/mcp?duong=/.well-known/oauth-protected-resource/mcp')).json()
    expect(prm).toMatchObject({ resource: 'https://hoadon.example/mcp', authorization_servers: ['https://hoadon.example'] })
    const as = await (await goi('/.well-known/oauth-authorization-server')).json()
    expect(as).toMatchObject({ authorization_endpoint: 'https://hoadon.example/oauth/dang-nhap', token_endpoint: 'https://hoadon.example/oauth/token', code_challenge_methods_supported: ['S256'] })
  })

  it('/mcp không có vé -> 401 kèm chỉ dẫn đăng nhập', async () => {
    const r = await goi('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' })
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata="https://hoadon.example/.well-known/oauth-protected-resource"')
    const gia = await goi('/mcp', { method: 'POST', headers: { Authorization: 'Bearer ve-gia' }, body: '{}' })
    expect(gia.status).toBe(401)
  })

  it('đăng ký: từ chối trang lạ, nhận Claude Code trên máy', async () => {
    expect((await dangKy(['https://ke-gian.example/cb'])).status).toBe(400)
    const r = await dangKy(['http://localhost:5555/callback'])
    expect(r.status).toBe(201)
    expect(await r.json()).toMatchObject({ client_id: expect.any(String), token_endpoint_auth_method: 'none' })
  })

  it('trang đăng nhập: mã khách sai / địa chỉ trả về khác lúc đăng ký -> báo lỗi, KHÔNG chuyển hướng', async () => {
    const { client_id } = await (await dangKy(['http://localhost:5555/callback'])).json()
    const q = (o: Record<string, string>) => `/oauth/dang-nhap?${new URLSearchParams({ response_type: 'code', code_challenge: 'abc', code_challenge_method: 'S256', state: 's1', ...o })}`
    expect((await goi(q({ client_id: 'bia', redirect_uri: 'http://localhost:5555/callback' }))).status).toBe(400)
    const khac = await goi(q({ client_id, redirect_uri: 'http://localhost:6666/callback' }))
    expect(khac.status).toBe(400)
    expect(khac.headers.get('location')).toBeNull()
    // thiếu PKCE -> trả lỗi về ứng dụng (đúng địa chỉ đã đăng ký)
    const thieu = await goi(q({ client_id, redirect_uri: 'http://localhost:5555/callback', code_challenge_method: 'plain' }))
    expect(thieu.status).toBe(302)
    expect(thieu.headers.get('location')).toBe('http://localhost:5555/callback?error=invalid_request&state=s1')
    const ok = await goi(q({ client_id, redirect_uri: 'http://localhost:5555/callback' }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    const html = await ok.text()
    expect(html).toContain('Cho phép AI truy cập hồ sơ hóa đơn')
    expect(html).toContain('Claude Code')
  })

  it('đổi mã: mã giả / yêu cầu hết hạn bị từ chối', async () => {
    const tk = await goi('/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=authorization_code&code=gia&code_verifier=x' })
    expect(tk.status).toBe(400)
    expect(await tk.json()).toMatchObject({ error: 'invalid_grant' })
    const cp = await goi('/oauth/cho-phep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yeuCau: 'gia', maLamMoi: 'x' }) })
    expect(cp.status).toBe(400)
  })

  it('thiếu khoá bí mật trên máy chủ -> báo rõ, không chạy', async () => {
    const r = await taoXuLy({})(new Request('https://x/mcp', { method: 'POST' }))
    expect(r.status).toBe(500)
    expect((await r.json()).loi).toContain('HOADON_MCP_KHOA')
  })
})
