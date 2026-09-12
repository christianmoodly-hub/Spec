# Spes extension

Private Manifest V3 Chrome/Edge extension for tracking job applications (two users). Firebase Auth, Firestore, and Gemini job extraction are wired.

## Requirements

- Node.js 20+
- Google Chrome and/or Microsoft Edge

## Scripts

```bash
npm install
npm run dev      # Vite + CRXJS HMR (load dist/ once, then leave this running)
npm run build    # production bundle into dist/
npm run watch    # rebuild dist/ on file changes
```

Copy `.env.example` to `.env` and fill in the Firebase web app keys, `VITE_GOOGLE_WEB_CLIENT_ID` (Google sign-in), and `VITE_GEMINI_API_KEY` (Google AI Studio) for generic page extraction. Vite inlines `VITE_*` values at build time — change `.env`, then rebuild.

Load the unpacked extension from the `dist/` folder after a build (or after `npm run dev` has written `dist/`).

## Load unpacked — Chrome

1. Run `npm run build` (or start `npm run dev`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select `spes-extension/dist`.
6. Click the Spes icon in the toolbar to open the popup. On the extension card, click **Details → Extension options** for the options page.

## Load unpacked — Microsoft Edge

Same bundle; Edge is Chromium and uses this Manifest V3 package as-is.

1. Run `npm run build` (or start `npm run dev`).
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select `spes-extension/dist`.
6. Pin Spes and open the popup, or open **Details → Extension options**.

After code changes: `npm run build` (or keep `npm run dev` / `npm run watch` running), then click **Reload** on the extension card in **each** browser. Chrome and Edge keep separate copies; rebuilding does not update Edge until you reload it.

Use `npm run build` and load `dist/` for daily use. `npm run dev` can open a localhost window during sign-in — that is Vite HMR, not the production extension.

Chrome and Edge unpacked IDs are different. Repeat the authorized-domain and redirect-URI steps with the ID shown on `edge://extensions` (`chrome-extension://<edge-id>` and `https://<edge-id>.chromiumapp.org/`). The Google Web client ID in `.env` is shared; do not copy it again.

## Firebase

Use your own Firebase project. Do not commit `.env`, `dist/`, or `dist.zip` — Vite inlines keys into the built bundle.

### Google sign-in

Auth uses `firebase/auth/web-extension` plus `chrome.identity.launchWebAuthFlow` (not the browser `signInWithPopup` path). The toolbar popup still opens a real window (`src/popup/index.html?auth=1`) so the OAuth flow is not killed when the toolbar popup closes.

1. Firebase Console → Authentication → Settings → Authorized domains — add:

   `chrome-extension://<your-extension-id>`

   Copy the ID from the extension card on `chrome://extensions` or `edge://extensions`. Missing this fails with `auth/unauthorized-domain`.

2. Firebase Console → Authentication → Sign-in method → Google → Web client ID. Put it in `.env` as `VITE_GOOGLE_WEB_CLIENT_ID` and rebuild.

3. Google Cloud Console → APIs & Services → Credentials → the **same Web** OAuth client → Authorized redirect URIs — add:

   `https://<your-extension-id>.chromiumapp.org/`

   That is `chrome.identity.getRedirectURL()`. `getAuthToken` is not used; it would need a separate Chrome-extension OAuth client.

### Firestore rules

`firestore.rules` lets a user read/write only their own `applications/{uid}/items` and `profiles/{uid}`. Any signed-in user can read `streaks`; only the owner can write their streak doc.

Deploy from `spes-extension/`:

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Until rules are deployed, console test-mode/default rules still apply.

### Gemini (generic fallback)

LinkedIn and Indeed use DOM parsers. Other sites send selected/visible text to Gemini from the **background worker** (the key is not injected into the page). Add `VITE_GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey) and rebuild. Extraction always opens the Add application form for review — nothing is auto-saved.

### Due-date reminders

The service worker does **not** query Firestore. MV3 workers sleep constantly; Firebase Auth is often not ready in time for an alarm, and Firestore listeners die with the worker.

Instead the popup's Firestore snapshot writes `to-apply` items that have a due date into `chrome.storage.local`. The worker reads that cache:

- on install, on browser startup, and every 3 hours (`chrome.alarms`)
- badge = count due within 3 days (including overdue)
- notification = overdue or due today, once per item per calendar day

Open the popup after signing in so the cache stays current.

## Permissions (Phase 1 tradeoff)

Declared in `manifest.json`:

| Permission | Why |
| --- | --- |
| `storage` | Local reminder cache and extension state. |
| `notifications` | Due-today / overdue alerts (to-apply items). |
| `alarms` | Recheck due dates every 3 hours while Chrome is running. |
| `activeTab` | Temporary access to the tab you invoked the extension on. |
| `scripting` | Inject the generic fallback content script **on demand**. |
| `identity` | Google sign-in via `launchWebAuthFlow`. |
| Host: `https://*.linkedin.com/*`, `https://*.indeed.com/*` | Auto-inject LinkedIn/Indeed content scripts. |
| Host: Google / Firebase APIs | Auth + Firestore from extension pages. |

**Not declared:** `<all_urls>`.

The generic fallback script (`src/content-scripts/generic-fallback.ts`) is bundled but **not** listed under `content_scripts`. It is injected with `chrome.scripting.executeScript` after a user gesture (popup **Capture this page**, or the on-page panel). That keeps the extension from reading every page you visit.

Tradeoff vs `<all_urls>`:

- **This setup (chosen):** smaller footprint; fallback extraction only works after you click the extension on that tab. LinkedIn/Indeed still get automatic content-script injection.
- **`<all_urls>`:** fallback could run on every site with no extra click, but the extension could read any page. Too broad for a two-person tool.

`scripting` is still a privileged API. It is narrower than standing host access to the whole web, and we need it for on-demand injection.

Indeed country domains (`indeed.co.uk`, etc.) are not included yet — only `*.indeed.com`.

## Layout

```
spes-extension/
  manifest.json
  src/
    background/          service worker
    content-scripts/     linkedin, indeed, on-demand generic-fallback
    popup/               React popup + Google sign-in window
    options/             React options (base CV / profile later)
    lib/                 firebase.ts, gemini.ts, capture helpers, types re-export
    types.ts             shared data-model types
```
