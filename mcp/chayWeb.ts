// Chạy thử máy chủ MCP "trên mạng" ngay trên máy: npm run mcp:web (mặc định cổng 8788).
// Mặc định đọc DỮ LIỆU THẬT (Firebase app-from-ai). Với máy giả lập: đặt HOADON_GIA_LAP=1 và bật emulator trước.
// Rồi trong Claude Code: claude mcp add --transport http hoadon-thu http://localhost:8788/mcp

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { taoXuLy } from './web.js'

const cong = Number(process.env.PORT ?? 8788)
const khoa = process.env.HOADON_MCP_KHOA ?? randomBytes(32).toString('hex') // chỉ để chạy thử: mỗi lần chạy một khoá
const xuLy = taoXuLy({ ...process.env, HOADON_MCP_KHOA: khoa, HOADON_GOC_URL: process.env.HOADON_GOC_URL ?? `http://localhost:${cong}` })

createServer(async (req, res) => {
  const than = req.method === 'GET' || req.method === 'HEAD' ? undefined : await new Promise<Buffer>((ok) => {
    const c: Buffer[] = []
    req.on('data', (x) => c.push(x)).on('end', () => ok(Buffer.concat(c)))
  })
  const r = await xuLy(new Request(`http://localhost:${cong}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: than && new Uint8Array(than) }))
  res.writeHead(r.status, Object.fromEntries(r.headers))
  res.end(Buffer.from(await r.arrayBuffer()))
}).listen(cong, () => console.error(`hoadon MCP (web) chạy thử: http://localhost:${cong}/mcp${process.env.HOADON_GIA_LAP === '1' ? ' — máy giả lập Firebase' : ' — ⚠️ DỮ LIỆU THẬT'}`))
