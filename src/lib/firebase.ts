import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'
import { FirebaseStore } from './store/FirebaseStore'

// Mã cấu hình web của Firebase — loại được phép công khai (chỉ để nhận diện dự án).
// Bảo mật nằm ở firestore.rules: mỗi tài khoản chỉ đọc/ghi được users/{uid}/ của mình.
const firebaseConfig = {
  apiKey: 'AIzaSyCfCX-xKHVnvv2tEb_AVdxL_xvqnnSjgcQ',
  authDomain: 'app-from-ai.firebaseapp.com',
  projectId: 'app-from-ai',
  storageBucket: 'app-from-ai.firebasestorage.app',
  messagingSenderId: '895767442095',
  appId: '1:895767442095:web:7f5f49b9a8b1e2bd259a5a',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Database riêng "hoadon" (dự án dùng chung với app khác). Có bộ nhớ đệm trên máy: mất mạng vẫn dùng được.
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, 'hoadon')

export function onUser(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}

export async function dangNhapGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function dangXuat() {
  await signOut(auth)
}

export function storeFor(u: User) {
  return new FirebaseStore(db, u.uid)
}
