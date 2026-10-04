import type { DataStore } from './DataStore'
import { LocalStore } from './LocalStore'

// Chỗ duy nhất quyết định dữ liệu cất ở đâu.
// Mặc định: trên máy (IndexedDB). Đăng nhập Google -> setStore(FirebaseStore) để cất lên Firestore.
// `export let` = mọi nơi import { store } luôn thấy bản đang dùng (ràng buộc sống của ES module).
export const localStore = new LocalStore()
export let store: DataStore = localStore

export function setStore(s: DataStore) {
  store = s
}

export { newId } from './DataStore'
export type { DataStore } from './DataStore'
