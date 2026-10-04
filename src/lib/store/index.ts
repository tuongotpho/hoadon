import type { DataStore } from './DataStore'

/**
 * Chỗ duy nhất quyết định dữ liệu cất ở đâu. App chỉ chạy online: phải đăng nhập Google,
 * rồi setStore(FirebaseStore) — trước đó mọi thao tác dữ liệu đều báo "chưa đăng nhập".
 * `export let` = mọi nơi import { store } luôn thấy bản đang dùng (ràng buộc sống của ES module).
 */
export const CHUA_DANG_NHAP: DataStore = new Proxy({} as DataStore, {
  get: (_t, ten) => {
    if (ten === 'subscribe') return () => () => {}
    return () => Promise.reject(new Error('Chưa đăng nhập'))
  },
})

export let store: DataStore = CHUA_DANG_NHAP

export function setStore(s: DataStore) {
  store = s
}

export { newId } from './DataStore'
export type { DataStore, FileInfo } from './DataStore'
