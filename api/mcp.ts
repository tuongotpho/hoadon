// Hàm Vercel: máy chủ MCP + cổng đăng nhập cho AI. Toàn bộ phần xử lý nằm ở mcp/web.ts.
// vercel.json chuyển /mcp, /oauth/*, /.well-known/* về đây kèm ?duong=<đường dẫn gốc>.
import { taoXuLy } from '../mcp/web.js'

const xuLy = taoXuLy()
export const GET = xuLy
export const POST = xuLy
export const DELETE = xuLy
