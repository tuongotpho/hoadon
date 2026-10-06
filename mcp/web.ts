// "Cửa vào" của máy chủ MCP trên mạng (Vercel, file api/mcp.ts gọi vào đây). Một hàm nhận Request trả Response:
//
//   /.well-known/oauth-protected-resource      AI hỏi: muốn vào /mcp thì xin phép ở đâu
//   /.well-known/oauth-authorization-server    AI hỏi: các địa chỉ đăng ký / đăng nhập / lấy vé
//   POST /oauth/dang-ky                        AI tự đăng ký (mỗi ứng dụng AI một mã khách)
//   GET  /oauth/dang-nhap                      trang người dùng đăng nhập Google + bấm cho phép
//   POST /oauth/cho-phep                       trang trên gửi mã làm mới Firebase -> tạo phiên AI, trả mã
//   POST /oauth/token                          AI đổi mã lấy vé truy cập (1 giờ) + vé làm mới
//   POST /mcp                                  AI gọi công cụ (kèm vé truy cập)
//
// Không lưu gì ngoài Firebase của chính người dùng (phiên AI, nhật ký). Biến môi trường trên Vercel:
//   HOADON_MCP_KHOA (bắt buộc, bí mật) · HOADON_GOC_URL (tuỳ chọn) · HOADON_MCP_NOI_NHAN_THEM (tuỳ chọn)

import { createHash } from 'node:crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { DuLieu } from './congCu.js'
import { taoMayChu } from './mayChu.js'
import { cauHinhFirebase, doiMa, FirebaseNguoiDung, LoiFirebase, type CauHinhFirebase } from './firebaseRest.js'
import * as kho from './kho.js'
import { khoaTuChuoi, khopPKCE, moVe, niemPhong, noiNhanHopLe, type Ve } from './oauth.js'

// Ngày "hôm nay" (hạn chờ kế toán, gợi ý ngày ĐNTT) tính theo giờ Việt Nam, dù máy chủ đặt ở nước ngoài
process.env.TZ = 'Asia/Ho_Chi_Minh'

const GIO = 3600 * 1000

type Env = Record<string, string | undefined>

interface VeTruyCap extends Ve { u: string; rt: string; p: string; tm: string }

const jsonRes = (x: unknown, status = 200, them: Record<string, string> = {}) =>
  new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...them } })
