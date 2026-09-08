/**
 * Firebase Auth + Firestore.
 *
 * Google sign-in uses signInWithPopup in a real window (popup.html?auth=1),
 * not chrome.identity.getAuthToken:
 * - The toolbar popup closes as soon as it loses focus, so running the
 *   OAuth popup from there drops the result.
 * - chrome.identity needs a separate "Chrome extension" OAuth client tied
 *   to this extension ID. Firebase already has a web Google provider enabled.
 * Opening the popup page as a real window keeps the opener alive for Firebase's
 * popup flow. Add chrome-extension://<extension-id> to Authentication →
 * Settings → Authorized domains.
 */

import { FirebaseError, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'
import type {
  Application,
  ApplicationItem,
  ApplicationPatch,
  NewApplication,
  Profile,
  Streak,
} from '../types'

const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
}

const app = initializeApp(firebaseConfig)

function createAuth() {
  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence })
  } catch {
    return getAuth(app)
  }
}

function createDb(): Firestore {
  try {
    return initializeFirestore(app, { experimentalForceLongPolling: true })
  } catch {
    return getFirestore(app)
  }
}

export const auth = createAuth()
export const db = createDb()

function readEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy .env.example to .env and run npm run build.`,
    )
  }
  return value
}

function nowIso(): string {
  return new Date().toISOString()
}

function requireUid(): string {
  const uid = auth.currentUser?.uid
  if (!uid) {
    throw new Error('Not signed in')
  }
  return uid
}

function assertOwnUid(uid: string): string {
  const current = requireUid()
  if (uid !== current) {
    throw new Error('You can only write your own document')
  }
  return current
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

function itemsCollection(uid: string) {
  return collection(db, 'applications', uid, 'items')
}

function itemDoc(uid: string, appId: string) {
  return doc(db, 'applications', uid, 'items', appId)
}

function streakDoc(uid: string) {
  return doc(db, 'streaks', uid)
}

function profileDoc(uid: string) {
  return doc(db, 'profiles', uid)
}

function asApplicationItem(data: Record<string, unknown>): ApplicationItem {
  return {
    title: String(data.title ?? ''),
    company: String(data.company ?? ''),
    url: String(data.url ?? ''),
    description: String(data.description ?? ''),
    status: (data.status as ApplicationItem['status']) ?? 'to-apply',
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : null,
    notes: String(data.notes ?? ''),
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    ...(typeof data.cvVersionUsed === 'string'
      ? { cvVersionUsed: data.cvVersionUsed }
      : {}),
    ...(typeof data.coverLetterVersionUsed === 'string'
      ? { coverLetterVersionUsed: data.coverLetterVersionUsed }
      : {}),
  }
}

export function isAuthWindow(): boolean {
  return new URLSearchParams(location.search).get('auth') === '1'
}

function isToolbarPopup(): boolean {
  return location.pathname.includes('/popup/') && !isAuthWindow()
}

async function openAuthWindow(): Promise<void> {
  const url = `${chrome.runtime.getURL('src/popup/index.html')}?auth=1`
  await chrome.windows.create({
    url,
    type: 'popup',
    width: 480,
    height: 640,
    focused: true,
  })
}

async function ready(): Promise<void> {
  await auth.authStateReady()
}

export function formatAuthError(
  error: unknown,
  fallback = 'Sign-in failed.',
): string {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/unauthorized-domain') {
      return 'Add chrome-extension://<this-extension-id> to Firebase Authentication → Settings → Authorized domains. Copy the ID from chrome://extensions or edge://extensions.'
    }
    if (error.code === 'auth/popup-closed-by-user') {
      return 'Sign-in was cancelled.'
    }
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

export async function signInWithGooglePopup(): Promise<User> {
  await ready()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signIn(): Promise<User | null> {
  await ready()
  if (isToolbarPopup()) {
    await openAuthWindow()
    return null
  }
  return signInWithGooglePopup()
}

export async function signOut(): Promise<void> {
  await ready()
  await firebaseSignOut(auth)
}

export async function getCurrentUser(): Promise<User | null> {
  await ready()
  return auth.currentUser
}

export function subscribeToAuth(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback)
}

export async function addApplication(input: NewApplication): Promise<string> {
  await ready()
  const uid = requireUid()
  const createdAt = nowIso()
  const ref = await addDoc(
    itemsCollection(uid),
    omitUndefined({
      ...input,
      createdAt,
      updatedAt: createdAt,
    }),
  )
  return ref.id
}

export async function updateApplication(
  appId: string,
  patch: ApplicationPatch,
): Promise<void> {
  await ready()
  const uid = requireUid()
  await updateDoc(
    itemDoc(uid, appId),
    omitUndefined({
      ...patch,
      updatedAt: nowIso(),
    }),
  )
}

export async function deleteApplication(appId: string): Promise<void> {
  await ready()
  const uid = requireUid()
  await deleteDoc(itemDoc(uid, appId))
}

export async function listApplications(uid: string): Promise<Application[]> {
  await ready()
  const snapshot = await getDocs(
    query(itemsCollection(uid), orderBy('createdAt', 'desc')),
  )
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...asApplicationItem(document.data()),
  }))
}

export async function getStreak(uid: string): Promise<Streak | null> {
  await ready()
  const snapshot = await getDoc(streakDoc(uid))
  if (!snapshot.exists()) {
    return null
  }
  const data = snapshot.data()
  return {
    currentStreak: Number(data.currentStreak ?? 0),
    lastActivityDate:
      typeof data.lastActivityDate === 'string' ? data.lastActivityDate : null,
    applicationsThisWeek: Number(data.applicationsThisWeek ?? 0),
  }
}

export async function updateStreak(
  uid: string,
  patch: Partial<Streak>,
): Promise<void> {
  await ready()
  assertOwnUid(uid)
  await setDoc(streakDoc(uid), omitUndefined({ ...patch }), { merge: true })
}

export async function getProfile(uid: string): Promise<Profile | null> {
  await ready()
  const snapshot = await getDoc(profileDoc(uid))
  if (!snapshot.exists()) {
    return null
  }
  const data = snapshot.data()
  return {
    baseCV: String(data.baseCV ?? ''),
    reusableBullets: Array.isArray(data.reusableBullets)
      ? data.reusableBullets.map((item) => String(item))
      : [],
    displayName: String(data.displayName ?? ''),
  }
}

export async function updateProfile(
  uid: string,
  patch: Partial<Profile>,
): Promise<void> {
  await ready()
  assertOwnUid(uid)
  await setDoc(profileDoc(uid), omitUndefined({ ...patch }), { merge: true })
}
