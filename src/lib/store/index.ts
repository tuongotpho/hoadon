import type { DataStore } from './DataStore'
import { LocalStore } from './LocalStore'

// Chỗ duy nhất quyết định dữ liệu cất ở đâu.
// Khi chuyển online: thay bằng `new FirebaseStore(...)`.
export const store: DataStore = new LocalStore()

export { newId } from './DataStore'
export type { DataStore } from './DataStore'