const loiOAuth = (error: string, moTa: string, status = 400) => {
  console.log('[oauth] tu-choi', error, moTa)
  return jsonRes({ error, error_description: moTa }, status)
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Mã truy cập Firebase dùng lại trong lúc máy chủ còn "ấm" (khỏi đổi mã mỗi lần gọi) */
const boNhoMa = new Map<string, { idToken: string; uid: string; hetHan: number }>()
async function maFirebase(cfg: CauHinhFirebase, rt: string) {
  const k = createHash('sha256').update(rt).digest('hex')
  const co = boNhoMa.get(k)
  if (co && co.hetHan > Date.now()) return co
  const moi = await doiMa(cfg, rt)
  boNhoMa.set(k, moi)
  return moi
}

export function taoXuLy(env: Env = process.env) {
  const noiNhanThem = (env.HOADON_MCP_NOI_NHAN_THEM ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  return async function xuLy(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const goc = (env.HOADON_GOC_URL || `${req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')}://${req.headers.get('x-forwarded-host') ?? url.host}`).replace(/\/$/, '')
    // Vercel chuyển mọi đường dẫn vào api/mcp, kèm ?duong=<đường dẫn gốc>
    const duong = url.searchParams.get('duong') ?? url.pathname
    let khoa: Buffer
    try {
      khoa = khoaTuChuoi(env.HOADON_MCP_KHOA)
    } catch (e) {
      return jsonRes({ loi: (e as Error).message }, 500)
    }
    const cfg = cauHinhFirebase(env, `${goc}/`)

    try {
      if (duong.startsWith('/.well-known/oauth-protected-resource')) {
        return jsonRes({ resource: `${goc}/mcp`, authorization_servers: [goc], bearer_methods_supported: ['header'], resource_name: 'Hồ sơ hóa đơn (hoadon)' }, 200, { 'Access-Control-Allow-Origin': '*' })
      }
      if (duong.startsWith('/.well-known/oauth-authorization-server') || duong.startsWith('/.well-known/openid-configuration')) {
        return jsonRes({
          issuer: goc,
          authorization_endpoint: `${goc}/oauth/dang-nhap`,
          token_endpoint: `${goc}/oauth/token`,
          registration_endpoint: `${goc}/oauth/dang-ky`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        }, 200, { 'Access-Control-Allow-Origin': '*' })
      }
      if (duong === '/oauth/dang-ky' && req.method === 'POST') return dangKy(await req.json().catch(() => ({})))
      if (duong === '/oauth/dang-nhap' && req.method === 'GET') return trangDangNhap(url.searchParams)
      if (duong === '/oauth/cho-phep' && req.method === 'POST') return await choPhep(await req.json().catch(() => ({})))
      if (duong === '/oauth/token' && req.method === 'POST') return await capVe(req)
      if (duong === '/mcp' || duong === '/api/mcp') return await mcp(req)
      return jsonRes({ loi: 'Không có đường dẫn này' }, 404)
    } catch (e) {
      const thongDiep = e instanceof LoiFirebase ? e.message : 'Lỗi máy chủ'
      if (!(e instanceof LoiFirebase)) console.error(e)
      return jsonRes({ loi: thongDiep }, 500)
    }

    // ---------- Đăng ký ứng dụng AI (RFC 7591) ----------
    function dangKy(y: { redirect_uris?: unknown; client_name?: unknown }) {
      const uris = Array.isArray(y.redirect_uris) ? y.redirect_uris.filter((x): x is string => typeof x === 'string') : []
      console.log('[oauth] dang-ky', JSON.stringify({ ten: y.client_name, redirect_uris: uris, hopLe: uris.map((u) => noiNhanHopLe(u, noiNhanThem)) }))
      if (!uris.length || !uris.every((u) => noiNhanHopLe(u, noiNhanThem))) {
        return loiOAuth('invalid_redirect_uri', 'Chỉ nhận địa chỉ trả về trên máy (localhost / 127.0.0.1) hoặc claude.ai / claude.com')
      }
      const ten = (typeof y.client_name === 'string' ? y.client_name : 'Ứng dụng AI').slice(0, 80)
      const client_id = niemPhong(khoa, { l: 'khach', r: uris, n: ten })
      return jsonRes({
        client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: ten, redirect_uris: uris,
        token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      }, 201)
    }

    // ---------- Trang đăng nhập + cho phép ----------
    function trangDangNhap(q: URLSearchParams) {
      const khach = moVe<Ve & { r: string[]; n: string }>(khoa, q.get('client_id'), 'khach')
      const redirect = q.get('redirect_uri') ?? ''
      // Sai mã khách / địa chỉ trả về: KHÔNG chuyển hướng (tránh bị lợi dụng), chỉ báo lỗi
      if (!khach || !khach.r.includes(redirect)) return trangLoi('Yêu cầu kết nối không hợp lệ (ứng dụng chưa đăng ký hoặc địa chỉ trả về lạ).')
      const quayVe = (loi: string) => Response.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}${new URLSearchParams({ error: loi, ...(q.get('state') ? { state: q.get('state')! } : {}) })}`, 302)
      if (q.get('response_type') !== 'code') return quayVe('unsupported_response_type')
      const cc = q.get('code_challenge')
      if (!cc || q.get('code_challenge_method') !== 'S256') return quayVe('invalid_request')
      const yeuCau = niemPhong(khoa, { l: 'yeuCau', c: q.get('client_id'), r: redirect, s: q.get('state') ?? '', cc, n: khach.n, exp: Date.now() + 15 * 60 * 1000 })
      return trangHtml(htmlDangNhap(yeuCau, khach.n, new URL(redirect).host, cfg, env.HOADON_GIA_LAP === '1'))
    }

    async function choPhep(y: { yeuCau?: string; maLamMoi?: string; tenMay?: string }) {
      const yc = moVe<Ve & { c: string; r: string; s: string; cc: string; n: string }>(khoa, y.yeuCau, 'yeuCau')
      if (!yc) return jsonRes({ loi: 'Yêu cầu đã hết hạn — quay lại AI và kết nối lại.' }, 400)
      if (!y.maLamMoi) return jsonRes({ loi: 'Chưa đăng nhập Google' }, 400)
      // Tự kiểm mã với Firebase, không tin trình duyệt gửi gì lên
      const { idToken, uid } = await doiMa(cfg, y.maLamMoi)
      const fb = new FirebaseNguoiDung(cfg, uid, idToken)
      const tenMay = (y.tenMay?.trim() || yc.n).slice(0, 60)
      const maPhien = await kho.taoPhien(fb, { tenMay, ungDung: yc.n, noiNhan: new URL(yc.r).host })
      const code = niemPhong(khoa, { l: 'ma', u: uid, rt: y.maLamMoi, p: maPhien, tm: tenMay, cc: yc.cc, r: yc.r, c: yc.c, exp: Date.now() + 5 * 60 * 1000 })
      const q = new URLSearchParams({ code, ...(yc.s ? { state: yc.s } : {}) })
      console.log('[oauth] cho-phep', JSON.stringify({ ungDung: yc.n, noiNhan: new URL(yc.r).origin + new URL(yc.r).pathname }))
      return jsonRes({ chuyenToi: `${yc.r}${yc.r.includes('?') ? '&' : '?'}${q}` })
    }

    // ---------- Đổi mã lấy vé ----------
    async function capVe(r: Request) {
      const loai = r.headers.get('content-type') ?? ''
      const f = loai.includes('json') ? new URLSearchParams(Object.entries(await r.json() as Record<string, string>)) : new URLSearchParams(await r.text())
      console.log('[oauth] token', JSON.stringify({ grant: f.get('grant_type'), coMa: !!f.get('code'), coVerifier: !!f.get('code_verifier'), redirect: f.get('redirect_uri'), coClient: !!f.get('client_id'), coLamMoi: !!f.get('refresh_token'), loaiNoiDung: loai }))
      const phatVe = (v: { u: string; rt: string; p: string; tm: string }, veLamMoi?: string) => jsonRes({
        access_token: niemPhong(khoa, { l: 'truyCap', ...v, exp: Date.now() + GIO }),
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: veLamMoi ?? niemPhong(khoa, { l: 'lamMoi', ...v }),
      })
      if (f.get('grant_type') === 'authorization_code') {
        const m = moVe<Ve & { u: string; rt: string; p: string; tm: string; cc: string; r: string; c: string }>(khoa, f.get('code'), 'ma')
        if (!m) return loiOAuth('invalid_grant', 'Mã không hợp lệ hoặc đã hết hạn')
        if (f.get('redirect_uri') && f.get('redirect_uri') !== m.r) return loiOAuth('invalid_grant', 'Sai địa chỉ trả về')
        if (f.get('client_id') && f.get('client_id') !== m.c) return loiOAuth('invalid_grant', 'Sai mã khách')
        if (!khopPKCE(f.get('code_verifier'), m.cc)) return loiOAuth('invalid_grant', 'Sai code_verifier')
        return phatVe({ u: m.u, rt: m.rt, p: m.p, tm: m.tm })
      }
      if (f.get('grant_type') === 'refresh_token') {
        const lm = moVe<Ve & { u: string; rt: string; p: string; tm: string }>(khoa, f.get('refresh_token'), 'lamMoi')
        if (!lm) return loiOAuth('invalid_grant', 'Vé làm mới không hợp lệ')
        // Phiên đã bị thu hồi trên web app -> không cấp tiếp
        const ok = await kiemPhien(lm).catch(() => null)
        if (!ok) return loiOAuth('invalid_grant', 'Quyền của máy này đã bị thu hồi — kết nối lại')
        return phatVe({ u: lm.u, rt: lm.rt, p: lm.p, tm: lm.tm }, f.get('refresh_token')!)
      }
      return loiOAuth('unsupported_grant_type', 'Chỉ hỗ trợ authorization_code và refresh_token')
    }

    async function kiemPhien(v: { u: string; rt: string; p: string }) {
      const m = await maFirebase(cfg, v.rt)
      if (m.uid !== v.u) return null
      const fb = new FirebaseNguoiDung(cfg, m.uid, m.idToken)
      const phien = await kho.conPhien(fb, v.p)
      return phien ? { fb, phien } : null
    }

    // ---------- Gọi công cụ ----------
    async function mcp(r: Request) {
      // Header HTTP chỉ chứa được chữ không dấu -> lời giải thích tiếng Việt để ở phần thân
      const chuaVao = (moTa: string) => jsonRes({ error: 'invalid_token', error_description: moTa }, 401, {
        'WWW-Authenticate': `Bearer error="invalid_token", resource_metadata="${goc}/.well-known/oauth-protected-resource"`,
      })
      const ve = moVe<VeTruyCap>(khoa, /^Bearer\s+(.+)$/i.exec(r.headers.get('authorization') ?? '')?.[1], 'truyCap')
      if (!ve) return chuaVao('Chưa đăng nhập hoặc vé đã hết hạn')
      const ok = await kiemPhien(ve).catch((e) => (e instanceof LoiFirebase && e.trangThai === 400 ? null : Promise.reject(e)))
      if (!ok) return chuaVao('Quyền của máy này đã bị thu hồi hoặc tài khoản Google đã đổi — kết nối lại')
      const { fb } = ok

      // Mỗi lần gọi tải mới từ mây (dữ liệu luôn khớp web app), chỉ tải một lần trong cùng yêu cầu
      let tai: Promise<DuLieu> | null = null
      const server = taoMayChu({
        lay: () => (tai ??= kho.taiDuLieu(fb)),
        ghi: {
          luuHoSo: (d) => kho.luuHoSo(fb, d),
          luuFile: (f) => kho.luuFile(fb, f),
          xoaHoSo: (d) => kho.xoaHoSo(fb, d),
          nhatKy: (congCu, moTa) => kho.ghiNhatKy(fb, ve.p, ve.tm, congCu, moTa),
        },
      })
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      await server.connect(transport)
      return transport.handleRequest(r)
    }
  }
}

function trangHtml(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline' https://www.gstatic.com https://apis.google.com; style-src 'unsafe-inline'; img-src data: https:; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com http://127.0.0.1:9099; frame-src https://app-from-ai.firebaseapp.com https://accounts.google.com; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

const trangLoi = (moTa: string) => trangHtml(`<!doctype html><meta charset="utf-8"><title>Kết nối AI</title><p style="font:16px system-ui;margin:2rem">⛔ ${esc(moTa)}</p>`, 400)

function htmlDangNhap(yeuCau: string, tenUngDung: string, noiNhan: string, cfg: CauHinhFirebase, giaLap: boolean) {
  const fbCfg = { apiKey: cfg.apiKey, authDomain: 'app-from-ai.firebaseapp.com', projectId: cfg.projectId }
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cho phép AI truy cập hồ sơ hóa đơn</title>
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#ecfdf5;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center}
main{background:#fff;max-width:440px;margin:16px;padding:24px;border-radius:16px;box-shadow:0 10px 30px #0001}
h1{font-size:20px;margin:0 0 8px;color:#047857}
ul{padding-left:20px;margin:8px 0}
label{display:block;margin-top:12px;font-size:14px;color:#475569}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit}
button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:999px;background:#047857;color:#fff;font:600 16px system-ui;cursor:pointer}
button:disabled{opacity:.6}
.nho{font-size:13px;color:#64748b}.loi{color:#b91c1c}
</style></head><body><main>
<h1>Cho phép AI truy cập hồ sơ hóa đơn?</h1>
<p><b>${esc(tenUngDung)}</b> <span class="nho">(trả về ${esc(noiNhan)})</span> xin quyền thay mặt tài khoản Google của bạn:</p>
<ul>
<li>Xem toàn bộ hồ sơ, hóa đơn, tổng hợp trên app Quản lý hóa đơn</li>
<li>Sửa hồ sơ (mốc ngày, số tờ trình, tài khoản người bán…), tạo hồ sơ từ hóa đơn XML</li>
<li>Xoá từng hồ sơ — chỉ khi bạn xác nhận đúng tên hồ sơ</li>
</ul>
<p class="nho">Mọi lần ghi / xoá được ghi nhật ký; thu hồi quyền máy này bất cứ lúc nào ở trang Cài đặt trên web app.</p>
<label>Tên máy này (để nhận ra khi thu hồi)<input id="tenMay" maxlength="60" value="${esc(tenUngDung)}"></label>
<button id="nut">Đăng nhập Google và cho phép</button>
<p id="tb" class="nho" role="status"></p>
</main>
<script src="https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.19.0/firebase-auth-compat.js"></script>
<script>
const yeuCau = ${JSON.stringify(yeuCau)};
firebase.initializeApp(${JSON.stringify(fbCfg)});
const auth = firebase.auth();
${giaLap ? "auth.useEmulator('http://127.0.0.1:9099');" : ''}
const nut = document.getElementById('nut'), tb = document.getElementById('tb');
const bao = (s, loi) => { tb.textContent = s; tb.className = loi ? 'loi' : 'nho'; };
async function xong(user) {
  bao('Đang cấp quyền cho ' + (user.email || 'tài khoản') + '…');
  const r = await fetch(location.pathname.replace(/dang-nhap$/, 'cho-phep'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yeuCau, maLamMoi: user.refreshToken, tenMay: document.getElementById('tenMay').value }),
  });
  const j = await r.json();
  await auth.signOut();
  if (!r.ok) throw new Error(j.loi || 'Không cấp được quyền');
  bao('Xong — đang quay lại ứng dụng AI. Có thể đóng trang này.');
  location.href = j.chuyenToi;
}
auth.getRedirectResult().then((r) => r.user && xong(r.user)).catch((e) => bao(e.message, true));
nut.onclick = async () => {
  nut.disabled = true;
  try {
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    let kq;
    try { kq = await auth.signInWithPopup(p); }
    catch (e) { if (e.code === 'auth/popup-blocked') return auth.signInWithRedirect(p); throw e; }
    await xong(kq.user);
  } catch (e) { bao(e.message, true); nut.disabled = false; }
};
</script></body></html>`
}
