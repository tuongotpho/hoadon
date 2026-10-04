// Gọi API Google Cloud bằng quyền đăng nhập sẵn có của Firebase CLI (không cần cài gcloud).
// Mã truy cập chỉ dùng trong tiến trình này, không in ra.
//   node scripts/gcs.cjs GET  <url>
//   node scripts/gcs.cjs PATCH <url> '<json>'
const { execSync } = require('node:child_process')
const root = execSync('npm root -g').toString().trim()
const auth = require(`${root}/firebase-tools/lib/auth`)
const { configstore } = require(`${root}/firebase-tools/lib/configstore`)

;(async () => {
  const [method, url, body] = process.argv.slice(2)
  const tokens = configstore.get('tokens')
  const at = await auth.getAccessToken(tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform'])
  const token = typeof at === 'string' ? at : at.access_token
  const res = await fetch(url, {
    method,
    // QUOTA_PROJECT: một số API (vd Identity Toolkit) đòi ghi rõ dự án tính hạn mức
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(process.env.QUOTA_PROJECT ? { 'x-goog-user-project': process.env.QUOTA_PROJECT } : {}) },
    body: body || undefined,
  })
  const text = await res.text()
  console.log(res.status, process.env.FULL ? text : text.slice(0, 3000)) // FULL=1: in đủ
})().catch((e) => {
  console.error('LOI:', e.message)
  process.exit(1)
})
