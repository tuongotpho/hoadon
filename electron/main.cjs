// Vỏ cửa sổ cho app (Electron). Giao diện là bản build trong dist/, phục vụ qua địa chỉ cố định app://hoadon/
// — địa chỉ cố định thì dữ liệu (IndexedDB) luôn nằm đúng một chỗ qua các lần cập nhật app.
const { app, BrowserWindow, protocol, net, session, shell, Menu, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const HOST = 'hoadon'
const DIST = path.join(__dirname, '..', 'dist')

// Chạy kiểm thử: tách dữ liệu ra thư mục riêng để không lẫn với dữ liệu thật
if (process.env.HOADON_PROFILE) app.setPath('userData', process.env.HOADON_PROFILE)

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

// Chỉ mở 1 cửa sổ app; nháy đúp lần nữa thì đưa cửa sổ cũ lên
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.focus()
    }
  })
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
}

function serveDist(request) {
  const url = new URL(request.url)
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = path.normalize(path.join(DIST, rel))
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return new Response('Không tìm thấy', { status: 404 })
  return net.fetch(pathToFileURL(file).toString()).then(
    (res) => new Response(res.body, { headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' } }),
  )
}

// Thư mục cất file Word xuất ra
function exportDir() {
  const dir = process.env.HOADON_EXPORT_DIR || path.join(app.getPath('documents'), 'Hoa don xuat')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function uniquePath(dir, name) {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let p = path.join(dir, name)
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} (${i})${ext}`)
  return p
}

function setupDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    const name = item.getFilename()
    if (/\.docx$/i.test(name)) {
      // Tờ trình / ĐNTT: cất vào Documents\Hoa don xuat rồi mở bằng Word luôn
      const target = uniquePath(exportDir(), name)
      item.setSavePath(target)
      item.once('done', (_ev, state) => {
        if (state === 'completed' && !process.env.HOADON_NO_OPEN) shell.openPath(target)
      })
    } else {
      // Sao lưu, Excel: hỏi chỗ lưu
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('documents'), name) })
    }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Quản lý hóa đơn',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { plugins: true }, // để xem được PDF hóa đơn đính kèm
  })
  win.loadURL(`${SCHEME}://${HOST}/`)

  // Mở file đính kèm (blob:) trong cửa sổ con; link web thì mở bằng trình duyệt
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('blob:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1000, height: 900, webPreferences: { plugins: true } } }
    }
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  return win
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveDist)
  setupDownloads(session.defaultSession)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Trợ giúp',
        submenu: [
          { label: 'Mở thư mục file Word đã xuất', click: () => shell.openPath(exportDir()) },
          { label: 'Mở thư mục dữ liệu của app', click: () => shell.openPath(app.getPath('userData')) },
          { type: 'separator' },
          { label: 'Tải lại', role: 'reload' },
          { label: 'Công cụ kỹ thuật', role: 'toggleDevTools' },
          {
            label: 'Phiên bản',
            click: () => dialog.showMessageBox({ message: `Quản lý hóa đơn ${app.getVersion()}`, detail: `Dữ liệu: ${app.getPath('userData')}` }),
          },
        ],
      },
    ]),
  )
  createWindow()
})

app.on('window-all-closed', () => app.quit())
