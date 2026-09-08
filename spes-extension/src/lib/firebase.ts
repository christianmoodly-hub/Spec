/**
 * Firebase Auth + Firestore.
 *
 * Use only firebase/auth/web-extension here. Mixing it with firebase/auth
 * (browser) causes auth/argument-error in chrome-extension:// pages.
 *
 * Google sign-in: chrome.identity.launchWebAuthFlow, then
 * GoogleAuthProvider.credential + signInWithCredential.
 * signInWithPopup is not in the web-extension Auth bundle.
 *
 * The toolbar popup dies when it loses focus, so OAuth still starts in a
 * real window (popup.html?auth=1). Add chrome-extension://<extension-id>
 * to Authentication → Settings → Authorized domains, and add
 * chrome.identity.getRedirectURL() to the Web OAuth client's redirect URIs.
 */

import { FirebaseError, initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth/web-extension'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
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
import {
  applyNewApplication,
  asDateKey,
  streakNeedsPersist,
  viewStreak,
} from './streak'

const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID'),
}

const app = initializeApp(firebaseConfig)

export type { User }

function createAuth() {
  try {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
    })
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

function asStreak(data: Record<string, unknown>): Streak {
  const last =
    typeof data.lastActivityDate === 'string' ? data.lastActivityDate : null
  return {
    currentStreak: Number(data.currentStreak ?? 0),
    lastActivityDate: asDateKey(last),
    applicationsThisWeek: Number(data.applicationsThisWeek ?? 0),
  }
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

export function getGoogleSignInSetup(): {
  extensionId: string
  redirectUri: string
} {
  return {
    extensionId: chrome.runtime.id,
    redirectUri: chrome.identity.getRedirectURL(),
  }
}

function isCancelledAuthError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('did not approve') ||
    lower.includes('user rejected') ||
    lower.includes('cancelled') ||
    lower.includes('canceled')
  )
}

export function formatAuthError(
  error: unknown,
  fallback = 'Sign-in failed.',
): string {
  if (error instanceof FirebaseError) {
    if (error.code === 'auth/unauthorized-domain') {
      return 'Add chrome-extension://<this-extension-id> to Firebase Authentication → Settings → Authorized domains. Copy the ID from chrome://extensions or edge://extensions.'
    }
    if (error.code === 'auth/argument-error') {
      return 'Google sign-in failed to start. Reload the unpacked dist/ folder after rebuilding.'
    }
    return error.message
  }
  if (error instanceof Error) {
    if (isCancelledAuthError(error.message)) {
      return 'Google sign-in was cancelled.'
    }
    const lower = error.message.toLowerCase()
    if (
      lower.includes('redirect_uri') ||
      lower.includes('redirect uri') ||
      lower.includes('invalid request')
    ) {
      return `Add this redirect URI to the Google Web OAuth client, then retry: ${getGoogleSignInSetup().redirectUri}`
    }
    return error.message
  }
  return fallback
}

async function launchGoogleAuthFlow(url: string): Promise<string> {
  const responseUrl = await new Promise<string | undefined>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url, interactive: true },
      (result) => {
        const lastError = chrome.runtime.lastError
        if (lastError?.message) {
          reject(new Error(lastError.message))
          return
        }
        resolve(result)
      },
    )
  })
  if (!responseUrl) {
    throw new Error('Google sign-in was cancelled.')
  }
  return responseUrl
}

function parseGoogleIdToken(responseUrl: string): string {
  const parsed = new URL(responseUrl)
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ''))
  for (const [key, value] of parsed.searchParams) {
    if (!params.has(key)) {
      params.set(key, value)
    }
  }
  const oauthError = params.get('error')
  if (oauthError) {
    throw new Error(params.get('error_description') ?? oauthError)
  }
  const idToken = params.get('id_token')
  if (!idToken) {
    throw new Error(
      `Google did not return an ID token. Add this redirect URI to the Web OAuth client: ${getGoogleSignInSetup().redirectUri}`,
    )
  }
  return idToken
}

async function signInWithGoogle(): Promise<User> {
  await ready()
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID?.trim()
  if (!clientId) {
    throw new Error(
      'Missing VITE_GOOGLE_WEB_CLIENT_ID. Add it to .env, run npm run build, then click Reload on this extension in chrome://extensions or edge://extensions. Load the dist/ folder in both browsers.',
    )
  }
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'id_token',
      redirect_uri: getGoogleSignInSetup().redirectUri,
      scope: 'openid email profile',
      nonce: crypto.randomUUID(),
      prompt: 'select_account',
    }).toString()
  const responseUrl = await launchGoogleAuthFlow(authUrl)
  const credential = GoogleAuthProvider.credential(parseGoogleIdToken(responseUrl))
  const result = await signInWithCredential(auth, credential)
  return result.user
}

export async function signIn(): Promise<User | null> {
  await ready()
  if (isToolbarPopup()) {
    await openAuthWindow()
    return null
  }
  return signInWithGoogle()
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
  await recordOwnApplicationActivity()
  return ref.id
}

async function recordOwnApplicationActivity(): Promise<void> {
  const uid = requireUid()
  const ref = streakDoc(uid)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const stored = snapshot.exists() ? asStreak(snapshot.data()) : null
    transaction.set(ref, applyNewApplication(stored))
  })
}

export async function syncOwnStreakDecay(): Promise<void> {
  await ready()
  const uid = auth.currentUser?.uid
  if (!uid) {
    return
  }
  const stored = await getStreak(uid)
  if (!stored) {
    return
  }
  const viewed = viewStreak(stored)
  if (streakNeedsPersist(stored, viewed)) {
    await updateStreak(uid, viewed)
  }
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

export function subscribeToApplications(
  uid: string,
  onNext: (items: Application[]) => void,
  onError?: (error: unknown) => void,
): () => void {
  const itemsQuery = query(itemsCollection(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(
    itemsQuery,
    (snapshot) => {
      onNext(
        snapshot.docs.map((document) => ({
          id: document.id,
          ...asApplicationItem(document.data()),
        })),
      )
    },
    (error) => {
      onError?.(error)
    },
  )
}

export async function getStreak(uid: string): Promise<Streak | null> {
  await ready()
  const snapshot = await getDoc(streakDoc(uid))
  if (!snapshot.exists()) {
    return null
  }
  return asStreak(snapshot.data())
}

export function subscribeToStreaks(
  onNext: (byUid: Record<string, Streak>) => void,
  onError?: (error: unknown) => void,
): () => void {
  return onSnapshot(
    collection(db, 'streaks'),
    (snapshot) => {
      const byUid: Record<string, Streak> = {}
      for (const document of snapshot.docs) {
        byUid[document.id] = asStreak(document.data())
      }
      onNext(byUid)
    },
    (error) => {
      onError?.(error)
    },
  )
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
