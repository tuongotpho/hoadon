// Kiểm tra app cửa sổ (Electron) chạy thật: mở app -> thả PDF hóa đơn -> xuất 2 file Word -> tắt, mở lại xem dữ liệu còn.
// Dùng thư mục dữ liệu TẠM, không đụng dữ liệu thật, không mở Word.
//   node scripts/kiem-tra-app.mjs                      (chạy bằng electron trong node_modules)
//   node scripts/kiem-tra-app.mjs "đường\dẫn\app.exe"  (chạy bản đã đóng gói)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const exe = process.argv[2]
const PORT = 9333
const profile = mkdtempSync(path.join(tmpdir(), 'hoadon-test-'))
const exportDir = path.join(profile, 'xuat')
const pdf = readFileSync('HD-Hung Yen/C26MAA994.pdf').toString('base64')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ok = true
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) ok = false
}

let proc = null
function killApp() {
  if (proc?.pid) spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
  proc = null
}

function launch() {
  const env = { ...process.env, HOADON_PROFILE: profile, HOADON_EXPORT_DIR: exportDir, HOADON_NO_OPEN: '1' }
  const args = [`--remote-debugging-port=${PORT}`]
  const cmd = exe ?? path.join('node_modules', 'electron', 'dist', 'electron.exe')
  proc = spawn(cmd, exe ? args : ['.', ...args], { env, stdio: 'ignore' })
  return proc
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = pages.find((p) => p.url.startsWith('app://hoadon'))
      if (page) {
        const ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((r) => ws.addEventListener('open', r, { once: true }))
        let id = 0
        const evaluate = (expression) =>
          new Promise((resolve, reject) => {
            const myId = ++id
            const onMsg = (ev) => {
              const m = JSON.parse(ev.data)
              if (m.id !== myId) return
              ws.removeEventListener('message', onMsg)
              if (m.result?.exceptionDetails) reject(new Error(m.result.exceptionDetails.exception?.description ?? 'lỗi JS'))
              else resolve(m.result?.result?.value)
            }
            ws.addEventListener('message', onMsg)
            ws.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
          })
        return { ws, evaluate }
      }
    } catch {}
    await sleep(500)
  }
  throw new Error('Không kết nối được tới app')
}

// Hỏi lại nhiều lần (mỗi lần 1 câu ngắn) cho tới khi trang có chữ t — tránh bám vào trang trống lúc đang tải
async function waitFor(evaluate, t, ms = 20000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(300)) {
    try {
      if (await evaluate(`!!document.body?.innerText.includes(${JSON.stringify(t)})`)) return true
    } catch {}
  }
  return false
}

try {
  // ── Lần mở 1 ──
  launch()
  let { ws, evaluate } = await connect()
  const daMo = await waitFor(evaluate, 'Kéo thả file hóa đơn')
  check('App mở được, hiện trang Hồ sơ', daMo, daMo ? '' : await evaluate(`location.href + ' :: ' + (document.body?.innerText ?? '(trống)').slice(0, 200)`))
  check('Nhận ra đang chạy dạng app', await evaluate(`navigator.userAgent.includes('Electron')`))

  const filled = await evaluate(`(async () => {
    window.alert = () => {}
    const bin = Uint8Array.from(atob(${JSON.stringify(pdf)}), c => c.charCodeAt(0))
    const dt = new DataTransfer(); dt.items.add(new File([bin], 'C26MAA994.pdf', { type: 'application/pdf' }))
    const input = document.querySelector('input[type=file]'); input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    for (let i = 0; i < 40; i++) { if (document.body.innerText.includes('9 dòng hàng hóa')) break; await new Promise(r => setTimeout(r, 250)) }
    return [...document.querySelectorAll('main input:not([type=file])')].map(i => i.value).filter(Boolean)
  })()`)
  check('Đọc PDF hóa đơn trong app (thư viện PDF chạy được)', filled.includes('994') && filled.includes('18.836.300'), filled.slice(0, 6).join(' | '))

  await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.includes('Xuất cả 2 file Word')).click()`)
  let files = []
  for (let i = 0; i < 30 && files.length < 2; i++) {
    await sleep(300)
    files = existsSync(exportDir) ? readdirSync(exportDir).filter((f) => f.endsWith('.docx')) : []
  }
  check('Xuất 2 file Word vào thư mục xuất', files.length === 2, files.map((f) => `${f} (${statSync(path.join(exportDir, f)).size} byte)`).join(', '))

  // ── Nhập hóa đơn cũ hàng loạt ──
  const xml = readFileSync('tests/fixtures/hoa-don-tt78.xml').toString('base64')
  const nhap = await evaluate(`(async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms))
    const btn = (t) => [...document.querySelectorAll('button')].find(b => b.innerText.includes(t))
    btn('Danh sách')?.click(); await wait(800)
    btn('Nhập hóa đơn cũ').click(); await wait(500)
    const f = (b64, name, type) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type })
    const dt = new DataTransfer()
    dt.items.add(f(${JSON.stringify(pdf)}, 'C26MAA994.pdf', 'application/pdf'))
    dt.items.add(f(${JSON.stringify(xml)}, 'HD-123.xml', 'text/xml'))
    dt.items.add(f(${JSON.stringify(xml)}, 'ban-sao-HD-123.xml', 'text/xml'))
    const input = document.querySelector('input[type=file]'); input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    for (let i = 0; i < 60 && !document.body.innerText.includes('Kết quả:'); i++) await wait(250)
    const rows = [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' '))
    btn('✓ Đã thanh toán')?.click(); await wait(800)
    const sauBam = document.body.innerText.match(/Đã thanh toán: [\\d.]+ đ/)?.[0]
    btn('Danh sách').click(); await wait(800)
    document.querySelector('select').value = 'all'; document.querySelector('select').dispatchEvent(new Event('change', { bubbles: true })); await wait(500)
    const ds = [...document.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\\s+/g, ' '))
    return { tieuDe: document.body.innerText.match(/Kết quả:[^\\n]*/)?.[0], rows, sauBam, ds }
  })()`)
  check('Nhập 3 file: 1 mới + 2 bỏ qua (994 đã có, bản sao 123)', nhap.rows.filter((r) => r.includes('bỏ qua')).length === 2 && nhap.rows.length === 3, nhap.rows.join(' || '))
  check('Bấm "Đã thanh toán" ở bảng kết quả', nhap.sauBam === 'Đã thanh toán: 1.188.000 đ', nhap.sauBam)
  check('Danh sách có nhãn HĐ cũ, trạng thái Đã thanh toán', nhap.ds.some((r) => r.toLowerCase().includes('hđ cũ') && r.includes('Đã thanh toán')), nhap.ds.join(' || '))

  ws.close()
  killApp()
  await sleep(2000)

  // ── Lần mở 2: dữ liệu còn không ──
  launch()
  ;({ ws, evaluate } = await connect())
  check('Tắt rồi mở lại: hồ sơ vẫn còn', await waitFor(evaluate, '18.836.300'))
  ws.close()
} catch (e) {
  check('Chạy kiểm tra', false, e.message)
} finally {
  killApp()
  await sleep(1500)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {}
  console.log(ok ? '\nKẾT QUẢ: ĐẠT' : '\nKẾT QUẢ: CÓ LỖI')
  process.exit(ok ? 0 : 1)
}
