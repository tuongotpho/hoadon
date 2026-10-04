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
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body || undefined,
  })
  console.log(res.status, (await res.text()).slice(0, 3000))
})().catch((e) => {
  console.error('LOI:', e.message)
  process.exit(1)
})
